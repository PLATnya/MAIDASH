from langchain_ollama import ChatOllama
from langchain.agents import create_agent
from langchain_core.tools import StructuredTool
from langchain_core.messages import HumanMessage
from langchain.messages import AIMessage, AIMessageChunk
from langchain_chroma import Chroma
from tavily import TavilyClient
from typing import Dict, Any, Optional, Iterator, Generator
import json
import os
from dotenv import load_dotenv

from db_manager import get_vector_store_async, load_config, wait_for_vectorization_if_ongoing

# ============================================================================
# Constants
# ============================================================================

DEFAULT_MODEL_NAME = "deepseek-v3.1:671b-cloud"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_SEARCH_TYPE = "similarity"
DEFAULT_SEARCH_K = 5
DEFAULT_TAVILY_MAX_RESULTS = 5
DEFAULT_TAVILY_SEARCH_DEPTH = "advanced"
DEFAULT_CONTENT_PREVIEW_LENGTH = 300
DOCUMENT_SEPARATOR = "\n-----------------------------------------\n"

# System Prompts
SYSTEM_PROMPT_WITH_WEB_SEARCH = """You are a helpful assistant that answers questions using information from a knowledge base and web search.

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

SYSTEM_PROMPT_DOCUMENT_ONLY = """You are a helpful assistant that answers questions using information from a knowledge base.

WORKFLOW:
1. ALWAYS use the document_search tool FIRST to retrieve relevant context from the knowledge base
2. The document_search tool returns raw document chunks - these are CONTEXT, not your answer
3. After receiving the context, synthesize and generate your own answer based on that context
4. DO NOT simply return or repeat the tool output - you must process it and provide a proper answer

IMPORTANT: The document_search tool output is context for you to use, not the final answer. You must read the retrieved documents and then provide a synthesized answer to the user's question.

Answer as short as possible, don't be verbose.
If you don't know the answer based on the retrieved documents, just say that you don't know, don't try to make up an answer."""

# ============================================================================
# Custom Exceptions
# ============================================================================

class NoQueryError(Exception):
    """Raised when a query is empty or None."""
    pass


class ErrorProcessingQuestionError(Exception):
    """Raised when there's an error processing a question."""
    pass


class ErrorSearchingError(Exception):
    """Raised when there's an error performing a web search."""
    pass

# ============================================================================
# LLM and Retriever Configuration
# ============================================================================

def _create_llm(config: Dict[str, Any]) -> ChatOllama:
    """
    Create and configure ChatOllama LLM instance.
    
    Args:
        config: Configuration dictionary
    
    Returns:
        Configured ChatOllama instance
    """
    llm_config = config.get("llm", {})
    model_name = llm_config.get("model_name", DEFAULT_MODEL_NAME)
    temperature = llm_config.get("temperature", DEFAULT_TEMPERATURE)
    
    return ChatOllama(model=model_name, temperature=temperature)


def _create_retriever(vectorstore: Chroma, config: Dict[str, Any]):
    """
    Create a retriever from vectorstore with configuration.
    
    Args:
        vectorstore: ChromaDB vectorstore instance
        config: Configuration dictionary
    
    Returns:
        Configured retriever instance
    """
    retriever_config = config.get("retriever", {})
    search_type = retriever_config.get("search_type", DEFAULT_SEARCH_TYPE)
    search_kwargs = retriever_config.get("search_kwargs", {"k": DEFAULT_SEARCH_K})
    
    return vectorstore.as_retriever(
        search_type=search_type,
        search_kwargs=search_kwargs
    )

# ============================================================================
# Tool Creation
# ============================================================================

def _create_document_search_tool(retriever) -> StructuredTool:
    """
    Create a document search tool for the RAG agent.
    
    Args:
        retriever: Retriever instance for document search
    
    Returns:
        StructuredTool configured for document search
    """
    def search_documents(query: str) -> str:
        """Search through documents to find information relevant to the question.
        
        Args:
            query: The search query to find relevant documents.
            
        Returns:
            A string containing the relevant document contents separated by newlines.
        """
        docs = retriever.invoke(query)
        result = DOCUMENT_SEPARATOR.join([doc.page_content for doc in docs])
        return result
    
    return StructuredTool.from_function(
        func=search_documents,
        name="document_search",
        description="Retrieves relevant document chunks from the knowledge base. This tool ONLY retrieves context - you must use this retrieved context to generate your own answer. Do NOT return the raw tool output as your answer. Input should be a search query string."
    )


