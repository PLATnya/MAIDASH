#!/usr/bin/env python3
"""
Entrypoint script for backend application.

This script sets up Ollama, pulls required models, and starts the application.
"""
import os
import sys
import signal
import subprocess
import time
import stat
from pathlib import Path
from typing import List, Optional
import urllib.request
import urllib.error

# ============================================================================
# Configuration Constants
# ============================================================================

OLLAMA_DIR = Path("/app/.ollama")
OLLAMA_MODELS_DIR = OLLAMA_DIR / "models"
OLLAMA_URL = "http://localhost:11434"
OLLAMA_API_ENDPOINT = f"{OLLAMA_URL}/api/tags"
OLLAMA_READY_TIMEOUT = 30
OLLAMA_READY_INTERVAL = 1
APP_SCRIPT = "main.py"

# Model names to pull (can be overridden via environment variables)
MODELS = [
    os.environ.get("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text:latest"),
    os.environ.get("OLLAMA_LLM_MODEL", "deepseek-v3.1:671b-cloud"),
]

# Global variable to store Ollama process
ollama_process: Optional[subprocess.Popen] = None

# ============================================================================
# Utility Functions
# ============================================================================

def log_info(message: str) -> None:
    """Log an info message."""
    print(f"[INFO] {message}", flush=True)


def log_warn(message: str) -> None:
    """Log a warning message."""
    print(f"[WARN] {message}", flush=True)


def log_error(message: str) -> None:
    """Log an error message."""
    print(f"[ERROR] {message}", file=sys.stderr, flush=True)


# ============================================================================
# Ollama Setup Functions
# ============================================================================

