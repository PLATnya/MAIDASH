
from pathlib import Path
from langchain_community.document_loaders import TextLoader, DirectoryLoader
def load_documents(data_dir: str = "data"):
    """Load all text files from the data directory."""
    data_path = Path(data_dir)
    
    if not data_path.exists():
        print(f"Warning: '{data_dir}' directory does not exist. Creating it...")
        data_path.mkdir(exist_ok=True)
        return []
    
    # Load all text files from the directory (fresh load, no caching)
    loader = DirectoryLoader(
        data_dir,
        glob="**/*.txt",
        loader_cls=TextLoader,
        show_progress=False
    )
    
    try:
        documents = loader.load()
        if not documents:
            print(f"Warning: No .txt files found in '{data_dir}' directory.")
            print("Please add some .txt files to the data folder for RAG to work.")
        return documents
    except Exception as e:
        print(f"Error loading documents: {e}")
        return []