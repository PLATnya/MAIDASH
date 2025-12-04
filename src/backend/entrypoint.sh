#!/bin/bash
set -e

# Create .ollama directory with proper permissions
echo "Creating Ollama directory..."
mkdir -p /app/.ollama/models
chmod -R 755 /app/.ollama
# Ensure the directory is writable by the current user
chown -R $(id -u):$(id -g) /app/.ollama 2>/dev/null || true

# Start ollama serve in the background
echo "Starting ollama serve..."
ollama serve &
OLLAMA_PID=$!

# Wait for ollama to be ready (check if API is responding)
echo "Waiting for Ollama to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "Ollama is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Warning: Ollama did not become ready after 30 seconds, continuing anyway..."
    else
        sleep 1
    fi
done

# Function to cleanup on exit
cleanup() {
    echo "Shutting down ollama..."
    kill $OLLAMA_PID 2>/dev/null || true
    wait $OLLAMA_PID 2>/dev/null || true
}
trap cleanup EXIT


# Run ollama signin and wait for user to complete (press enter)
echo "Running ollama signin..."
echo "Please complete the signin process and press Enter when done..."
ollama signin
echo "Signin completed. Proceeding to pull models..."

# Pull required models (only after signin completes)
echo "Pulling required Ollama models..."
echo "Pulling nomic-embed-text:latest..."
ollama pull nomic-embed-text:latest

echo "Pulling deepseek-v3.1:671b-cloud..."
ollama pull deepseek-v3.1:671b-cloud

echo "Models pulled successfully!"

# Start the application
exec python main.py

