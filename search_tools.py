#!/usr/bin/env python3
"""
Console web search tool using Tavily API
Takes a query from console input and prints search results
"""

import os
from tavily import TavilyClient
from dotenv import load_dotenv

def search_with_tavily(query: str, api_key: str = None, max_results: int = 10):
    """
    Perform web search using Tavily API.
    
    Args:
        query: Search query string
        api_key: Tavily API key (if None, tries to get from TAVILY_API_KEY env var)
        max_results: Maximum number of results to return
    
    Returns:
        List of search results
    """
    load_dotenv()
    # Get API key from environment variable if not provided
    if api_key is None:
        api_key = os.getenv("TAVILY_API_KEY")
    
    if not api_key:
        raise ValueError(
            "Tavily API key not found. Please set TAVILY_API_KEY environment variable "
            "or pass api_key parameter. Get your API key from https://tavily.com"
        )
    
    # Initialize Tavily client
    client = TavilyClient(api_key=api_key)
    
    # Perform search
    response = client.search(
        query=query,
        max_results=max_results,
        search_depth="advanced"  # Can be "basic" or "advanced"
    )
    
    return response.get("results", [])


def print_search_results(results: list, query: str):
    """Print search results in a formatted way."""
    print("\n" + "=" * 80)
    print(f"Search Results for: '{query}'")
    print("=" * 80)
    
    if not results:
        print("\nNo results found.")
        return
    
    print(f"\nFound {len(results)} result(s):\n")
    
    for i, result in enumerate(results, 1):
        print(f"{'─' * 80}")
        print(f"\n[{i}] {result.get('title', 'No title')}")
        print(f"URL: {result.get('url', 'No URL')}")
        
        # Print content/snippet
        content = result.get('content', '')
        if content:
            # Truncate long content
            if len(content) > 300:
                content = content[:300] + "..."
            print(f"\nContent:\n{content}")
        
        # Print score if available
        if 'score' in result:
            print(f"\nRelevance Score: {result['score']:.4f}")
        
        print()


def main():
    """Main function to run the console search tool."""
    print("=" * 80)
    print("Tavily Web Search Tool")
    print("=" * 80)
    print("\nType 'quit' or 'exit' to end the session.\n")
    
    while True:
        try:
            # Get query from user
            query = input("Enter search query: ").strip()
            
            if query.lower() in ['quit', 'exit', 'q']:
                print("\nGoodbye!")
                break
            
            if not query:
                print("Please enter a valid search query.\n")
                continue
            
            # Perform search
            print(f"\nSearching for: '{query}'...")
            try:
                results = search_with_tavily(query, max_results=10)
                print_search_results(results, query)
            except ValueError as e:
                print(f"\nError: {e}\n")
            except Exception as e:
                print(f"\nError performing search: {e}\n")
            
        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"\nUnexpected error: {e}\n")


if __name__ == "__main__":
    main()

