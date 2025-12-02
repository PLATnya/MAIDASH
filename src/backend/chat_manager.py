from langchain_ollama import OllamaLLM
from langchain_core.prompts import PromptTemplate
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from db_manager import get_vector_store_async, load_config
from typing import Dict, Any
import json

def create_qa_chain(vectorstore, config: Dict[str, Any] = None):
    """
    Create a Retrieval QA chain using Ollama LLM.
    
    Args:
        vectorstore: ChromaDB vectorstore instance
        config: Configuration dictionary (if None, loads from config.json)
    
    Returns:
        QA chain for question answering
    """
    # Load config if not provided
    if config is None:
        config = load_config()
    
    # Get LLM settings from config
    llm_config = config.get("llm", {})
    model_name = llm_config.get("model_name", "deepseek-v3.1:671b-cloud")
    temperature = llm_config.get("temperature", 0.7)
    
    # Initialize Ollama LLM
    llm = OllamaLLM(model=model_name, temperature=temperature)
    
    # Create a custom prompt template
    prompt_template = """Use the following pieces of context to answer the question at the end. 
    Answer as small as possible, don't be verbose.
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
    
    # Get retriever settings from config
    retriever_config = config.get("retriever", {})
    search_type = retriever_config.get("search_type", "similarity")
    search_kwargs = retriever_config.get("search_kwargs", {"k": 5})
    
    # Create retrieval chain
    retriever = vectorstore.as_retriever(
        search_type=search_type,
        search_kwargs=search_kwargs
    )
    qa_chain = create_retrieval_chain(retriever, document_chain)
    
    return qa_chain


# def mmr_search(question, vectordb, model_name: str = "deepseek-v3.1:671b-cloud"):
#     """
#     Perform MMR search and question answering on the vector store.

#     Args:
#     question (str): User's question.
#     vectordb (Chroma): Vector store with embedded documents.

#     Returns:
#     str: Answer to the user's question.
#     """
#     llm = Ollama(model=model_name, temperature=0.7)
#     compressor = LLMChainExtractor.from_llm(llm)
#     compression_retriever = ContextualCompressionRetriever(
#         base_compressor=compressor,
#         base_retriever=vectordb.as_retriever()
#     )
#     compressed_docs = compression_retriever.invoke(question)
#     return question_answering(llm, compressed_docs, vectordb, question)

class NoQueryError(Exception):
    pass

class ErrorProcessingQuestionError(Exception):
    pass

async def ask_question_stream(query):
    try:
        if not query:
            raise NoQueryError()
        
        # Load config
        config = load_config()
        
        # Initialize vectorstore
        vectorstore = await get_vector_store_async(config=config)
        
        # Create QA chain
        qa_chain = create_qa_chain(vectorstore, config=config)
        
        # Stream the answer
        def generate_response():
            full_answer = ""
            try:
                for chunk in qa_chain.stream({"input": query}):
                    if "answer" in chunk:
                        answer_token = chunk["answer"]
                        if answer_token:
                            full_answer += answer_token
                            # Send each token as JSON
                            yield json.dumps({"type": "token", "content": answer_token}) + "\n"
                    
                    # if "context" in chunk and chunk["context"]:
                    #     # Send context info if available
                    #     context_docs = chunk["context"]
                    #     sources = set()
                    #     for doc in context_docs:
                    #         if hasattr(doc, 'metadata'):
                    #             source = doc.metadata.get('source', 'Unknown')
                    #             sources.add(source)
                    #     if sources:
                    #         sources_list = list(sources)[:5]  # Limit to 5 sources
                    #         yield json.dumps({"type": "sources", "sources": sources_list}) + "\n"
                
                # Send final answer summary
                yield json.dumps({"type": "done", "answer": full_answer}) + "\n"
            except Exception as e:
                yield json.dumps({"type": "error", "message": str(e)}) + "\n"
        
        return generate_response()
    except Exception as e:
        raise ErrorProcessingQuestionError(f"Error processing question: {str(e)}")


async def ask_question_cli(query):
        # Load config once
    config = load_config()
    
    vectorstore = await get_vector_store_async(config=config)
    qa_chain = create_qa_chain(vectorstore, config=config)

    print("Thinking...\nBot: ", end="", flush=True)
    
    # Stream the answer tokens
    full_answer = ""
    context_docs = None
    
    for chunk in qa_chain.stream({"input": query}):
        # The chunk structure from retrieval chain can vary:
        # - Some chunks have "answer" with token strings
        # - Some chunks have "context" with documents
        # - Answer tokens are streamed incrementally
        if "answer" in chunk:
            answer_token = chunk["answer"]
            # Only print if it's a new token (not empty)
            if answer_token:
                print(answer_token, end="", flush=True)
                full_answer += answer_token
        
        # Capture context documents (may appear in any chunk)
        if "context" in chunk and chunk["context"]:
            context_docs = chunk["context"]
    
    print()  # New line after streaming
    
    # Optionally show source documents
    if context_docs:
        print("\n[Sources used:]")
        # Extract unique sources from context documents
        sources = set()
        for doc in context_docs:
            if hasattr(doc, 'metadata'):
                source = doc.metadata.get('source', 'Unknown')
                sources.add(source)
        for i, source in enumerate(list(sources)[:2], 1):
            print(f"  {i}. {source}")


# if __name__ == "__main__":
#     # update_vectors()
#     # update_vectors()
#     # question = input("You: ").strip()
#     # print("Initializing QA chain with Ollama...")

#     # ask_question_cli(question)