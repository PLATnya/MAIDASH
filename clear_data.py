import os
from pathlib import Path

def clear_data_folder():
    """Delete all files from the 'data' directory (excluding subdirectories)."""
    data_dir = Path(__file__).parent / "data"
    if not data_dir.exists() or not data_dir.is_dir():
        print(f"'data' directory not found at: {data_dir.resolve()}")
        return

    removed = 0
    for item in data_dir.iterdir():
        if item.is_file():
            try:
                item.unlink()
                removed += 1
            except Exception as e:
                print(f"Could not delete {item}: {e}")
    print(f"Cleared {removed} files from '{data_dir.resolve()}'.")

if __name__ == "__main__":
    clear_data_folder()
