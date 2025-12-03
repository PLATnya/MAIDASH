# Frontend Dockerfile for Development
# Uses http-server instead of nginx for simpler development setup
FROM node:18-alpine

WORKDIR /app

# Install http-server globally
RUN npm install -g http-server

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Start http-server with CORS enabled
CMD ["http-server", ".", "-p", "3000", "-c-1", "--cors"]

