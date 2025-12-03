from langchain_ollama import ChatOllama
from db_manager import get_vector_store_async, load_config, wait_for_vectorization_if_ongoing, update_vectors_async
from typing import Dict, Any, Optional
import json
import os
from langchain.agents import create_agent
from langchain_core.tools import StructuredTool
from langchain_core.messages import HumanMessage
from langchain.messages import AIMessage, AIMessageChunk
try:
    from tavily import TavilyClient
except ImportError:
    TavilyClient = None

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
        description="Retrieves relevant document chunks from the knowledge base. This tool ONLY retrieves context - you must use this retrieved context to generate your own answer. Do NOT return the raw tool output as your answer. Input should be a search query string."
    )
    
    # Create Tavily web search tool as fallback
    tools = [retrieval_tool]
    tavily_config = config.get("tavily", {})
    tavily_api_key = tavily_config.get("api_key") if tavily_config.get("api_key") else os.getenv("TAVILY_API_KEY")
    
    if TavilyClient and tavily_api_key:
        def search_web(query: str) -> str:
            """Search the web using Tavily to find current information when documents don't contain the answer.
            
            Args:
                query: The search query to find information on the web.
                
            Returns:
                A string containing relevant web search results with content and URLs.
            """
            try:
                tavily_client = TavilyClient(api_key=tavily_api_key)
                response = tavily_client.search(
                    query=query,
                    search_depth="advanced",
                    max_results=5,
                    include_answer=True,
                    include_raw_content=False
                )
                
                # Format the response
                results = []
                if response.get("answer"):
                    results.append(f"Answer: {response['answer']}")
                
                if response.get("results"):
                    results.append("\nSources:")
                    for i, result in enumerate(response["results"][:5], 1):
                        title = result.get("title", "No title")
                        content = result.get("content", "")
                        url = result.get("url", "")
                        results.append(f"\n{i}. {title}")
                        if content:
                            results.append(f"   {content[:300]}...")  # Limit content length
                        if url:
                            results.append(f"   URL: {url}")
                
                return "\n".join(results) if results else "No results found."
            except Exception as e:
                return f"Error searching web: {str(e)}"
        
        tavily_tool = StructuredTool.from_function(
            func=search_web,
            name="web_search",
            description="Search the web for current information when the document_search tool doesn't provide sufficient information to answer the question. Use this tool ONLY when document_search fails to find relevant information. This tool returns web search results - use them as context to generate your answer, do NOT return the raw tool output."
        )
        tools.append(tavily_tool)

    # LangChain 1.1.0+ API - use create_agent which returns a graph
    if len(tools) > 1:
        # Has Tavily web search available
        system_prompt = """You are a helpful assistant that answers questions using information from a knowledge base and web search.

WORKFLOW:
1. ALWAYS use the document_search tool FIRST to retrieve relevant context from the knowledge base
2. The document_search tool returns raw document chunks - these are CONTEXT, not your answer
3. Evaluate if the retrieved documents contain sufficient information to answer the question
4. If the documents don't contain enough information or the answer is unclear, use the web_search tool to find current information from the web
5. After receiving context (from documents and/or web), synthesize and generate your own answer based on that context
6. DO NOT simply return or repeat the tool output - you must process it and provide a proper answer

IMPORTANT: 
- Tool outputs are context for you to use, not the final answer
- Use web_search ONLY when document_search doesn't provide sufficient information
- You must read the retrieved information and then provide a synthesized answer to the user's question

Answer as short as possible, don't be verbose.
If you don't know the answer after searching both documents and web, just say that you don't know, don't try to make up an answer."""
    else:
        # Only document search available
        system_prompt = """You are a helpful assistant that answers questions using information from a knowledge base.

WORKFLOW:
1. ALWAYS use the document_search tool FIRST to retrieve relevant context from the knowledge base
2. The document_search tool returns raw document chunks - these are CONTEXT, not your answer
3. After receiving the context, synthesize and generate your own answer based on that context
4. DO NOT simply return or repeat the tool output - you must process it and provide a proper answer

IMPORTANT: The document_search tool output is context for you to use, not the final answer. You must read the retrieved documents and then provide a synthesized answer to the user's question.

Answer as short as possible, don't be verbose.
If you don't know the answer based on the retrieved documents, just say that you don't know, don't try to make up an answer."""
    
    # Create agent graph using new API
    agent_graph = create_agent(
        model=llm,
        tools=tools,
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
        answer_stream = config.get("answer_stream", False)

        # Initialize vectorstore
        vectorstore = await get_vector_store_async(config=config)
        
        # Create RAG agent
        agent_executor = create_rag_agent(vectorstore, config=config)
        
        # Stream the answer
        def generate_response():
            full_answer = ""
            try:
                input_data = {"messages": [HumanMessage(content=query)]}

                if answer_stream:
                    for chunk, metadata in agent_executor.stream(input_data, stream_mode="messages"):
                        if isinstance(chunk, AIMessageChunk):
                            content = chunk.content
                            if content and content.strip():
                                full_answer += content
                                yield json.dumps({"type": "token", "content": content}) + "\n"
                # If no streaming tokens were captured, invoke synchronously and stream manually
                else:
                    result = agent_executor.invoke(input_data)
                    # Extract final message from graph result
                    if "messages" in result:
                        for msg in result["messages"]:
                            if isinstance(msg, AIMessage) and msg.content:
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
    answer_stream = config.get("answer_stream", False)

    vectorstore = await get_vector_store_async(config=config)
    agent_executor = create_rag_agent(vectorstore, config=config)

    print("Thinking...\nBot: ", end="", flush=True)
    
    # Stream the answer tokens
    full_answer = ""
    
    try:
        input_data = {"messages": [HumanMessage(content=query)]}
        if answer_stream:
        # Stream agent execution
            for chunk, metadata in agent_executor.stream(input_data, stream_mode="messages"):
                if isinstance(chunk, AIMessageChunk):
                    content = chunk.content
                    if content and content.strip():
                        print(content, end="", flush=True)
                        full_answer += content
        else:
            result = agent_executor.invoke(input_data)
            if "messages" in result:
                for msg in result["messages"]:
                    if isinstance(msg, AIMessage) and msg.content:
                        output = str(msg.content)
                        if output:
                            print(output, end="", flush=True)
                            full_answer = output
        
        print()  # New line after streaming

    except Exception as e:
        print(f"\nError: {str(e)}")


if __name__ == "__main__":
    import asyncio
    #asyncio.run(update_vectors_async())
    
    question = input("You: ").strip()
    print("Initializing QA chain with Ollama...")

    
    asyncio.run(ask_question_cli(question))