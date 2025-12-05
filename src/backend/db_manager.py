from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_community.document_loaders import PDFMinerLoader
from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma
from typing import List, Dict, Any, Optional, Callable
from pathlib import Path
import json
import uuid
import shutil
import asyncio
import traceback
from dotenv import load_dotenv

# ============================================================================
# Constants
# ============================================================================

CONFIG_PATH = Path(__file__).parent / "config.json"
DATA_JSON_PATH = Path(__file__).parent / "data" / "data.json"
FACT_PREFIX = "Fact"
DEFAULT_RELATIONSHIP = "related to"
OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_EMBEDDING_MODEL = "mxbai-embed-large:latest"
DEFAULT_PERSIST_DIRECTORY = "chroma_db"
DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 200

# ============================================================================
# Configuration Management
# ============================================================================

def load_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Load configuration from JSON file.
    
    Args:
        config_path: Path to config file (defaults to config.json in same directory)
    
    Returns:
        Dictionary containing configuration with default values if file doesn't exist
    """
    if config_path is None:
        config_path = CONFIG_PATH
    
    if not config_path.exists():
        return _get_default_config()
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Warning: Error loading config file: {e}. Using default configuration.")
        return _get_default_config()


def _get_default_config() -> Dict[str, Any]:
    """Return default configuration dictionary."""
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
            "model_name": DEFAULT_EMBEDDING_MODEL
        },
        "database": {
            "persist_directory": DEFAULT_PERSIST_DIRECTORY
        },
        "text_splitter": {
            "chunk_size": DEFAULT_CHUNK_SIZE,
            "chunk_overlap": DEFAULT_CHUNK_OVERLAP
        }
    }

# ============================================================================
# Relationship Building Utilities
# ============================================================================

def _build_relationship_sentence(
    node_id: str,
    linked_node_id: str,
    linkage_label: Optional[str] = None,
    include_period: bool = False
) -> str:
    """
    Build a relationship sentence between two facts.
    
    Args:
        node_id: ID of the source node
        linked_node_id: ID of the linked node
        linkage_label: Optional label describing the relationship
        include_period: Whether to include a period at the end
    
    Returns:
        Formatted relationship sentence
    """
    if linkage_label and linkage_label.strip():
        relationship = linkage_label
    else:
        relationship = DEFAULT_RELATIONSHIP
    
    sentence = f"{FACT_PREFIX} {node_id} {relationship} {FACT_PREFIX.lower()} {linked_node_id}"
    
    if include_period:
        sentence += "."
    
    return sentence


def _build_relationship_sentences(
    node_id: str,
    linked_nodes: List[Dict[str, Any]],
    include_period: bool = False
) -> List[str]:
    """
    Build relationship sentences for all linked nodes.
    
    Args:
        node_id: ID of the source node
        linked_nodes: List of linked node dictionaries with 'node_id' and 'linkage_label'
        include_period: Whether to include periods at the end of sentences
    
    Returns:
        List of relationship sentences
    """
    sentences = []
    for linked_node in linked_nodes:
        linked_node_id = linked_node.get("node_id", "")
        linkage_label = linked_node.get("linkage_label")
        
        if linked_node_id:
            sentence = _build_relationship_sentence(
                node_id, linked_node_id, linkage_label, include_period
            )
            sentences.append(sentence)
    
    return sentences

# ============================================================================
# Data File Operations
# ============================================================================

def clear_data_folder() -> None:
    """Delete all files from the 'data' directory (excluding subdirectories)."""
    data_dir = DATA_JSON_PATH.parent
    
    if not data_dir.exists() or not data_dir.is_dir():
        print(f"'data' directory not found at: {data_dir.resolve()}")
        return

    removed = 0
    for item in data_dir.iterdir():
        if item.is_file():
            try:
                item.unlink()
                removed += 1
            except Exception as e:
                print(f"Could not delete {item}: {e}")
    
    print(f"Cleared {removed} files from '{data_dir.resolve()}'.")


def _load_data_json() -> Dict[str, Any]:
    """
    Load data from data.json file.
    
    Returns:
        Dictionary with 'texts' and 'files' keys
    
    Raises:
        FileNotFoundError: If data.json doesn't exist
    """
    if not DATA_JSON_PATH.exists():
        raise FileNotFoundError(f"Data file not found: {DATA_JSON_PATH}")
    
    with open(DATA_JSON_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

# ============================================================================
# Document Building from Data JSON
# ============================================================================

def build_text_from_data_json() -> str:
    """
    Build combined text from "texts" in data/data.json.
    
    Each text starts with "Fact {id}: {label}".
    For each linkage, adds a sentence describing the relationship.
    
    Returns:
        Combined text string with all facts and their relationships
    
    Raises:
        FileNotFoundError: If data.json doesn't exist
    """
    data = _load_data_json()
    texts = data.get("texts", [])
    result_lines = []
    
    for text_entry in texts:
        node_id = text_entry.get("node_id", "")
        label = text_entry.get("label", "")
        
        # Start with "Fact {id}: {label}"
        fact_line = f"{FACT_PREFIX} {node_id}: {label}"
        result_lines.append(fact_line)
        
        # Add relationship sentences
        linked_nodes = text_entry.get("linked_nodes", [])
        relationship_sentences = _build_relationship_sentences(node_id, linked_nodes)
        result_lines.extend(relationship_sentences)
    
    return "\n".join(result_lines)


def build_pdf_from_data_json() -> List[Document]:
    """
    Build Document objects from PDF files in data/data.json.
    
    Each document's text starts with "Fact {node_id}: ".
    For each linkage, adds a sentence at the end describing the relationship.
    
    Returns:
        List of Document objects with modified text including fact prefix and relationships
    
    Raises:
        FileNotFoundError: If data.json doesn't exist
    """
    data = _load_data_json()
    files = data.get("files", [])
    result_documents = []

    for file_entry in files:
        if file_entry.get("file_type", "").lower() != ".pdf":
            continue
        
        file_path = file_entry.get("path", "")
        node_id = file_entry.get("node_id", "")
        linked_nodes = file_entry.get("linked_nodes", [])
        
        if not file_path or not node_id:
            continue
        
        try:
            loader = PDFMinerLoader(file_path)
            loaded_documents = loader.load()
            
            # Build relationship sentences
            relationship_sentences = _build_relationship_sentences(
                node_id, linked_nodes, include_period=True
            )
            relationship_text = " ".join(relationship_sentences) if relationship_sentences else ""
            
            # Modify each document to add prefix and suffix
            for doc in loaded_documents:
                original_text = doc.page_content
                prefixed_text = f"{FACT_PREFIX} {node_id}: {original_text}"
                
                # Append relationship sentences at the end
                if relationship_text:
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
            filename = file_entry.get('filename', 'unknown')
            print(f"Could not process PDF {filename}: {e}")

    return result_documents

# ============================================================================
# Text Splitting
# ============================================================================

def split_and_combine_for_embedding(
    documents: Optional[List[Document]] = None,
    texts: Optional[List[str]] = None,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
    length_function: Callable[[str], int] = len,
    config: Optional[Dict[str, Any]] = None
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
    if config is None:
        config = load_config()
    
    # Get text splitter settings from config
    text_splitter_config = config.get("text_splitter", {})
    if chunk_size is None:
        chunk_size = text_splitter_config.get("chunk_size", DEFAULT_CHUNK_SIZE)
    if chunk_overlap is None:
        chunk_overlap = text_splitter_config.get("chunk_overlap", DEFAULT_CHUNK_OVERLAP)
    
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

# ============================================================================
# ChromaDB Operations
# ============================================================================

def clear_chroma_db(persist_directory: str = DEFAULT_PERSIST_DIRECTORY) -> None:
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

# ============================================================================
# Embedding and Vector Store Creation
# ============================================================================

def _create_embeddings(config: Dict[str, Any]) -> OllamaEmbeddings:
    """
    Create and test Ollama embeddings instance.
    
    Args:
        config: Configuration dictionary
    
    Returns:
        Configured OllamaEmbeddings instance
    """
    embedding_model = config.get("embedding", {}).get("model_name", DEFAULT_EMBEDDING_MODEL)
    
    print("Creating embeddings with Ollama...")
    print(f"Using embedding model: {embedding_model}")
    
    embeddings = OllamaEmbeddings(
        model=embedding_model,
        num_ctx=4096,
        base_url=OLLAMA_BASE_URL,
    )
    
    # Test embedding connection before processing all documents
    print("Testing embedding connection...")
    try:
        test_embedding = embeddings.embed_query("test")
        print(f"Embedding connection successful. Vector dimension: {len(test_embedding)}")
    except Exception as e:
        print(f"Warning: Embedding test failed: {e}")
        print("Continuing anyway, but embeddings may fail...")
    
    return embeddings


async def _create_vector_store_async(
    documents: List[Document],
    embeddings: OllamaEmbeddings,
    collection_name: str
) -> Chroma:
    """
    Create a ChromaDB vector store from documents.
    
    Args:
        documents: List of Document objects to vectorize
        embeddings: Embeddings instance
        collection_name: Name for the ChromaDB collection
    
    Returns:
        ChromaDB vector store instance
    
    Raises:
        Exception: If vector store creation fails
    """
    print(f"Creating ChromaDB vector store with collection: {collection_name}...")
    print(f"Processing {len(documents)} document chunks...")
    
    try:
        if hasattr(Chroma, 'afrom_documents'):
            print("Using async afrom_documents method...")
            return await Chroma.afrom_documents(
                documents=documents,
                embedding=embeddings,
                collection_name=collection_name,
            )
        else:
            # Fallback: run sync version in executor
            print("Using sync from_documents in executor...")
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None,
                lambda: Chroma.from_documents(
                    documents=documents,
                    embedding=embeddings,
                    collection_name=collection_name,
                )
            )
    except asyncio.CancelledError:
        print("Vectorization cancelled during document embedding")
        raise
    except Exception as e:
        error_msg = f"Error creating vector store: {e}"
        print(error_msg)
        print(f"Error type: {type(e).__name__}")
        print(f"Traceback: {traceback.format_exc()}")
        raise Exception(error_msg) from e


async def vectorize_document_chunks_async(
    documents: List[Document],
    collection_name: Optional[str] = None,
    persist_directory: Optional[str] = None,
    clear_existing: bool = True,
    config: Optional[Dict[str, Any]] = None
) -> Optional[Chroma]:
    """
    Create a fresh vector store in ChromaDB from documents.
    
    This can be cancelled using asyncio.Task.cancel()
    
    Args:
        documents: List of Document objects to vectorize
        collection_name: Optional collection name (generated if not provided)
        persist_directory: Optional persist directory path
        clear_existing: Whether to clear existing database
        config: Optional configuration dictionary
    
    Returns:
        ChromaDB vector store instance or None if documents list is empty
    """
    if not documents:
        return None
    
    if config is None:
        config = load_config()
    
    load_dotenv()
    
    if persist_directory is None:
        persist_directory = config.get("database", {}).get("persist_directory", DEFAULT_PERSIST_DIRECTORY)
    
    # Clear existing database if requested
    if clear_existing:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, clear_chroma_db, persist_directory)
    
    # Create embeddings
    embeddings = _create_embeddings(config)
    
    # Use unique collection name
    if not collection_name:
        collection_name = f"collection_{uuid.uuid4().hex[:8]}"
    
    # Create vector store
    vector_store = await _create_vector_store_async(documents, embeddings, collection_name)
    print(f"ChromaDB vector store created with {len(documents)} document chunks\n")
    
    return vector_store

# ============================================================================
# Vector Store Manager (Encapsulates Global State)
# ============================================================================

class VectorStoreManager:
    """
    Manages vector store state and vectorization tasks.
    
    This class encapsulates the global state that was previously managed
    through module-level variables.
    """
    
    def __init__(self):
        self._vector_store: Optional[Chroma] = None
        self._current_task: Optional[asyncio.Task] = None
    
    @property
    def vector_store(self) -> Optional[Chroma]:
        """Get the current vector store instance."""
        return self._vector_store
    
    async def update_vectors(self, config: Optional[Dict[str, Any]] = None) -> Optional[Chroma]:
        """
        Update vectors with async cancellation support.
        
        Args:
            config: Optional configuration dictionary
        
        Returns:
            Updated vector store instance or None if cancelled
        """
        # Cancel previous task if running
        if self._current_task and not self._current_task.done():
            print("Cancelling previous vectorization task...")
            self._current_task.cancel()
            try:
                await self._current_task
            except asyncio.CancelledError:
                print("Previous vectorization task cancelled successfully")
        
        # Start new task
        if config is None:
            config = load_config()
        
        self._current_task = asyncio.create_task(
            self._vectorize_all_data(config=config)
        )
        
        try:
            result = await self._current_task
            return result
        except asyncio.CancelledError:
            print("Vectorization task was cancelled")
            return None
    
    async def wait_for_vectorization(self) -> None:
        """Wait for vectorization task to complete if it's currently running."""
        if self._current_task and not self._current_task.done():
            try:
                await self._current_task
            except asyncio.CancelledError:
                # Task was cancelled, continue
                pass
    
    async def get_vector_store(self, config: Optional[Dict[str, Any]] = None) -> Chroma:
        """
        Get or create vector store instance.
        
        Args:
            config: Optional configuration dictionary
        
        Returns:
            ChromaDB vector store instance
        """
        # Wait for in-progress task if any
        if self._current_task and not self._current_task.done():
            try:
                self._vector_store = await self._current_task
            except asyncio.CancelledError:
                # Task was cancelled, vector store might be None
                pass
        
        if self._vector_store is None:
            print("Vector store is None, creating new one...")
            if config is None:
                config = load_config()
            self._vector_store = await self._vectorize_all_data(config=config)
        
        return self._vector_store
    
    async def _vectorize_all_data(
        self,
        config: Optional[Dict[str, Any]] = None
    ) -> Optional[Chroma]:
        """
        Vectorize all data from data.json.
        
        Args:
            config: Optional configuration dictionary
        
        Returns:
            ChromaDB vector store instance
        """
        if config is None:
            config = load_config()
        
        # Clean up old vector store
        if self._vector_store is not None:
            try:
                if hasattr(self._vector_store, 'delete_collection'):
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(
                        None,
                        self._vector_store.delete_collection
                    )
            except Exception as e:
                print(f"Error cleaning up old vector store: {e}")
            finally:
                self._vector_store = None
        
        # Build documents (these are sync operations, run in executor)
        loop = asyncio.get_event_loop()
        texts = await loop.run_in_executor(None, build_text_from_data_json)
        pdfs = await loop.run_in_executor(None, build_pdf_from_data_json)
        all_data = await loop.run_in_executor(
            None,
            lambda: split_and_combine_for_embedding(pdfs, [texts])
        )
        
        self._vector_store = await vectorize_document_chunks_async(
            all_data,
            config=config
        )
        
        return self._vector_store

