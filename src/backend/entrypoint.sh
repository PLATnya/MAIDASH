#!/bin/bash
# Entrypoint script for backend application
# This script sets up Ollama, pulls required models, and starts the application

set -e

# ============================================================================
# Configuration Constants
# ============================================================================

OLLAMA_DIR="/app/.ollama"
OLLAMA_MODELS_DIR="${OLLAMA_DIR}/models"
OLLAMA_URL="http://localhost:11434"
OLLAMA_API_ENDPOINT="${OLLAMA_URL}/api/tags"
OLLAMA_READY_TIMEOUT=30
OLLAMA_READY_INTERVAL=1
APP_SCRIPT="main.py"

# Model names to pull (can be overridden via environment variables)
MODELS=(
    "${OLLAMA_EMBEDDING_MODEL:-nomic-embed-text:latest}"
    "${OLLAMA_LLM_MODEL:-deepseek-v3.1:671b-cloud}"
)

# ============================================================================
# Utility Functions
# ============================================================================

log_info() {
    echo "[INFO] $*"
}

log_warn() {
    echo "[WARN] $*"
}

log_error() {
    echo "[ERROR] $*" >&2
}

# ============================================================================
# Ollama Setup Functions
# ============================================================================

setup_ollama_directory() {
    # Create and configure Ollama directory with proper permissions
    log_info "Creating Ollama directory..."
    mkdir -p "${OLLAMA_MODELS_DIR}"
    chmod -R 755 "${OLLAMA_DIR}"
    
    # Ensure the directory is writable by the current user
    # This may fail in some environments, so we ignore errors
    chown -R "$(id -u):$(id -g)" "${OLLAMA_DIR}" 2>/dev/null || true
    
    log_info "Ollama directory created at ${OLLAMA_DIR}"
}

start_ollama_server() {
    # Start Ollama server in the background
    # Returns: PID of the Ollama server process
    log_info "Starting Ollama server..."
    ollama serve &
    local pid=$!
    log_info "Ollama server started with PID: ${pid}"
    echo "${pid}"
}

wait_for_ollama_ready() {
    # Wait for Ollama API to become ready
    # Args: timeout (default: 30s), interval (default: 1s)
    # Returns: 0 if ready, 1 if timeout
    local timeout=${1:-${OLLAMA_READY_TIMEOUT}}
    local interval=${2:-${OLLAMA_READY_INTERVAL}}
    local elapsed=0
    
    log_info "Waiting for Ollama to be ready (timeout: ${timeout}s)..."
    
    while [ ${elapsed} -lt ${timeout} ]; do
        if curl -s "${OLLAMA_API_ENDPOINT}" > /dev/null 2>&1; then
            log_info "Ollama is ready!"
            return 0
        fi
        
        sleep ${interval}
        elapsed=$((elapsed + interval))
    done
    
    log_warn "Ollama did not become ready after ${timeout} seconds, continuing anyway..."
    return 1
}

cleanup_ollama() {
    # Cleanup function to stop Ollama server on exit
    # Args: pid - Process ID of Ollama server
    local pid=$1
    if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
        log_info "Shutting down Ollama server (PID: ${pid})..."
        kill "${pid}" 2>/dev/null || true
        wait "${pid}" 2>/dev/null || true
        log_info "Ollama server stopped"
    fi
}

# ============================================================================
# Model Management Functions
# ============================================================================

run_ollama_signin() {
    # Run Ollama signin process
    log_info "Running Ollama signin..."
    log_info "Please complete the signin process and press Enter when done..."
    
    if ollama signin; then
        log_info "Signin completed successfully"
        return 0
    else
        log_error "Signin failed"
        return 1
    fi
}

pull_ollama_model() {
    # Pull a specific Ollama model
    # Args: model_name - Name of the model to pull
    local model_name=$1
    if [ -z "${model_name}" ]; then
        log_error "Model name is required"
        return 1
    fi
    
    log_info "Pulling model: ${model_name}..."
    if ollama pull "${model_name}"; then
        log_info "Successfully pulled model: ${model_name}"
        return 0
    else
        log_error "Failed to pull model: ${model_name}"
        return 1
    fi
}

pull_required_models() {
    # Pull all required Ollama models
    log_info "Pulling required Ollama models..."
    
    local failed_models=()
    for model in "${MODELS[@]}"; do
        if ! pull_ollama_model "${model}"; then
            failed_models+=("${model}")
        fi
    done
    
    if [ ${#failed_models[@]} -eq 0 ]; then
        log_info "All models pulled successfully!"
        return 0
    else
        log_warn "Some models failed to pull: ${failed_models[*]}"
        return 1
    fi
}

# ============================================================================
# Application Startup
# ============================================================================

start_application() {
    # Start the main application
    log_info "Starting application: ${APP_SCRIPT}"
    exec python "${APP_SCRIPT}"
}

# ============================================================================
# Main Execution
# ============================================================================

# Global variable to store Ollama PID for cleanup
OLLAMA_PID=""

cleanup_on_exit() {
    # Cleanup handler called by trap
    if [ -n "${OLLAMA_PID}" ]; then
        cleanup_ollama "${OLLAMA_PID}"
    fi
}

main() {
    # Main entry point for the entrypoint script
    
    # Setup Ollama directory
    setup_ollama_directory
    
    # Start Ollama server
    OLLAMA_PID=$(start_ollama_server)
    
    # Setup cleanup trap
    trap cleanup_on_exit EXIT INT TERM
    
    # Wait for Ollama to be ready
    wait_for_ollama_ready || true
    
    # Run signin (optional, may fail if already signed in)
    run_ollama_signin || log_warn "Signin skipped or failed, continuing..."
    
    # Pull required models
    pull_required_models || log_warn "Some models may not be available"
    
    # Start the application
    start_application
}

# Run main function
main "$@"
