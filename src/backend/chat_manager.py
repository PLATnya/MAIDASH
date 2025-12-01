from langchain_community.llms import Ollama
from langchain_core.prompts import PromptTemplate
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from db_manager import vectorize_all_data

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
    retriever = vectorstore.as_retriever(search_type="mmr", search_kwargs={"k": 5})
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

if __name__ == "__main__":
    question = input("You: ").strip()
    print("Initializing QA chain with Ollama...")
    vectorstore = vectorize_all_data()
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