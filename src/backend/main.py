from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from pathlib import Path
import shutil
import uvicorn
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

from chat_manager import (
    ErrorProcessingQuestionError,
    NoQueryError,
    ask_question_stream,
    ErrorSearchingError,
    search_web_tavily
)
from db_manager import clear_data_folder, update_vectors_async

# ============================================================================
# Constants
# ============================================================================

DATA_DIR_NAME = "data"
DATA_JSON_FILENAME = "data.json"
DEFAULT_CONTENT_TYPE = "application/octet-stream"
BYTES_PER_MB = 1024 * 1024
STREAMING_MEDIA_TYPE = "application/x-ndjson"

# ============================================================================
# Application Setup
# ============================================================================

app = FastAPI()

# Add CORS middleware to allow cross-origin requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific frontend URL(s)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize data directory
data_dir = Path(__file__).parent / DATA_DIR_NAME
data_dir.mkdir(exist_ok=True)
files_json_path = data_dir / DATA_JSON_FILENAME

# ============================================================================
# Request Models
# ============================================================================

class DeleteFileRequest(BaseModel):
    """Request model for file deletion."""
    filename: str


class LinkedNode(BaseModel):
    """Model representing a linked node relationship."""
    node_id: str
    linkage_label: str


class TextNodeRequest(BaseModel):
    """Request model for text node creation/update."""
    node_id: str
    label: str
    linked_nodes: List[LinkedNode] = []
    color: Optional[str] = None  # Optional color field (hex color code)


class FileNodeRequest(BaseModel):
    """Request model for file node creation/update."""
    node_id: str
    label: str
    linked_nodes: List[LinkedNode] = []
    filename: str  # The actual filename on disk
    color: Optional[str] = None  # Optional color field (hex color code)


class AskRequest(BaseModel):
    """Request model for question answering."""
    query: str


class SearchRequest(BaseModel):
    """Request model for web search."""
    query: str

# ============================================================================
# JSON Data Management
# ============================================================================

def load_files_json() -> Dict[str, Any]:
    """
    Load the files JSON, creating it with proper structure if it doesn't exist.
    
    Returns:
        Dictionary with 'texts' and 'files' keys
    """
    default_structure = {
        "texts": [],
        "files": []
    }
    
    if not files_json_path.exists():
        with open(files_json_path, 'w') as f:
            json.dump(default_structure, f, indent=2)
        return default_structure
    
    try:
        with open(files_json_path, 'r') as f:
            data = json.load(f)
        
        # Ensure the structure has both keys (migration from old format)
        if not isinstance(data, dict):
            # Old format was an array, convert it
            data = {
                "texts": [],
                "files": data if isinstance(data, list) else []
            }
        else:
            # Ensure both keys exist
            if "texts" not in data:
                data["texts"] = []
            if "files" not in data:
                data["files"] = []
        
        return data
    except (json.JSONDecodeError, IOError):
        # If file is corrupted, create a new one
        with open(files_json_path, 'w') as f:
            json.dump(default_structure, f, indent=2)
        return default_structure


def save_files_json(data: Dict[str, Any]) -> None:
    """
    Save the data structure to JSON file.
    
    Args:
        data: Dictionary to save
    """
    with open(files_json_path, 'w') as f:
        json.dump(data, f, indent=2)


async def update_vectors_after_change() -> None:
    """
    Notify that data was updated and trigger vector store update.
    
    This is a wrapper around update_vectors_async for consistency.
    """
    await update_vectors_async()

# ============================================================================
# File Operations
# ============================================================================

def _generate_unique_filepath(original_filename: str) -> Path:
    """
    Generate a unique file path by adding a counter suffix if file exists.
    
    Args:
        original_filename: Original filename
    
    Returns:
        Unique Path object
    """
    file_path = data_dir / original_filename
    counter = 1
    original_name = file_path.stem
    original_ext = file_path.suffix
    
    while file_path.exists():
        file_path = data_dir / f"{original_name}_{counter}{original_ext}"
        counter += 1
    
    return file_path


