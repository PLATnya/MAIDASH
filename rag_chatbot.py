#!/usr/bin/env python3
"""
Simple RAG Chatbot using Ollama and LangChain
Loads text files from the 'data' folder and uses RAG to answer questions.
"""

import os
import uuid

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_neo4j import Neo4jVector
from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.llms import Ollama
from langchain_core.prompts import PromptTemplate
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from dotenv import load_dotenv
    
from file_tools import load_documents



def create_vector_store(documents):
    """Create a fresh vector store from documents using Ollama embeddings."""
    if not documents:
        return None
    
    # Split documents into chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )
    
    texts = text_splitter.split_documents(documents)
    print(f"\nSplit documents into {len(texts)} chunks")
    
    # Create embeddings using Ollama
    print("Creating embeddings with Ollama...")
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    
    # Create vector store with unique collection name to avoid persistence
    # Use a unique collection name each time to ensure fresh start
    collection_name = f"temp_collection_{uuid.uuid4().hex[:8]}"
    print("Creating fresh vector store...")
    vectorstore = Chroma.from_documents(
        documents=texts,
        embedding=embeddings,
        collection_name=collection_name
    )
    
    print(f"Vector store created with {len(texts)} document chunks\n")
    return vectorstore


def create_vector_store_neo4j(documents, index_name: str = None, 
                               url: str = None, username: str = None, password: str = None):
    """
    Create a fresh vector store in Neo4j from documents using Ollama embeddings.
    
    Args:
        documents: List of documents to store
        index_name: Optional index name (will generate unique name if not provided)
        url: Neo4j connection URL (defaults to NEO4J_URI env var or bolt://localhost:7687)
        username: Neo4j username (defaults to NEO4J_USERNAME env var)
        password: Neo4j password (defaults to NEO4J_PASSWORD env var)
    
    Returns:
        Neo4jVector instance
    """
    if not documents:
        return None
    
    # Load environment variables
    load_dotenv()
    
    # Split documents into chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )
    
    texts = text_splitter.split_documents(documents)
    print(f"\nSplit documents into {len(texts)} chunks")
    
    # Create embeddings using Ollama
    print("Creating embeddings with Ollama...")
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    
    # Use unique index name to avoid persistence conflicts
    if not index_name:
        index_name = f"vector_index_{uuid.uuid4().hex[:8]}"
    
    # Get connection parameters from args or environment variables
    neo4j_url = url or os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_username = username or os.getenv("NEO4J_USERNAME", "neo4j")
    neo4j_password = password or os.getenv("NEO4J_PASSWORD", "")
    
    print(f"Creating Neo4j vector store with index: {index_name}...")
    print(f"Connecting to Neo4j at: {neo4j_url}")
    
    # Create Neo4j vector store
    vectorstore = Neo4jVector.from_documents(
        documents=texts,
        embedding=embeddings,
        url=neo4j_url,
        username=neo4j_username,
        password=neo4j_password,
        index_name=index_name,
        node_label="DocumentChunk",
        text_node_property="text",
        embedding_node_property="embedding"
    )
    
    print(f"Neo4j vector store created with {len(texts)} document chunks\n")
    return vectorstore

def create_qa_chain(vectorstore, model_name: str = "deepseek-v3.1:671b-cloud"):
    """Create a Retrieval QA chain using Ollama LLM."""
    # Initialize Ollama LLM
    llm = Ollama(model=model_name, temperature=0.7)
    
    # Create a custom prompt template
    prompt_template = """Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say that you don't know, don't try to make up an answer.

Context: {context}

Question: {input}

Answer:"""
    
    prompt = PromptTemplate(
        template=prompt_template,
        input_variables=["context", "input"]
    )
    
    # Create document chain
    document_chain = create_stuff_documents_chain(llm, prompt)
    
    # Create retrieval chain
    retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
    qa_chain = create_retrieval_chain(retriever, document_chain)
    
    return qa_chain

def load_and_get_documents():
    print("\nLoading documents from 'data' folder...")
    documents = load_documents()
    
    if not documents:
        print("\nNo documents found. Exiting.")
        print("Please add some .txt files to the 'data' folder and run again.")
        return None
    return documents


def main():
    """Main function to run the chatbot."""
    print("=" * 60)
    print("RAG Chatbot with Ollama and LangChain")
    print("=" * 60)
    
    # Load documents

    

    
    print("\n" + "=" * 60)
    print("Chatbot ready! Type 'quit' or 'exit' to end the conversation.")
    print("=" * 60 + "\n")
    
    # Chat loop
    while True:
        try:
            question = input("You: ").strip()
            
            if question.lower() in ['quit', 'exit', 'q']:
                print("\nGoodbye!")
                break
            
            if not question:
                continue
            
            print("\nReloading documents and reinitializing vector store and chain...")
            
            # Reload documents fresh from disk on every iteration
            documents = load_and_get_documents()
            if not documents:
                print("No documents found. Skipping this query.")
                continue
            
            # Create fresh vector store from reloaded documents
            vectorstore = create_vector_store_neo4j(documents)
            
            if not vectorstore:
                print("Failed to create vector store. Skipping this query.")
                continue
            
            # Create fresh QA chain on every loop step
            print("Initializing QA chain with Ollama...")
            qa_chain = create_qa_chain(vectorstore)

            print("Thinking...")
            result = qa_chain.invoke({"input": question})
            
            print(f"\nBot: {result['answer']}")
            
            # Optionally show source documents
            if result.get('context'):
                print("\n[Sources used:]")
                # Extract unique sources from context documents
                sources = set()
                for doc in result.get('context', []):
                    if hasattr(doc, 'metadata'):
                        source = doc.metadata.get('source', 'Unknown')
                        sources.add(source)
                for i, source in enumerate(list(sources)[:2], 1):
                    print(f"  {i}. {source}")
            
            # Clean up: delete the vector store to free memory and ensure no persistence
            try:
                if hasattr(vectorstore, 'delete_collection'):
                    vectorstore.delete_collection()
            except:
                pass
            
            print()
            
        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"\nError: {e}\n")


if __name__ == "__main__":
    main()

