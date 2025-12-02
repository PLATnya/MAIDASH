from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from pathlib import Path
import shutil
import os
import uvicorn
import json
from datetime import datetime
from typing import List
from chat_manager import create_qa_chain
from db_manager import vectorize_all_data, load_config, clear_data_folder

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
    color: str = None  # Optional color field (hex color code)

class FileNodeRequest(BaseModel):
    node_id: str
    label: str
    linked_nodes: List[LinkedNode] = []
    filename: str  # The actual filename on disk
    color: str = None  # Optional color field (hex color code)

class AskRequest(BaseModel):
    query: str

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
        # Add color if provided
        if request.color:
            text_node_entry["color"] = request.color
        
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
            # Add color if provided
            if request.color:
                text_node_entry["color"] = request.color
            data["texts"].append(text_node_entry)
        else:
            # Update existing node
            existing_node = data["texts"][node_index]
            updated_node = {
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
            # Preserve existing color if not provided, or update if provided
            if request.color:
                updated_node["color"] = request.color
            elif "color" in existing_node:
                updated_node["color"] = existing_node["color"]
            data["texts"][node_index] = updated_node
        
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
        
        # Also remove from file nodes' linked_nodes
        for file_entry in data["files"]:
            if "linked_nodes" in file_entry:
                file_entry["linked_nodes"] = [
                    linked for linked in file_entry["linked_nodes"]
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

@app.post("/api/file-node")
async def create_file_node(request: FileNodeRequest):
    """Save file node information to data.json"""
    try:
        # Load existing data structure
        data = load_files_json()
        
        # Find the file entry by filename
        file_index = next((i for i, file_entry in enumerate(data["files"]) if file_entry.get("filename") == request.filename), None)
        
        if file_index is None:
            raise HTTPException(status_code=404, detail=f"File with filename {request.filename} not found")
        
        # Check if node_id already exists in files
        existing_index = next((i for i, file_entry in enumerate(data["files"]) if file_entry.get("node_id") == request.node_id), None)
        if existing_index is not None and existing_index != file_index:
            raise HTTPException(status_code=400, detail=f"File node with id {request.node_id} already exists. Use PUT to update.")
        
        # Update the file entry with node information
        file_entry = data["files"][file_index]
        file_entry["node_id"] = request.node_id
        file_entry["label"] = request.label
        file_entry["linked_nodes"] = [
            {
                "node_id": linked.node_id,
                "linkage_label": linked.linkage_label
            }
            for linked in request.linked_nodes
        ]
        # Add color if provided
        if request.color:
            file_entry["color"] = request.color
        if "created_date" not in file_entry:
            file_entry["node_created_date"] = datetime.now().isoformat()
        
        # Save updated data structure
        save_files_json(data)
        
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
    """Update file node information in data.json"""
    try:
        # Load existing data structure
        data = load_files_json()
        
        # Find the file entry by node_id or filename
        file_index = next((i for i, file_entry in enumerate(data["files"]) if file_entry.get("node_id") == request.node_id or file_entry.get("filename") == request.filename), None)
        
        if file_index is None:
            raise HTTPException(status_code=404, detail=f"File node with id {request.node_id} or filename {request.filename} not found")
        
        # Update the file entry with node information
        file_entry = data["files"][file_index]
        file_entry["node_id"] = request.node_id
        file_entry["label"] = request.label
        file_entry["linked_nodes"] = [
            {
                "node_id": linked.node_id,
                "linkage_label": linked.linkage_label
            }
            for linked in request.linked_nodes
        ]
        # Update color if provided, otherwise preserve existing
        if request.color:
            file_entry["color"] = request.color
        elif "color" not in file_entry:
            # If no color provided and none exists, don't add it
            pass
        if "node_created_date" not in file_entry:
            file_entry["node_created_date"] = datetime.now().isoformat()
        file_entry["node_updated_date"] = datetime.now().isoformat()
        
        # Save updated data structure
        save_files_json(data)
        
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
    """Delete file node information from data.json (keeps file metadata, removes node info)"""
    try:
        # Load existing data structure
        data = load_files_json()
        
        # Find the file entry by node_id
        file_index = next((i for i, file_entry in enumerate(data["files"]) if file_entry.get("node_id") == node_id), None)
        
        if file_index is not None:
            file_entry = data["files"][file_index]
            # Remove node-specific fields but keep file metadata
            file_entry.pop("node_id", None)
            file_entry.pop("label", None)
            file_entry.pop("linked_nodes", None)
            file_entry.pop("node_created_date", None)
            file_entry.pop("node_updated_date", None)
        
        # Remove references to this node from other nodes' linked_nodes
        for node in data["texts"]:
            if "linked_nodes" in node:
                node["linked_nodes"] = [
                    linked for linked in node["linked_nodes"]
                    if linked.get("node_id") != node_id
                ]
        
        for file_entry in data["files"]:
            if "linked_nodes" in file_entry:
                file_entry["linked_nodes"] = [
                    linked for linked in file_entry["linked_nodes"]
                    if linked.get("node_id") != node_id
                ]
        
        # Save updated data structure
        save_files_json(data)
        
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

@app.post("/api/ask")
async def ask_question(request: AskRequest):
    """Process a question using the QA chain and return streaming response"""
    try:
        query = request.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        # Load config
        config = load_config()
        
        # Initialize vectorstore
        vectorstore = vectorize_all_data(config=config)
        
        # Create QA chain
        qa_chain = create_qa_chain(vectorstore, config=config)
        
        # Stream the answer
        def generate_response():
            full_answer = ""
            try:
                for chunk in qa_chain.stream({"input": query}):
                    if "answer" in chunk:
                        answer_token = chunk["answer"]
                        if answer_token:
                            full_answer += answer_token
                            # Send each token as JSON
                            yield json.dumps({"type": "token", "content": answer_token}) + "\n"
                    
                    if "context" in chunk and chunk["context"]:
                        # Send context info if available
                        context_docs = chunk["context"]
                        sources = set()
                        for doc in context_docs:
                            if hasattr(doc, 'metadata'):
                                source = doc.metadata.get('source', 'Unknown')
                                sources.add(source)
                        if sources:
                            sources_list = list(sources)[:5]  # Limit to 5 sources
                            yield json.dumps({"type": "sources", "sources": sources_list}) + "\n"
                
                # Send final answer summary
                yield json.dumps({"type": "done", "answer": full_answer}) + "\n"
            except Exception as e:
                yield json.dumps({"type": "error", "message": str(e)}) + "\n"
            finally:
                # Clean up: delete the vector store to free memory
                try:
                    if hasattr(vectorstore, 'delete_collection'):
                        vectorstore.delete_collection()
                except:
                    pass
        
        return StreamingResponse(generate_response(), media_type="application/x-ndjson")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")

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
    clear_data_folder()
    uvicorn.run(app, host="0.0.0.0", port=8000)