# ============================================================================
# Module-level Instance (Maintains Backward Compatibility)
# ============================================================================

_manager = VectorStoreManager()

# ============================================================================
# Public API (Backward Compatible Functions)
# ============================================================================

def get_buff_vector_store() -> Optional[Chroma]:
    """Get the buffered vector store (backward compatibility)."""
    return _manager.vector_store


async def update_vectors_async() -> Optional[Chroma]:
    """
    Update vectors with async cancellation support (backward compatibility).
    
    Returns:
        Updated vector store instance or None if cancelled
    """
    return await _manager.update_vectors()


async def wait_for_vectorization_if_ongoing() -> None:
    """Wait for vectorization task to complete if it's currently running (backward compatibility)."""
    await _manager.wait_for_vectorization()


async def get_vector_store_async(config: Optional[Dict[str, Any]] = None) -> Chroma:
    """
    Get or create vector store instance (backward compatibility).
    
    Args:
        config: Optional configuration dictionary
    
    Returns:
        ChromaDB vector store instance
    """
    return await _manager.get_vector_store(config)


def on_data_updated() -> None:
    """
    Called when data.json is updated - triggers async update (backward compatibility).
    
    Note: This function handles both sync and async contexts.
    """
    try:
        loop = asyncio.get_running_loop()
        # We're already in an async context, create task
        asyncio.create_task(_manager.update_vectors())
    except RuntimeError:
        # No event loop running, create new one
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_manager.update_vectors())
        loop.close()