def setup_ollama_directory() -> None:
    """Create and configure Ollama directory with proper permissions."""
    log_info("Creating Ollama directory...")
    
    OLLAMA_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Set permissions (755 = rwxr-xr-x)
    os.chmod(OLLAMA_DIR, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
    
    # Try to change ownership (may fail in some environments)
    try:
        uid = os.getuid()
        gid = os.getgid()
        os.chown(OLLAMA_DIR, uid, gid)
        for root, dirs, files in os.walk(OLLAMA_DIR):
            os.chown(root, uid, gid)
            for d in dirs:
                os.chown(os.path.join(root, d), uid, gid)
            for f in files:
                os.chown(os.path.join(root, f), uid, gid)
    except (OSError, PermissionError):
        # Ignore permission errors (may not have chown privileges)
        pass
    
    log_info(f"Ollama directory created at {OLLAMA_DIR}")


def start_ollama_server() -> subprocess.Popen:
    """
    Start Ollama server in the background.
    
    Returns:
        Popen object for the Ollama server process
    """
    log_info("Starting Ollama server...")
    
    process = subprocess.Popen(
        ["ollama", "serve"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True
    )
    
    log_info(f"Ollama server started with PID: {process.pid}")
    return process


def wait_for_ollama_ready(timeout: int = OLLAMA_READY_TIMEOUT, interval: int = OLLAMA_READY_INTERVAL) -> bool:
    """
    Wait for Ollama API to become ready.
    
    Args:
        timeout: Maximum time to wait in seconds
        interval: Check interval in seconds
    
    Returns:
        True if Ollama is ready, False if timeout exceeded
    """
    log_info(f"Waiting for Ollama to be ready (timeout: {timeout}s)...")
    
    elapsed = 0
    while elapsed < timeout:
        try:
            with urllib.request.urlopen(OLLAMA_API_ENDPOINT, timeout=2) as response:
                if response.getcode() == 200:
                    log_info("Ollama is ready!")
                    return True
        except (urllib.error.URLError, urllib.error.HTTPError, OSError):
            # API not ready yet, continue waiting
            pass
        
        time.sleep(interval)
        elapsed += interval
    
    log_warn(f"Ollama did not become ready after {timeout} seconds, continuing anyway...")
    return False


def cleanup_ollama(process: Optional[subprocess.Popen]) -> None:
    """
    Cleanup function to stop Ollama server on exit.
    
    Args:
        process: Popen object for the Ollama server process
    """
    if process is None:
        return
    
    try:
        if process.poll() is None:  # Process is still running
            log_info(f"Shutting down Ollama server (PID: {process.pid})...")
            process.terminate()
            
            # Wait up to 5 seconds for graceful shutdown
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                log_warn("Ollama server did not terminate gracefully, forcing kill...")
                process.kill()
                process.wait()
            
            log_info("Ollama server stopped")
    except ProcessLookupError:
        # Process already terminated
        pass
    except Exception as e:
        log_error(f"Error during Ollama cleanup: {e}")


# ============================================================================
# Model Management Functions
# ============================================================================

def run_ollama_signin() -> bool:
    """
    Run Ollama signin process.
    
    Returns:
        True if signin succeeded, False otherwise
    """
    log_info("Running Ollama signin...")
    log_info("Please complete the signin process and press Enter when done...")
    
    try:
        result = subprocess.run(
            ["ollama", "signin"],
            check=True,
            text=True
        )
        log_info("Signin completed successfully")
        return True
    except subprocess.CalledProcessError:
        log_error("Signin failed")
        return False
    except FileNotFoundError:
        log_error("Ollama command not found")
        return False


def pull_ollama_model(model_name: str) -> bool:
    """
    Pull a specific Ollama model.
    
    Args:
        model_name: Name of the model to pull
    
    Returns:
        True if model was pulled successfully, False otherwise
    """
    if not model_name:
        log_error("Model name is required")
        return False
    
    log_info(f"Pulling model: {model_name}...")
    
    try:
        result = subprocess.run(
            ["ollama", "pull", model_name],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        log_info(f"Successfully pulled model: {model_name}")
        return True
    except subprocess.CalledProcessError as e:
        log_error(f"Failed to pull model: {model_name}")
        if e.stderr:
            log_error(f"Error output: {e.stderr}")
        return False
    except FileNotFoundError:
        log_error("Ollama command not found")
        return False


def pull_required_models() -> bool:
    """
    Pull all required Ollama models.
    
    Returns:
        True if all models were pulled successfully, False otherwise
    """
    log_info("Pulling required Ollama models...")
    
    failed_models = []
    for model in MODELS:
        if not pull_ollama_model(model):
            failed_models.append(model)
    
    if not failed_models:
        log_info("All models pulled successfully!")
        return True
    else:
        log_warn(f"Some models failed to pull: {', '.join(failed_models)}")
        return False


# ============================================================================
# Application Startup
# ============================================================================

def start_application() -> None:
    """Start the main application."""
    log_info(f"Starting application: {APP_SCRIPT}")
    
    # Use exec to replace current process
    os.execvp("python", ["python", APP_SCRIPT])


# ============================================================================
# Signal Handlers
# ============================================================================

def signal_handler(signum: int, frame) -> None:
    """Handle termination signals."""
    log_info(f"Received signal {signum}, cleaning up...")
    cleanup_ollama(ollama_process)
    sys.exit(0)


# ============================================================================
# Main Execution
# ============================================================================

def main() -> None:
    """Main entry point for the entrypoint script."""
    global ollama_process
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Setup Ollama directory
        setup_ollama_directory()
        
        # Start Ollama server
        ollama_process = start_ollama_server()
        
        # Wait for Ollama to be ready
        wait_for_ollama_ready()  # Continue even if not ready
        
        # Run signin (optional, may fail if already signed in)
        if not run_ollama_signin():
            log_warn("Signin skipped or failed, continuing...")
        
        # Pull required models
        if not pull_required_models():
            log_warn("Some models may not be available")
        
        # Start the application (this replaces the current process)
        start_application()
        
    except KeyboardInterrupt:
        log_info("Interrupted by user")
        cleanup_ollama(ollama_process)
        sys.exit(0)
    except Exception as e:
        log_error(f"Unexpected error: {e}")
        cleanup_ollama(ollama_process)
        sys.exit(1)


if __name__ == "__main__":
    main()

