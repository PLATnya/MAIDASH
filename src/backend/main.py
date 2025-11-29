from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import shutil
import os

app = FastAPI()

# Get the frontend directory path
frontend_dir = Path(__file__).parent.parent / "frontend"
# Get the data directory path for storing uploaded files
data_dir = Path(__file__).parent.parent.parent / "data"
data_dir.mkdir(exist_ok=True)

@app.get("/")
async def read_root():
    """Serve the main HTML page"""
    html_path = frontend_dir / "index.html"
    return FileResponse(html_path)

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
        
        return JSONResponse({
            "message": "File uploaded successfully",
            "filename": file_path.name,
            "path": str(file_path)
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

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
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

