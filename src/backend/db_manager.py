from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from typing import List, Dict, Any
import json
from pathlib import Path
from langchain_community.document_loaders import PDFMinerLoader
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
import os
from dotenv import load_dotenv
import uuid
import sys
import shutil

# Default config path
CONFIG_PATH = Path(__file__).parent / "config.json"

def load_config(config_path: Path = None) -> Dict[str, Any]:
    """
    Load configuration from JSON file.
    
    Args:
        config_path: Path to config file (defaults to config.json in same directory)
    
    Returns:
        Dictionary containing configuration
    """
    if config_path is None:
        config_path = CONFIG_PATH
    
    if not config_path.exists():
        # Return default config if file doesn't exist
        return {
            "llm": {
                "model_name": "deepseek-v3.1:671b-cloud",
                "temperature": 0.7
            },
            "retriever": {
                "search_type": "similarity",
                "search_kwargs": {
                    "k": 5
                }
            },
            "embedding": {
                "model_name": "mxbai-embed-large:latest"
            },
            "database": {
                "persist_directory": "chroma_db"
            },
            "text_splitter": {
                "chunk_size": 1000,
                "chunk_overlap": 200
            }
        }
    
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def clear_chroma_db(persist_directory: str = "chroma_db"):
    """
    Delete the ChromaDB persistence directory to clear all data.
    
    Args:
        persist_directory: Path to the ChromaDB persistence directory
    """
    persist_path = Path(persist_directory)
    if persist_path.exists():
        shutil.rmtree(persist_path)
        print(f"ChromaDB database cleared (deleted {persist_directory}).")
    else:
        print(f"ChromaDB directory {persist_directory} does not exist (nothing to clear).")

def vectorize_document_chunks(
    documents: List[Document], 
    collection_name: str = None,
    persist_directory: str = None,
    clear_existing: bool = True,
    config: Dict[str, Any] = None
):
    """
    Create a fresh vector store in ChromaDB from documents using Ollama embeddings.
    
    Args:
        documents: List of documents to store
        collection_name: Optional collection name (will generate unique name if not provided)
        persist_directory: Directory to persist ChromaDB data (defaults to config value)
        clear_existing: Whether to clear existing database before creating new one (default: True)
        config: Configuration dictionary (if None, loads from config.json)
    
    Returns:
        Chroma vectorstore instance
    """
    if not documents:
        return None
    
    # Load config if not provided
    if config is None:
        config = load_config()
    
    # Load environment variables
    load_dotenv()
    
    # Get persist_directory from config if not provided
    if persist_directory is None:
        persist_directory = config.get("database", {}).get("persist_directory", "chroma_db")
    
    # Clear existing database if requested
    if clear_existing:
        clear_chroma_db(persist_directory)
    
    # Get embedding model from config
    embedding_model = config.get("embedding", {}).get("model_name", "mxbai-embed-large:latest")
    
    # Create embeddings using Ollama
    print("Creating embeddings with Ollama...")
    print(f"Using embedding model: {embedding_model}")
    embeddings = OllamaEmbeddings(model=embedding_model)
    
    # Use unique collection name to avoid persistence conflicts
    if not collection_name:
        collection_name = f"collection_{uuid.uuid4().hex[:8]}"
    
    print(f"Creating ChromaDB vector store with collection: {collection_name}...")
    print(f"Persist directory: {persist_directory}")
    
    # Create ChromaDB vector store
    vectorstore = Chroma.from_documents(
        documents=documents,
        embedding=embeddings,
        collection_name=collection_name,
        persist_directory=persist_directory
    )
    
    print(f"ChromaDB vector store created with {len(documents)} document chunks\n")
    return vectorstore

def split_and_combine_for_embedding(
    documents: List[Document] = None,
    texts: List[str] = None,
    chunk_size: int = None,
    chunk_overlap: int = None,
    length_function=len,
    config: Dict[str, Any] = None
) -> List[Document]:
    """
    Split documents and/or strings using RecursiveCharacterTextSplitter 
    and combine the results for embedding.
    
    Args:
        documents: List of Document objects to split
        texts: List of strings to split (will be converted to Documents)
        chunk_size: Maximum size of chunks (defaults to config value)
        chunk_overlap: Overlap between chunks (defaults to config value)
        length_function: Function to calculate length (default: len)
        config: Configuration dictionary (if None, loads from config.json)
    
    Returns:
        List of Document chunks ready for embedding
    """
    # Load config if not provided
    if config is None:
        config = load_config()
    
    # Get text splitter settings from config
    text_splitter_config = config.get("text_splitter", {})
    if chunk_size is None:
        chunk_size = text_splitter_config.get("chunk_size", 1000)
    if chunk_overlap is None:
        chunk_overlap = text_splitter_config.get("chunk_overlap", 200)
    
    # Initialize the text splitter
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=length_function,
    )
    
    all_documents = []
    
    # Add documents if provided
    if documents:
        all_documents.extend(documents)
    
    # Add texts if provided (convert to Documents first)
    if texts:
        text_documents = [Document(page_content=text) for text in texts]
        all_documents.extend(text_documents)
    
    if not all_documents:
        return []
    
    return text_splitter.split_documents(all_documents)