def _create_web_search_tool(tavily_api_key: str, max_results: int = DEFAULT_TAVILY_MAX_RESULTS) -> StructuredTool:
    """
    Create a web search tool using Tavily API.
    
    Args:
        tavily_api_key: Tavily API key
        max_results: Maximum number of results to return
    
    Returns:
        StructuredTool configured for web search
    """
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
                search_depth=DEFAULT_TAVILY_SEARCH_DEPTH,
                max_results=max_results,
                include_answer=True,
                include_raw_content=False
            )
            
            # Format the response
            results = []
            if response.get("answer"):
                results.append(f"Answer: {response['answer']}")
            
            if response.get("results"):
                results.append("\nSources:")
                for i, result in enumerate(response["results"][:max_results], 1):
                    title = result.get("title", "No title")
                    content = result.get("content", "")
                    url = result.get("url", "")
                    results.append(f"\n{i}. {title}")
                    if content:
                        results.append(f"   {content[:DEFAULT_CONTENT_PREVIEW_LENGTH]}...")
                    if url:
                        results.append(f"   URL: {url}")
            
            return "\n".join(results) if results else "No results found."
        except Exception as e:
            return f"Error searching web: {str(e)}"
    
    return StructuredTool.from_function(
        func=search_web,
        name="web_search",
        description="Search the web for current information when the document_search tool doesn't provide sufficient information to answer the question. Use this tool ONLY when document_search fails to find relevant information. This tool returns web search results - use them as context to generate your answer, do NOT return the raw tool output."
    )


def _get_tavily_api_key(config: Dict[str, Any]) -> Optional[str]:
    """
    Get Tavily API key from config or environment variables.
    
    Args:
        config: Configuration dictionary
    
    Returns:
        Tavily API key or None if not found
    """
    tavily_config = config.get("tavily", {})
    api_key = tavily_config.get("api_key") or os.getenv("TAVILY_API_KEY")
    return api_key


def _create_tools(vectorstore: Chroma, config: Dict[str, Any]) -> list:
    """
    Create all tools for the RAG agent.
    
    Args:
        vectorstore: ChromaDB vectorstore instance
        config: Configuration dictionary
    
    Returns:
        List of StructuredTool instances
    """
    retriever = _create_retriever(vectorstore, config)
    tools = [_create_document_search_tool(retriever)]
    
    # Add web search tool if Tavily is available
    tavily_api_key = _get_tavily_api_key(config)
    if TavilyClient and tavily_api_key:
        tools.append(_create_web_search_tool(tavily_api_key))
    
    return tools

# ============================================================================
# Agent Creation
# ============================================================================

def create_rag_agent(vectorstore: Chroma, config: Optional[Dict[str, Any]] = None):
    """
    Create a RAG agent using LangChain agent framework with retrieval tool.
    
    Args:
        vectorstore: ChromaDB vectorstore instance
        config: Configuration dictionary (if None, loads from config.json)
    
    Returns:
        Agent executor for question answering with RAG
    """
    if config is None:
        config = load_config()
    
    # Create LLM
    llm = _create_llm(config)
    
    # Create tools
    tools = _create_tools(vectorstore, config)
    
    # Select system prompt based on available tools
    system_prompt = (
        SYSTEM_PROMPT_WITH_WEB_SEARCH if len(tools) > 1 
        else SYSTEM_PROMPT_DOCUMENT_ONLY
    )
    
    # Create agent graph using LangChain 1.1.0+ API
    agent_graph = create_agent(
        model=llm,
        tools=tools,
        system_prompt=system_prompt,
        interrupt_before=[],
        interrupt_after=[],
        debug=False
    )
    
    return agent_graph

# ============================================================================
# Streaming Response Handling
# ============================================================================

def _extract_ai_message_content(result: Dict[str, Any]) -> Optional[str]:
    """
    Extract AI message content from agent execution result.
    
    Args:
        result: Result dictionary from agent execution
    
    Returns:
        Content string or None if not found
    """
    if "messages" not in result:
        return None
    
    for msg in result["messages"]:
        if isinstance(msg, AIMessage) and msg.content:
            return str(msg.content)
    
    return None


def _stream_agent_response(
    agent_executor,
    query: str,
    answer_stream: bool
) -> Iterator[str]:
    """
    Stream agent response tokens.
    
    Args:
        agent_executor: Agent executor instance
        query: User query string
        answer_stream: Whether to use native streaming
    
    Yields:
        Content tokens as strings
    """
    input_data = {"messages": [HumanMessage(content=query)]}
    
    if answer_stream:
        # Use native streaming
        for chunk, metadata in agent_executor.stream(input_data, stream_mode="messages"):
            if isinstance(chunk, AIMessageChunk):
                content = chunk.content
                if content and content.strip():
                    yield content
    else:
        # Invoke synchronously and stream manually
        result = agent_executor.invoke(input_data)
        output = _extract_ai_message_content(result)
        if output:
            # Stream character by character
            for char in output:
                yield char


