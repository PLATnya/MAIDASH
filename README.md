# RAG Chatbot with Ollama and LangChain

A simple console chatbot that uses Retrieval-Augmented Generation (RAG) to answer questions based on text files in the `data` folder.

## Features

- Loads text files from the `data` folder
- Creates embeddings using Ollama's embedding model
- Uses ChromaDB as the vector store
- Answers questions using Ollama LLM with RAG
- Shows source documents used for answers

## Prerequisites

1. **Install Ollama**: Download and install from [https://ollama.ai](https://ollama.ai)

2. **Pull required models**:
   ```bash
   ollama pull deepseek-chat
   ollama pull nomic-embed-text
   ```

## Installation

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Add text files (`.txt`) to the `data` folder
2. Run the chatbot:
   ```bash
   python rag_chatbot.py
   ```
3. Type your questions and press Enter
4. Type `quit` or `exit` to end the conversation

## Example

```
You: What is LangChain?
Bot: LangChain is a framework for developing applications powered by language models...

You: How does RAG work?
Bot: RAG combines information retrieval with text generation...
```

## Customization

- Change the LLM model by modifying `model_name` in `create_qa_chain()` (default: "deepseek-chat")
- Adjust chunk size and overlap in `create_vector_store()`
- Modify the number of retrieved documents by changing `k` in `search_kwargs`