def _create_file_entry(file_path: Path, original_filename: str, content_type: Optional[str]) -> Dict[str, Any]:
    """
    Create a file entry dictionary with metadata.
    
    Args:
        file_path: Path to the saved file
        original_filename: Original filename from upload
        content_type: MIME content type
    
    Returns:
        File entry dictionary
    """
    file_size = file_path.stat().st_size
    
    return {
        "filename": file_path.name,
        "original_filename": original_filename,
        "path": str(file_path),
        "size": file_size,
        "size_mb": round(file_size / BYTES_PER_MB, 2),
        "upload_date": datetime.now().isoformat(),
        "file_type": file_path.suffix.lower(),
        "content_type": content_type or DEFAULT_CONTENT_TYPE
    }


def _validate_file_path(filename: str) -> Path:
    """
    Validate filename and return safe file path.
    
    Args:
        filename: Filename to validate
    
    Returns:
        Validated Path object
    
    Raises:
        HTTPException: If filename is invalid or contains path traversal
    """
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    file_path = data_dir / filename
    
    # Security: prevent directory traversal
    try:
        file_path.resolve().relative_to(data_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid filename")
    
    return file_path

# ============================================================================
# Node Operations Helpers
# ============================================================================

def _convert_linked_nodes(linked_nodes: List[LinkedNode]) -> List[Dict[str, str]]:
    """
    Convert LinkedNode Pydantic models to dictionaries.
    
    Args:
        linked_nodes: List of LinkedNode models
    
    Returns:
        List of dictionaries with node_id and linkage_label
    """
    return [
        {
            "node_id": linked.node_id,
            "linkage_label": linked.linkage_label
        }
        for linked in linked_nodes
    ]


def _create_text_node_entry(
    node_id: str,
    label: str,
    linked_nodes: List[LinkedNode],
    color: Optional[str] = None,
    created_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a text node entry dictionary.
    
    Args:
        node_id: Unique node identifier
        label: Node label
        linked_nodes: List of linked nodes
        color: Optional color hex code
        created_date: Optional creation date (defaults to now)
    
    Returns:
        Text node entry dictionary
    """
    entry = {
        "node_id": node_id,
        "label": label,
        "linked_nodes": _convert_linked_nodes(linked_nodes),
        "created_date": created_date or datetime.now().isoformat()
    }
    
    if color:
        entry["color"] = color
    
    return entry


def _find_node_index(nodes: List[Dict[str, Any]], node_id: str) -> Optional[int]:
    """
    Find the index of a node by node_id.
    
    Args:
        nodes: List of node dictionaries
        node_id: Node ID to find
    
    Returns:
        Index of the node or None if not found
    """
    return next((i for i, node in enumerate(nodes) if node.get("node_id") == node_id), None)


def _remove_node_references(data: Dict[str, Any], node_id: str) -> None:
    """
    Remove references to a node from all linked_nodes in texts and files.
    
    Args:
        data: Data dictionary
        node_id: Node ID to remove references for
    """
    # Remove from text nodes
    for node in data["texts"]:
        if "linked_nodes" in node:
            node["linked_nodes"] = [
                linked for linked in node["linked_nodes"]
                if linked.get("node_id") != node_id
            ]
    
    # Remove from file nodes
    for file_entry in data["files"]:
        if "linked_nodes" in file_entry:
            file_entry["linked_nodes"] = [
                linked for linked in file_entry["linked_nodes"]
                if linked.get("node_id") != node_id
            ]

# ============================================================================
# File Management Routes
# ============================================================================

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a file to the local database/data directory.
    
    Args:
        file: Uploaded file
    
    Returns:
        JSON response with upload confirmation
    """
    try:
        # Generate unique file path
        file_path = _generate_unique_filepath(file.filename)
        
        # Write file to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Create file entry
        file_entry = _create_file_entry(file_path, file.filename, file.content_type)
        
        # Update JSON data
        data = load_files_json()
        data["files"].append(file_entry)
        save_files_json(data)
        
        # Update vectors
        await update_vectors_after_change()
        
        return JSONResponse({
            "message": "File uploaded successfully",
            "filename": file_path.name,
            "path": str(file_path)
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")


@app.post("/api/delete")
async def delete_file(request: DeleteFileRequest):
    """
    Delete a file from the local database/data directory.
    
    Args:
        request: Delete file request with filename
    
    Returns:
        JSON response with deletion confirmation
    """
    try:
        file_path = _validate_file_path(request.filename)
        
        # Check if file exists
        if not file_path.exists():
            return JSONResponse({
                "message": "File not found (may have been already deleted)",
                "filename": request.filename
            })
        
        # Delete the file
        file_path.unlink()
        
        # Update JSON data
        data = load_files_json()
        data["files"] = [f for f in data["files"] if f.get("filename") != request.filename]
        save_files_json(data)
        
        # Update vectors
        await update_vectors_after_change()
        
        return JSONResponse({
            "message": "File deleted successfully",
            "filename": request.filename
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")

# ============================================================================
# Text Node Routes
# ============================================================================

@app.post("/api/text-node")
async def create_text_node(request: TextNodeRequest):
    """
    Save text node information to data.json.
    
    Args:
        request: Text node request data
    
    Returns:
        JSON response with creation confirmation
    """
    try:
        data = load_files_json()
        
        # Check if node already exists
        if _find_node_index(data["texts"], request.node_id) is not None:
            raise HTTPException(
                status_code=400,
                detail=f"Text node with id {request.node_id} already exists. Use PUT to update."
            )
        
        # Create and add text node entry
        text_node_entry = _create_text_node_entry(
            request.node_id,
            request.label,
            request.linked_nodes,
            request.color
        )
        data["texts"].append(text_node_entry)
        save_files_json(data)
        
        # Update vectors
        await update_vectors_after_change()
        
        return JSONResponse({
            "message": "Text node saved successfully",
            "node_id": request.node_id
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving text node: {str(e)}")


@app.put("/api/text-node")
async def update_text_node(request: TextNodeRequest):
    """
    Update text node information in data.json.
    
    Args:
        request: Text node request data
    
    Returns:
        JSON response with update confirmation
    """
    try:
        data = load_files_json()
        node_index = _find_node_index(data["texts"], request.node_id)
        
        if node_index is None:
            # Node doesn't exist, create it instead
            text_node_entry = _create_text_node_entry(
                request.node_id,
                request.label,
                request.linked_nodes,
                request.color
            )
            data["texts"].append(text_node_entry)
        else:
            # Update existing node
            existing_node = data["texts"][node_index]
            updated_node = {
                "node_id": request.node_id,
                "label": request.label,
                "linked_nodes": _convert_linked_nodes(request.linked_nodes),
                "created_date": existing_node.get("created_date", datetime.now().isoformat()),
                "updated_date": datetime.now().isoformat()
            }
            
            # Handle color: update if provided, preserve if not
            if request.color:
                updated_node["color"] = request.color
            elif "color" in existing_node:
                updated_node["color"] = existing_node["color"]
            
            data["texts"][node_index] = updated_node
        
        save_files_json(data)
        await update_vectors_after_change()
        
        return JSONResponse({
            "message": "Text node updated successfully",
            "node_id": request.node_id
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating text node: {str(e)}")


@app.delete("/api/text-node/{node_id}")
async def delete_text_node(node_id: str):
    """
    Delete text node information from data.json.
    
    Args:
        node_id: Node ID to delete
    
    Returns:
        JSON response with deletion confirmation
    """
    try:
        data = load_files_json()
        initial_length = len(data["texts"])
        
        # Remove the node
        data["texts"] = [node for node in data["texts"] if node.get("node_id") != node_id]
        
        # Remove references to this node
        _remove_node_references(data, node_id)
        
        save_files_json(data)
        await update_vectors_after_change()
        
        if len(data["texts"]) < initial_length:
            return JSONResponse({
                "message": "Text node deleted successfully",
                "node_id": node_id
            })
        else:
            return JSONResponse({
                "message": "Text node not found (may have been already deleted)",
                "node_id": node_id
            })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting text node: {str(e)}")

# ============================================================================
# File Node Routes
# ============================================================================

@app.post("/api/file-node")
async def create_file_node(request: FileNodeRequest):
    """
    Save file node information to data.json.
    
    Args:
        request: File node request data
    
    Returns:
        JSON response with creation confirmation
    """
    try:
        data = load_files_json()
        
        # Find the file entry by filename
        file_index = next(
            (i for i, file_entry in enumerate(data["files"])
             if file_entry.get("filename") == request.filename),
            None
        )
        
        if file_index is None:
            raise HTTPException(
                status_code=404,
                detail=f"File with filename {request.filename} not found"
            )
        
        # Check if node_id already exists in files
        existing_index = _find_node_index(data["files"], request.node_id)
        if existing_index is not None and existing_index != file_index:
            raise HTTPException(
                status_code=400,
                detail=f"File node with id {request.node_id} already exists. Use PUT to update."
            )
        
        # Update the file entry with node information
        file_entry = data["files"][file_index]
        file_entry["node_id"] = request.node_id
        file_entry["label"] = request.label
        file_entry["linked_nodes"] = _convert_linked_nodes(request.linked_nodes)
        
        if request.color:
            file_entry["color"] = request.color
        
        if "node_created_date" not in file_entry:
            file_entry["node_created_date"] = datetime.now().isoformat()
        
        save_files_json(data)
        await update_vectors_after_change()
        
        return JSONResponse({
            "message": "File node saved successfully",
            "node_id": request.node_id
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file node: {str(e)}")


@app.put("/api/file-node")
async def update_file_node(request: FileNodeRequest):
    """
    Update file node information in data.json.
    
    Args:
        request: File node request data
    
    Returns:
        JSON response with update confirmation
    """
    try:
        data = load_files_json()
        
        # Find the file entry by node_id or filename
        file_index = next(
            (i for i, file_entry in enumerate(data["files"])
             if file_entry.get("node_id") == request.node_id
             or file_entry.get("filename") == request.filename),
            None
        )
        
        if file_index is None:
            raise HTTPException(
                status_code=404,
                detail=f"File node with id {request.node_id} or filename {request.filename} not found"
            )
        
        # Update the file entry
        file_entry = data["files"][file_index]
        file_entry["node_id"] = request.node_id
        file_entry["label"] = request.label
        file_entry["linked_nodes"] = _convert_linked_nodes(request.linked_nodes)
        
        # Handle color
        if request.color:
            file_entry["color"] = request.color
        
        # Set dates
        if "node_created_date" not in file_entry:
            file_entry["node_created_date"] = datetime.now().isoformat()
        file_entry["node_updated_date"] = datetime.now().isoformat()
        
        save_files_json(data)
        await update_vectors_after_change()
        
        return JSONResponse({
            "message": "File node updated successfully",
            "node_id": request.node_id
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating file node: {str(e)}")


@app.delete("/api/file-node/{node_id}")
async def delete_file_node(node_id: str):
    """
    Delete file node information from data.json (keeps file metadata, removes node info).
    
    Args:
        node_id: Node ID to delete
    
    Returns:
        JSON response with deletion confirmation
    """
    try:
        data = load_files_json()
        
        # Find and update file entry
        file_index = _find_node_index(data["files"], node_id)
        if file_index is not None:
            file_entry = data["files"][file_index]
            # Remove node-specific fields but keep file metadata
            file_entry.pop("node_id", None)
            file_entry.pop("label", None)
            file_entry.pop("linked_nodes", None)
            file_entry.pop("node_created_date", None)
            file_entry.pop("node_updated_date", None)
        
        # Remove references to this node
        _remove_node_references(data, node_id)
        
        save_files_json(data)
        await update_vectors_after_change()
        
        if file_index is not None:
            return JSONResponse({
                "message": "File node deleted successfully",
                "node_id": node_id
            })
        else:
            return JSONResponse({
                "message": "File node not found (may have been already deleted)",
                "node_id": node_id
            })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file node: {str(e)}")

# ============================================================================
# Question Answering and Search Routes
# ============================================================================

@app.post("/api/ask")
async def ask_question(request: AskRequest):
    """
    Process a question using the QA chain and return streaming response.
    
    Args:
        request: Ask request with query
    
    Returns:
        Streaming response with answer tokens
    """
    try:
        query = request.query.strip()
        response = await ask_question_stream(query)
        return StreamingResponse(response, media_type=STREAMING_MEDIA_TYPE)
    except NoQueryError:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    except ErrorProcessingQuestionError:
        raise HTTPException(status_code=500, detail="Error processing question")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error asking question: {str(e)}")


@app.post("/api/search")
async def search_web(request: SearchRequest):
    """
    Perform a web search using Tavily and return results.
    
    Args:
        request: Search request with query
    
    Returns:
        JSON response with search results
    """
    try:
        query = request.query.strip()
        results = await search_web_tavily(query)
        return JSONResponse(results)
    except NoQueryError:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    except ErrorSearchingError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing search: {str(e)}")

# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    clear_data_folder()
    uvicorn.run(app, host="0.0.0.0", port=8000)
