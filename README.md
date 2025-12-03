# Project Setup Guide

This project consists of a fully separated frontend and backend architecture.

## Architecture

- **Backend**: FastAPI application running on port 8000 (default)
- **Frontend**: Static HTML/JS application that can be served on any port

## Prerequisites

- Python 3.8+ (for backend)
- Node.js and npm (for frontend)

## Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd src/backend
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the backend server:
   ```bash
   python main.py
   ```

   The backend will start on `http://localhost:8000`

   **Note**: The backend now only serves API endpoints. It no longer serves static frontend files.

## Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd src/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   The frontend will be available at `http://localhost:3000`

## Configuration

### Backend API URL

The frontend uses a configurable API base URL. By default, it points to `http://localhost:8000`.

To change the API URL:

1. **Development**: Edit `src/frontend/config.js` and change the `API_BASE_URL` constant
2. **Production**: Set `window.API_BASE_URL` before loading the config script, or modify `config.js` during build

Example for production:
```html
<script>
  window.API_BASE_URL = 'https://api.yourdomain.com';
</script>
<script src="config.js"></script>
```

### CORS Configuration

The backend is configured to allow requests from any origin (`allow_origins=["*"]`). For production, you should restrict this to your frontend domain(s):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com", "https://www.yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Running Both Services

### Option 1: Separate Terminals

1. Terminal 1 - Backend:
   ```bash
   cd src/backend
   python main.py
   ```

2. Terminal 2 - Frontend:
   ```bash
   cd src/frontend
   npm run dev
   ```

### Option 2: Using a Process Manager

You can use tools like `pm2`, `foreman`, or `concurrently` to run both services together.

## API Endpoints

The backend provides the following API endpoints:

- `POST /api/upload` - Upload a file
- `POST /api/delete` - Delete a file
- `POST /api/text-node` - Create a text node
- `PUT /api/text-node` - Update a text node
- `DELETE /api/text-node/{node_id}` - Delete a text node
- `POST /api/file-node` - Create a file node
- `PUT /api/file-node` - Update a file node
- `DELETE /api/file-node/{node_id}` - Delete a file node
- `POST /api/ask` - Ask a question (streaming response)
- `POST /api/search` - Perform a web search

## Production Deployment

### Backend

Deploy the FastAPI backend using:
- **Uvicorn** (production server)
- **Gunicorn** with Uvicorn workers
- **Docker** containerization

Example with Uvicorn:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend

The frontend is a static application. You can:

1. Serve it with any static file server (nginx, Apache, etc.)
2. Deploy to static hosting (Netlify, Vercel, GitHub Pages, etc.)
3. Use a CDN for better performance

**Important**: Make sure to update the `API_BASE_URL` in `config.js` to point to your production backend URL.

## Troubleshooting

### CORS Errors

If you see CORS errors, ensure:
1. The backend CORS middleware is properly configured
2. The frontend API URL matches the backend URL
3. Both services are running

### API Connection Issues

1. Verify the backend is running: `curl http://localhost:8000/api/ask` (should return 422 for missing query)
2. Check the browser console for API errors
3. Verify `API_BASE_URL` in `config.js` matches your backend URL