def _generate_json_stream_response(
    agent_executor,
    query: str,
    answer_stream: bool
) -> Generator[str, None, None]:
    """
    Generate JSON-formatted streaming response for API.
    
    Args:
        agent_executor: Agent executor instance
        query: User query string
        answer_stream: Whether to use native streaming
    
    Yields:
        JSON-formatted strings with type and content
    """
    full_answer = ""
    try:
        for content in _stream_agent_response(agent_executor, query, answer_stream):
            full_answer += content
            yield json.dumps({"type": "token", "content": content}) + "\n"
        
        # Send final answer summary
        yield json.dumps({"type": "done", "answer": full_answer}) + "\n"
    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"

# ============================================================================
# Question Answering Functions
# ============================================================================

async def ask_question_stream(query: str) -> Generator[str, None, None]:
    """
    Process a question using the QA chain and return streaming JSON response.
    
    Args:
        query: User question string
    
    Returns:
        Generator yielding JSON-formatted response strings
    
    Raises:
        NoQueryError: If query is empty
        ErrorProcessingQuestionError: If there's an error processing the question
    """
    if not query or not query.strip():
        raise NoQueryError()
    
    try:
        # Wait for vectorization to complete if it's currently running
        await wait_for_vectorization_if_ongoing()
        
        # Load config
        config = load_config()
        answer_stream = config.get("answer_stream", False)
        
        # Initialize vectorstore
        vectorstore = await get_vector_store_async(config=config)
        
        # Create RAG agent
        agent_executor = create_rag_agent(vectorstore, config=config)
        
        # Generate streaming response
        return _generate_json_stream_response(agent_executor, query, answer_stream)
        
    except NoQueryError:
        raise
    except Exception as e:
        raise ErrorProcessingQuestionError(f"Error processing question: {str(e)}") from e


async def ask_question_cli(query: str) -> None:
    """
    Process a question and print the answer to console (CLI mode).
    
    Args:
        query: User question string
    """
    # Wait for vectorization to complete if it's currently running
    await wait_for_vectorization_if_ongoing()
    
    # Load config
    config = load_config()
    answer_stream = config.get("answer_stream", False)
    
    # Initialize vectorstore and agent
    vectorstore = await get_vector_store_async(config=config)
    agent_executor = create_rag_agent(vectorstore, config=config)
    
    print("Thinking...\nBot: ", end="", flush=True)
    
    # Stream the answer tokens
    full_answer = ""
    
    try:
        for content in _stream_agent_response(agent_executor, query, answer_stream):
            print(content, end="", flush=True)
            full_answer += content
        
        print()  # New line after streaming
        
    except Exception as e:
        print(f"\nError: {str(e)}")

# ============================================================================
# Web Search Functions
# ============================================================================

async def search_web_tavily(query: str) -> Dict[str, Any]:
    """
    Perform a web search using Tavily API.
    
    Args:
        query: The search query string
    
    Returns:
        Dictionary containing search results with answer, results, and sources
    
    Raises:
        NoQueryError: If query is empty
        ErrorSearchingError: If there's an error performing the search
    """
    if not query or not query.strip():
        raise NoQueryError()
    
    # Load config and environment
    load_dotenv()
    tavily_api_key = os.getenv("TAVILY_API_KEY")
    
    if not TavilyClient:
        raise ErrorSearchingError(
            "Tavily client not available. Please install tavily-python package."
        )
    
    if not tavily_api_key:
        raise ErrorSearchingError(
            "Tavily API key not found. Please set TAVILY_API_KEY environment variable "
            "or configure it in config.json"
        )
    
    try:
        tavily_client = TavilyClient(api_key=tavily_api_key)
        response = tavily_client.search(
            query=query,
            search_depth=DEFAULT_TAVILY_SEARCH_DEPTH,
            max_results=10,
            include_answer=True,
            include_raw_content=False
        )
        
        # Format the response
        result = {
            "answer": response.get("answer", ""),
            "results": [],
            "query": query
        }
        
        if response.get("results"):
            for res in response["results"]:
                result["results"].append({
                    "title": res.get("title", "No title"),
                    "content": res.get("content", ""),
                    "url": res.get("url", ""),
                    "score": res.get("score", 0)
                })
        
        print(result)
        return result
        
    except NoQueryError:
        raise
    except Exception as e:
        raise ErrorSearchingError(f"Error performing web search: {str(e)}") from e

# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import asyncio
    
    question = input("You: ").strip()
    print("Initializing QA chain with Ollama...")
    
    asyncio.run(ask_question_cli(question))
