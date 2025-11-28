import os
from langchain_neo4j import Neo4jGraph

from langchain_text_splitters import TokenTextSplitter
from langchain_community.llms import Ollama
from langchain_experimental.graph_transformers import LLMGraphTransformer
from dotenv import load_dotenv
from neo4j_viz.neo4j import from_neo4j

from neo4j import Auth, Result, RoutingControl
from neo4j import GraphDatabase
from file_tools import load_documents


def visualize_graph(graph):
    """Visualize the graph using the Neo4j Browser."""
    print("Visualizing graph...")
    print(graph)



def create_graph(graph):
    raw_documents = load_documents()

    # Define chunking strategy
    text_splitter = TokenTextSplitter(chunk_size=512, chunk_overlap=24)
    documents = text_splitter.split_documents(raw_documents[:3])


    llm = Ollama(model="deepseek-v3.1:671b-cloud", temperature=0)
    llm_transformer = LLMGraphTransformer(llm=llm)

    # Extract graph data
    graph_documents = llm_transformer.convert_to_graph_documents(documents)

    # Store to neo4j
    graph.add_graph_documents(
        graph_documents, 
        baseEntityLabel=True, 
        include_source=True
    )
    print("Graph created")

def main():
    load_dotenv()

    URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")

    # Get credentials from environment variables
    username = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER")
    password = os.getenv("NEO4J_PASSWORD")
    
    # Create auth object if credentials are provided
    # Memgraph doesn't require auth by default, Neo4j usually does
    auth = None
    if username and password:
        auth = (username, password)
    elif password:
        # Some setups only need password with default username "neo4j"
        auth = ("neo4j", password)


    print("Querying graph for visualization...")
    result = None
    with GraphDatabase.driver(URI, auth=auth) as driver:
        driver.verify_connectivity()

        result = driver.execute_query(
            "MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 100",
            database_="neo4j",
            routing_=RoutingControl.READ,
            result_transformer_=Result.graph,
        )

    print("Rendering visualization...")
    VG = from_neo4j(result)
    html_obj = VG.render()
    
    # Save to HTML file
    output_file = "graph_visualization.html"
    try:
        # Extract HTML content from the render result
        if hasattr(html_obj, 'data'):
            html_content = html_obj.data
        elif hasattr(html_obj, '_repr_html_'):
            html_content = html_obj._repr_html_()
        elif isinstance(html_obj, str):
            html_content = html_obj
        else:
            # Try to get the HTML representation
            html_content = str(html_obj)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"Visualization saved to {output_file}")
        print(f"Open {output_file} in your browser to view the graph.")
    except Exception as e:
        print(f"Error saving visualization to file: {e}")
        print("Trying alternative method...")
        # Alternative: try to get HTML directly
        try:
            html_content = html_obj._repr_html_() if hasattr(html_obj, '_repr_html_') else str(html_obj)
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
            print(f"Visualization saved to {output_file}")
        except Exception as e2:
            print(f"Could not save to file: {e2}")
            print("Visualization rendered but not saved. Display it in Jupyter notebook instead.")

if __name__ == "__main__":
    main()