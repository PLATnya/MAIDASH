# Backend Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Copy and set permissions for entrypoint script
COPY entrypoint.py /app/entrypoint.py
RUN chmod +x /app/entrypoint.py

# Create data directory and ollama directory structure
RUN mkdir -p /app/data && \
    mkdir -p /app/.ollama/models && \
    chmod -R 755 /app/.ollama

# Expose port
EXPOSE 8000

# Use entrypoint script
ENTRYPOINT ["python", "/app/entrypoint.py"]

