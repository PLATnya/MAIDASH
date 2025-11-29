from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from pathlib import Path
import shutil
import os
import uvicorn
import json
from datetime import datetime
from typing import List

app = FastAPI()

# Get the frontend directory path
frontend_dir = Path(__file__).parent.parent / "frontend"
# Get the data directory path for storing uploaded files
data_dir = Path(__file__).parent.parent.parent / "data"
data_dir.mkdir(exist_ok=True)

# Path to the JSON file that tracks uploaded files
files_json_path = data_dir / "data.json"

def load_files_json():
    """Load the files JSON, creating it with proper structure if it doesn't exist"""
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

def save_files_json(data):
    """Save the data structure to JSON"""
    with open(files_json_path, 'w') as f:
        json.dump(data, f, indent=2)

# Request model for file deletion
class DeleteFileRequest(BaseModel):
    filename: str

# Request model for text node creation
class LinkedNode(BaseModel):
    node_id: str
    linkage_label: str

class TextNodeRequest(BaseModel):
    node_id: str
    label: str
    linked_nodes: List[LinkedNode] = []

# API routes must be defined before the catch-all route
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file to the local database/data directory"""
    try:
        # Save file to data directory
        file_path = data_dir / file.filename
        
        # Handle filename conflicts by adding a number suffix
        counter = 1
        original_name = file_path.stem
        original_ext = file_path.suffix
        while file_path.exists():
            file_path = data_dir / f"{original_name}_{counter}{original_ext}"
            counter += 1
        
        # Write file to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get file metadata
        file_size = file_path.stat().st_size
        upload_date = datetime.now().isoformat()
        
        # Create file entry
        file_entry = {
            "filename": file_path.name,
            "original_filename": file.filename,
            "path": str(file_path),
            "size": file_size,
            "size_mb": round(file_size / (1024 * 1024), 2),
            "upload_date": upload_date,
            "file_type": file_path.suffix.lower(),
            "content_type": file.content_type or "application/octet-stream"
        }
        
        # Load existing data structure
        data = load_files_json()
        
        # Add new file entry to files array
        data["files"].append(file_entry)
        
        # Save updated data structure
        save_files_json(data)
        
        return JSONResponse({
            "message": "File uploaded successfully",
            "filename": file_path.name,
            "path": str(file_path)
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@app.post("/api/delete")
async def delete_file(request: DeleteFileRequest):
    """Delete a file from the local database/data directory"""
    try:
        filename = request.filename
        if not filename:
            raise HTTPException(status_code=400, detail="Filename is required")
        
        # Security: prevent directory traversal
        file_path = data_dir / filename
        try:
            file_path.resolve().relative_to(data_dir.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Forbidden: Invalid filename")
        
        # Check if file exists
        if not file_path.exists():
            return JSONResponse({
                "message": "File not found (may have been already deleted)",
                "filename": filename
            })
        
        # Delete the file
        file_path.unlink()
        
        # Remove file entry from JSON
        data = load_files_json()
        data["files"] = [f for f in data["files"] if f.get("filename") != filename]
        save_files_json(data)
        
        return JSONResponse({
            "message": "File deleted successfully",
            "filename": filename
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")

@app.post("/api/text-node")
async def create_text_node(request: TextNodeRequest):
    """Save text node information to data.json"""
    try:
        # Load existing data structure
        data = load_files_json()
        
        # Check if node already exists
        existing_index = next((i for i, node in enumerate(data["texts"]) if node.get("node_id") == request.node_id), None)
        if existing_index is not None:
            raise HTTPException(status_code=400, detail=f"Text node with id {request.node_id} already exists. Use PUT to update.")
        
        # Create text node entry
        text_node_entry = {
            "node_id": request.node_id,
            "label": request.label,
            "linked_nodes": [
                {
                    "node_id": linked.node_id,
                    "linkage_label": linked.linkage_label
                }
                for linked in request.linked_nodes
            ],
            "created_date": datetime.now().isoformat()
        }
        
        # Add new text node entry to texts array
        data["texts"].append(text_node_entry)
        
        # Save updated data structure
        save_files_json(data)
        
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
    """Update text node information in data.json"""
    try:
        # Load existing data structure
        data = load_files_json()
        
        # Find the node to update
        node_index = next((i for i, node in enumerate(data["texts"]) if node.get("node_id") == request.node_id), None)
        
        if node_index is None:
            # Node doesn't exist, create it instead
            text_node_entry = {
                "node_id": request.node_id,
                "label": request.label,
                "linked_nodes": [
                    {
                        "node_id": linked.node_id,
                        "linkage_label": linked.linkage_label
                    }
                    for linked in request.linked_nodes
                ],
                "created_date": datetime.now().isoformat()
            }
            data["texts"].append(text_node_entry)
        else:
            # Update existing node
            existing_node = data["texts"][node_index]
            data["texts"][node_index] = {
                "node_id": request.node_id,
                "label": request.label,
                "linked_nodes": [
                    {
                        "node_id": linked.node_id,
                        "linkage_label": linked.linkage_label
                    }
                    for linked in request.linked_nodes
                ],
                "created_date": existing_node.get("created_date", datetime.now().isoformat()),
                "updated_date": datetime.now().isoformat()
            }
        
        # Save updated data structure
        save_files_json(data)
        
        return JSONResponse({
            "message": "Text node updated successfully",
            "node_id": request.node_id
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating text node: {str(e)}")

@app.delete("/api/text-node/{node_id}")
async def delete_text_node(node_id: str):
    """Delete text node information from data.json"""
    try:
        # Load existing data structure
        data = load_files_json()
        
        # Remove the node from texts array
        initial_length = len(data["texts"])
        data["texts"] = [node for node in data["texts"] if node.get("node_id") != node_id]
        
        # Also remove references to this node from other nodes' linked_nodes
        for node in data["texts"]:
            if "linked_nodes" in node:
                node["linked_nodes"] = [
                    linked for linked in node["linked_nodes"]
                    if linked.get("node_id") != node_id
                ]
        
        # Save updated data structure
        save_files_json(data)
        
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

@app.get("/")
async def read_root():
    """Serve the main HTML page"""
    html_path = frontend_dir / "index.html"
    return FileResponse(html_path)

@app.get("/{file_path:path}")
async def serve_static_files(file_path: str):
    """Serve static files from the frontend directory"""
    # Don't intercept API routes
    if file_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    
    file_full_path = frontend_dir / file_path
    
    # Security: prevent directory traversal
    try:
        file_full_path.resolve().relative_to(frontend_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if file_full_path.exists() and file_full_path.is_file():
        return FileResponse(file_full_path)
    else:
        raise HTTPException(status_code=404, detail="File not found")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

