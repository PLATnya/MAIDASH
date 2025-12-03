# Project Setup Guide

This project consists of a fully separated frontend and backend architecture.

## Architecture

- **Backend**: FastAPI application running on port 8000 (default)
- **Frontend**: Static HTML/JS application that can be served on any port

## Prerequisites

- Python 3.8+ (for backend)
- Node.js and npm (for frontend)
- Docker and Docker Compose (optional, for containerized deployment)

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

### Environment Variables (.env file)

The project uses a `.env` file to manage API keys and configuration. Both backend and frontend containers load environment variables from this file.

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` and add your API keys:**
   ```bash
   # Backend API Keys
   TAVILY_API_KEY=your_actual_tavily_api_key_here
   
   # Frontend Configuration
   API_BASE_URL=http://localhost:8000
   ```

3. **Important**: The `.env` file is already in `.gitignore` - never commit it to version control!

### Backend API URL

The frontend uses a configurable API base URL. It can be configured via:

1. **`.env` file** (recommended for Docker Compose):
   ```bash
   API_BASE_URL=http://localhost:8000
   # For Docker Compose internal communication:
   # API_BASE_URL=http://backend:8000
   ```
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

### Option 2: Using Docker Compose

Run both services with Docker Compose:

1. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

2. **Start the services:**
   ```bash
   # From project root
   docker-compose up --build
   ```

   This will:
   - Build and start the backend on `http://localhost:8000`
   - Build and start the frontend on `http://localhost:80`
   - Load environment variables from `.env` file for both containers

3. **Run in detached mode:**
   ```bash
   docker-compose up -d --build
   ```

4. **Stop the services:**
   ```bash
   docker-compose down
   ```

### Option 3: Using a Process Manager

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

## Docker Deployment

### Building Individual Containers

**Backend:**
```bash
cd src/backend
docker build -t backend-app .
docker run -p 8000:8000 -v $(pwd)/data:/app/data backend-app
```

**Frontend (Production):**
```bash
cd src/frontend
docker build -t frontend-app .
docker run -p 80:80 --env-file ../.env frontend-app
# Or specify API_BASE_URL directly:
# docker run -p 80:80 -e API_BASE_URL=http://your-backend-url:8000 frontend-app
```

**Frontend (Development):**
```bash
cd src/frontend
docker build -f Dockerfile.dev -t frontend-app-dev .
docker run -p 3000:3000 frontend-app-dev
```

### Using Docker Compose

See "Option 2: Using Docker Compose" in the "Running Both Services" section above.

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

Example with Docker:
```bash
docker build -t backend-app ./src/backend
docker run -d -p 8000:8000 -v /path/to/data:/app/data backend-app
```

### Frontend

The frontend is a static application. You can:

1. **Docker with nginx** (recommended for production):
   ```bash
   docker build -t frontend-app ./src/frontend
   docker run -d -p 80:80 -e API_BASE_URL=https://api.yourdomain.com frontend-app
   ```

2. Serve it with any static file server (nginx, Apache, etc.)
3. Deploy to static hosting (Netlify, Vercel, GitHub Pages, etc.)
4. Use a CDN for better performance

**Important**: Make sure to update the `API_BASE_URL` in `config.js` or set it via environment variable to point to your production backend URL.

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

