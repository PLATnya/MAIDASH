from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path

app = FastAPI()

# Get the frontend directory path
frontend_dir = Path(__file__).parent.parent / "frontend"

@app.get("/")
async def read_root():
    """Serve the main HTML page"""
    html_path = frontend_dir / "index.html"
    return FileResponse(html_path)

@app.get("/{file_path:path}")
async def serve_static_files(file_path: str):
    """Serve static files from the frontend directory"""
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

