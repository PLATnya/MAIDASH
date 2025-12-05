# Interactive board with some AI

An interactive board application with RAG (Retrieval Augmented Generation) capabilities, allowing users to build, visualize, and query knowledge with AI-powered question answering.

## Tech Stack

**Backend:**
- FastAPI (Python web framework)
- LangChain (LLM orchestration)
- ChromaDB (vector database)
- Ollama (local LLM inference)
- Tavily (web search API)
- PyPDF2/pdfminer (PDF processing)

**Frontend:**
- Vanilla JavaScript
- Cytoscape.js (graph visualization)
- HTML/CSS

**Infrastructure:**
- Docker & Docker Compose
- Uvicorn (ASGI server)

## User Capabilities

- **Board nodes Creation**: Create, edit, and delete text nodes and file nodes
- **File Upload**: Upload PDF documents to the knowledge base for RAG queries
- **AI-Powered Q&A**: Ask questions using RAG with streaming responses
- **Web Search**: Perform web searches using Tavily API
- **Visual Graph**: Interactive graph visualization with node linking and editing
- **Node Management**: Link nodes together, resize, and organize your knowledge graph

## Quick Start with Docker Compose

### Prerequisites

- Docker and Docker Compose installed
- Tavily API key ([Get one here](https://app.tavily.com/home))

### Setup

1. **Create `.env` file** in the project root:
   ```bash
   TAVILY_API_KEY=your_tavily_api_key_here
   ```

2. **Start the application**:
   ```bash
   docker-compose up --build
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

### Running in Background

```bash
docker-compose up -d --build
```

### Stop the Application

```bash
docker-compose down
```

## Usage

### Commands

- Click anywhere on the board to create a new text node
- `/load` - Upload a file to the knowledge base
- `/ask <question>` - Ask a question using RAG
- `/search <query>` - Perform a web search

### Features

- **Create Nodes**: Click on the board canvas and type to create a node
- **Link Nodes**: Drag from one node to another to create connections
- **Edit Nodes**: Double-click a node to edit its content
- **Delete Nodes**: Right-click a node and select delete
- **Ask Questions**: Use `/ask` command or ask questions directly - the AI will search your knowledge base and provide answers
- **Upload Files**: Use `/load` to upload PDF files that will be processed and added to the knowledge base

## Configuration

The backend uses `src/backend/config.json` for LLM and RAG configuration. Default settings:
- LLM: DeepSeek v3.1 (via Ollama)
- Embeddings: Nomic Embed Text
- Vector Store: ChromaDB with MMR retrieval

## API Endpoints

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

### Backend Setup

```bash
cd src/backend
pip install -r requirements.txt
python main.py
```

### Frontend Setup

```bash
cd src/frontend
npm install
npm run dev
```

## Notes

- Data is persisted in `src/backend/data/` directory
- Ollama models are stored in `./ollama_models` (mounted as volume)