data_json_path = Path(__file__).parent.parent.parent / "data" / "data.json"
def build_text_from_data_json() -> str:
    """
    Iterates through "texts" in data/data.json and builds a combined text.
    Each text starts with "Fact {id}: {label}".
    For each linkage, adds a sentence describing the relationship.
    
    Args:
        data_json_path: Path to the data.json file (default: "data/data.json")
    
    Returns:
        Combined text string with all facts and their relationships
    """
    # Load the JSON file
    json_path = Path(data_json_path)
    if not json_path.exists():
        raise FileNotFoundError(f"Data file not found: {data_json_path}")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    texts = data.get("texts", [])
    result_lines = []
    
    # Iterate through each text entry
    for text_entry in texts:
        node_id = text_entry.get("node_id", "")
        label = text_entry.get("label", "")
        
        # Start with "Fact {id}: {label}"
        fact_line = f"Fact {node_id}: {label}"
        result_lines.append(fact_line)
        
        # Process linked nodes
        linked_nodes = text_entry.get("linked_nodes", [])
        for linked_node in linked_nodes:
            linked_node_id = linked_node.get("node_id", "")
            linkage_label = linked_node.get("linkage_label", "")
            
            # Build relationship sentence
            if linkage_label and linkage_label.strip():
                # Use the linkage_label if it exists
                relation_sentence = f"Fact {node_id} {linkage_label} fact {linked_node_id}"
            else:
                # Use "related" if no linkage_label
                relation_sentence = f"Fact {node_id} related to fact {linked_node_id}"
            
            result_lines.append(relation_sentence)
    
    # Join all lines with newlines
    return "\n".join(result_lines)


def build_pdf_from_data_json() -> List[Document]:
    """
    Iterates through "files" in data/data.json and loads PDF documents.
    Each document's text starts with "Fact {node_id}: ".
    For each linkage, adds a sentence at the end describing the relationship.
    
    Returns:
        List of Document objects with modified text including fact prefix and relationships
    """
    
    json_path = Path(data_json_path)
    if not json_path.exists():
        raise FileNotFoundError(f"Data file not found: {data_json_path}")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    files = data.get("files", [])
    
    result_documents = []

    for file_entry in files:
        if file_entry.get("file_type", "").lower() == ".pdf":
            file_path = file_entry.get("path", "")
            node_id = file_entry.get("node_id", "")
            linked_nodes = file_entry.get("linked_nodes", [])
            
            if file_path and node_id:
                try:
                    loader = PDFMinerLoader(file_path)
                    loaded_documents = loader.load()
                    
                    # Build relationship sentences
                    relationship_sentences = []
                    for linked_node in linked_nodes:
                        linked_node_id = linked_node.get("node_id", "")
                        linkage_label = linked_node.get("linkage_label", "")
                        
                        if linked_node_id:
                            if linkage_label and linkage_label.strip():
                                # Use the linkage_label if it exists
                                relation_sentence = f"Fact {node_id} {linkage_label} fact {linked_node_id}."
                            else:
                                # Use "related" if no linkage_label
                                relation_sentence = f"Fact {node_id} related to fact {linked_node_id}."
                            
                            relationship_sentences.append(relation_sentence)

                    # Modify each document to add prefix and suffix
                    for doc in loaded_documents:
                        # Prepend "Fact {node_id}: " to the document text
                        original_text = doc.page_content
                        prefixed_text = f"Fact {node_id}: {original_text}"
                        
                        # Append relationship sentences at the end
                        if relationship_sentences:
                            relationship_text = " ".join(relationship_sentences)
                            final_text = f"{prefixed_text}. {relationship_text}"
                        else:
                            final_text = prefixed_text
                        
                        # Create a new document with modified text, preserving metadata
                        modified_doc = Document(
                            page_content=final_text,
                            metadata=doc.metadata
                        )
                        result_documents.append(modified_doc)
                        
                except Exception as e:
                    print(f"Could not process PDF {file_entry.get('filename', '')}: {e}")

    return result_documents


def vectorize_all_data(config: Dict[str, Any] = None) -> None:
    texts = build_text_from_data_json()
    pdfs = build_pdf_from_data_json()
    return vectorize_document_chunks(split_and_combine_for_embedding(pdfs, [texts]), config=config)

if __name__ == "__main__":
    if "--clear" in sys.argv:
        print("Clearing ChromaDB database...")
        clear_chroma_db()
    else:
        vectorize_all_data()