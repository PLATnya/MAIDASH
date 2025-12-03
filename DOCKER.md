# Docker Deployment Guide

This guide explains how to build and run the application using Docker.

## Quick Start

### Using Docker Compose (Recommended)

From the project root:

1. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys (TAVILY_API_KEY, etc.)
   ```

2. **Start the services:**
   ```bash
   docker-compose up --build
   ```

   This will start both backend and frontend services and load environment variables from `.env` file.

## Individual Container Builds

### Backend Container

**Build:**
```bash
cd src/backend
docker build -t backend-app .
```

**Run:**
```bash
docker run -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  backend-app
```

**With environment variables:**
```bash
# Using .env file (recommended)
docker run -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  --env-file ../.env \
  backend-app

# Or specify individual variables
docker run -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  -e TAVILY_API_KEY=your_key_here \
  -e PYTHONUNBUFFERED=1 \
  backend-app
```

### Frontend Container (Production)

**Build:**
```bash
cd src/frontend
docker build -t frontend-app .
```

**Run:**
```bash
# Using .env file (recommended)
docker run -p 80:80 \
  --env-file ../.env \
  frontend-app

# Or specify API_BASE_URL directly
docker run -p 80:80 \
  -e API_BASE_URL=http://localhost:8000 \
  frontend-app
```

**Note:** The production Dockerfile uses nginx and includes an entrypoint script that automatically injects the `API_BASE_URL` environment variable into the HTML at runtime. This allows you to configure the API URL without rebuilding the image.

### Frontend Container (Development)

**Build:**
```bash
cd src/frontend
docker build -f Dockerfile.dev -t frontend-app-dev .
```

**Run:**
```bash
docker run -p 3000:3000 frontend-app-dev
```

## Docker Compose Configuration

The `docker-compose.yml` file includes:

- **Backend service**: Exposes port 8000, mounts data directory
- **Frontend service**: Exposes port 80, depends on backend
- **Health checks**: Backend health check included

### Customizing Docker Compose

Edit `docker-compose.yml` to:
- Change ports
- Add environment variables
- Configure volumes
- Set up networks

Example with custom API URL:
```yaml
frontend:
  build:
    context: ./src/frontend
    dockerfile: Dockerfile
  environment:
    - API_BASE_URL=http://backend:8000  # Use service name for internal communication
```

## Production Considerations

### Backend

1. **Use a production WSGI server** (update Dockerfile):
   ```dockerfile
   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
   ```

2. **Set up proper logging** and log rotation

3. **Configure CORS** to only allow your frontend domain

4. **Use secrets management** for API keys and sensitive data

5. **Set up health checks** and monitoring

### Frontend

1. **Configure API URL** for production:
   - Build-time: Modify `config.js` before building
   - Runtime: Use environment variable injection (requires Dockerfile update)

2. **Use HTTPS** in production (configure nginx with SSL certificates)

3. **Set up proper caching headers** (already configured in nginx.conf)

4. **Configure CDN** for static assets

## Environment Variables

Both containers load environment variables from the `.env` file in the project root.

### Setting Up .env File

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your API keys:
   ```bash
   TAVILY_API_KEY=your_actual_api_key_here
   API_BASE_URL=http://localhost:8000
   ```

3. **Important**: Never commit `.env` to version control (it's already in `.gitignore`)

### Backend Environment Variables
- `TAVILY_API_KEY` - Tavily API key for web search functionality (required)
- `PYTHONUNBUFFERED=1` - Ensures Python output is not buffered (set automatically in docker-compose.yml)

### Frontend Environment Variables
- `API_BASE_URL` - Backend API URL (defaults to `http://localhost:8000`)
  - For Docker Compose internal communication, use: `http://backend:8000`
  - For external access, use: `http://localhost:8000` or your backend URL

## Volumes

### Backend Data Persistence

The backend stores data in `/app/data`. Mount this as a volume:

```bash
docker run -v /host/path/to/data:/app/data backend-app
```

Or in docker-compose.yml:
```yaml
volumes:
  - ./src/backend/data:/app/data
```

## Troubleshooting

### Container won't start

1. Check logs: `docker logs <container-name>`
2. Verify ports aren't already in use
3. Check file permissions for mounted volumes

### Frontend can't connect to backend

1. If using Docker Compose, use service name: `http://backend:8000`
2. If running separately, use `http://localhost:8000` or host IP
3. Check CORS configuration in backend
4. Verify backend is accessible from frontend container

### Build fails

1. Check Dockerfile syntax
2. Verify all required files are present
3. Check .dockerignore isn't excluding needed files
4. Review build logs for specific errors

## Multi-stage Builds

The frontend Dockerfile uses a multi-stage build:
- Stage 1: Install Node.js dependencies
- Stage 2: Copy files to nginx and serve

This reduces the final image size by excluding Node.js from the production image.

