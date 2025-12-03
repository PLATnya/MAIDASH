from langchain_ollama import ChatOllama
from db_manager import get_vector_store_async, load_config, wait_for_vectorization_if_ongoing, update_vectors_async
from typing import Dict, Any
import json
from langchain.agents import create_agent
from langchain_core.tools import StructuredTool
from langchain_core.messages import HumanMessage

def create_rag_agent(vectorstore, config: Dict[str, Any] = None):
    """
    Create a RAG agent using LangChain agent framework with retrieval tool.
    
    Args:
        vectorstore: ChromaDB vectorstore instance
        config: Configuration dictionary (if None, loads from config.json)
    
    Returns:
        Agent executor for question answering with RAG
    """
    # Load config if not provided
    if config is None:
        config = load_config()
    
    # Get LLM settings from config
    llm_config = config.get("llm", {})
    model_name = llm_config.get("model_name", "deepseek-v3.1:671b-cloud")
    temperature = llm_config.get("temperature", 0.7)
    
    # Initialize Ollama model
    # New API requires ChatOllama (chat model), old API can use OllamaLLM

    llm = ChatOllama(model=model_name, temperature=temperature)
    # Get retriever settings from config
    retriever_config = config.get("retriever", {})
    search_type = retriever_config.get("search_type", "similarity")
    search_kwargs = retriever_config.get("search_kwargs", {"k": 5})
    
    # Create retriever
    retriever = vectorstore.as_retriever(
        search_type=search_type,
        search_kwargs=search_kwargs
    )
    
    # Create custom retrieval tool using StructuredTool
    # This works better with the new LangChain 1.1.0 agent API
    def search_documents(query: str) -> str:
        """Search through documents to find information relevant to the question.
        
        Args:
            query: The search query to find relevant documents.
            
        Returns:
            A string containing the relevant document contents separated by newlines.
        """
        docs = retriever.invoke(query)
        # Combine document contents with separators
        result = "\n-----------------------------------------\n".join([doc.page_content for doc in docs])
        return result
    
    retrieval_tool = StructuredTool.from_function(
        func=search_documents,
        name="document_search",
        description="Search through documents to find information relevant to the question. Use this tool when you need to find specific information from the knowledge base. Input should be a search query string."
    )

    # LangChain 1.1.0+ API - use create_agent which returns a graph
    system_prompt = """You are a helpful assistant that answers questions using information from a knowledge base.
When you need information to answer a question, use the document_search tool to retrieve relevant documents.
Answer as short as possible, don't be verbose.
If you don't know the answer based on the retrieved documents, just say that you don't know, don't try to make up an answer."""
    
    # Create agent graph using new API
    agent_graph = create_agent(
        model=llm,
        tools=[retrieval_tool],
        system_prompt=system_prompt,
        interrupt_before=[],  # Don't interrupt before any steps
        interrupt_after=[],   # Don't interrupt after any steps
        debug=False
    )
    
    return agent_graph


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
        
        # Wait for vectorization to complete if it's currently running
        await wait_for_vectorization_if_ongoing()
        
        # Load config
        config = load_config()
        
        # Initialize vectorstore
        vectorstore = await get_vector_store_async(config=config)
        
        # Create RAG agent
        agent_executor = create_rag_agent(vectorstore, config=config)
        
        # Stream the answer
        def generate_response():
            full_answer = ""
            try:
                input_data = {"messages": [HumanMessage(content=query)]}

                
                # Stream agent execution
                for chunk in agent_executor.stream(input_data):
                    # The graph streams state updates
                    for node_name, node_output in chunk.items():
                        if node_name == "agent" and "messages" in node_output:
                            # Extract messages from agent node
                            messages = node_output.get("messages", [])
                            for msg in messages:
                                if hasattr(msg, 'content') and msg.content:
                                    content = str(msg.content)
                                    if content and content.strip():
                                        full_answer += content
                                        yield json.dumps({"type": "token", "content": content}) + "\n"
                        elif "messages" in node_output:
                            # Check other nodes for messages
                            messages = node_output.get("messages", [])
                            for msg in messages:
                                if hasattr(msg, 'content') and msg.content:
                                    content = str(msg.content)
                                    if content and content.strip():
                                        full_answer += content
                                        yield json.dumps({"type": "token", "content": content}) + "\n"

                
                # If no streaming tokens were captured, invoke synchronously and stream manually
                if not full_answer:
                    result = agent_executor.invoke(input_data)
                    # Extract final message from graph result
                    if "messages" in result:
                        for msg in result["messages"]:
                            if hasattr(msg, 'content') and msg.content:
                                output = str(msg.content)
                                if output:
                                    for char in output:
                                        full_answer += char
                                        yield json.dumps({"type": "token", "content": char}) + "\n"

                
                # Send final answer summary
                yield json.dumps({"type": "done", "answer": full_answer}) + "\n"
            except Exception as e:
                yield json.dumps({"type": "error", "message": str(e)}) + "\n"
        
        return generate_response()
    except Exception as e:
        raise ErrorProcessingQuestionError(f"Error processing question: {str(e)}")


async def ask_question_cli(query):
    # Wait for vectorization to complete if it's currently running
    await wait_for_vectorization_if_ongoing()
    
    # Load config once
    config = load_config()
    
    vectorstore = await get_vector_store_async(config=config)
    agent_executor = create_rag_agent(vectorstore, config=config)

    print("Thinking...\nBot: ", end="", flush=True)
    
    # Stream the answer tokens
    full_answer = ""
    sources = set()
    
    try:
        input_data = {"messages": [HumanMessage(content=query)]}
        
        # Stream agent execution
        for chunk in agent_executor.stream(input_data):
            for node_name, node_output in chunk.items():
                if node_name == "agent" and "messages" in node_output:
                    messages = node_output.get("messages", [])
                    for msg in messages:
                        if hasattr(msg, 'content') and msg.content:
                            content = str(msg.content)
                            if content and content.strip():
                                print(content, end="", flush=True)
                                full_answer += content
                elif "messages" in node_output:
                    messages = node_output.get("messages", [])
                    for msg in messages:
                        if hasattr(msg, 'content') and msg.content:
                            content = str(msg.content)
                            if content and content.strip():
                                print(content, end="", flush=True)
                                full_answer += content
        
        # If no streaming output, invoke synchronously
        if not full_answer:
            result = agent_executor.invoke(input_data)
            if "messages" in result:
                for msg in result["messages"]:
                    if hasattr(msg, 'content') and msg.content:
                        output = str(msg.content)
                        if output:
                            print(output, end="", flush=True)
                            full_answer = output
        
        print()  # New line after streaming
        
        # Extract sources from intermediate steps if available
        # Note: With agent, sources are harder to extract directly
        # The agent uses the retrieval tool internally
        if sources:
            print("\n[Sources used:]")
            for i, source in enumerate(list(sources)[:2], 1):
                print(f"  {i}. {source}")
    except Exception as e:
        print(f"\nError: {str(e)}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(update_vectors_async())
    
    question = input("You: ").strip()
    print("Initializing QA chain with Ollama...")

    
    asyncio.run(ask_question_cli(question))