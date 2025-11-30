import PyPDF2
import sys
import os
from pdfminer.high_level import extract_text


class InfoSource:
    def __init__(self, name: str):
        self.name = name
        self.info = None
        self.file = None

        
    def get_info(self, query: str) -> str:
        return self.info

    def load_info_sourcer(self):
        self.file = open(self.file, "rb")

    def unload_info_sourcer(self):
        self.file.close()

    def retrive_info(self):
        pass

class ImageInfoSource(InfoSource):
    def __init__(self, name: str, image_path: str):
        super().__init__(name)
        self.info = None
        self.image_path = image_path

class TextInfoSource(InfoSource):
    def __init__(self, name: str, info: str = None):
        super().__init__(name)
        self.info = info


class PDFInfoSource(InfoSource):
    def __init__(self, name: str, pdf_path: str):
        super().__init__(name)
        self.info = ''
        self.pdf_path = pdf_path

    def retrive_info(self):
        # Using pdfminer.six to extract the text from the PDF file
        # We extract in one shot (extract_text opens and closes the file)
        self.info = extract_text(self.pdf_path)
        return self.info


def main():
    def get_info_source_class(filepath):
        _, ext = os.path.splitext(filepath.lower())
        if ext in ['.txt']:
            return TextInfoSource
        elif ext in ['.pdf']:
            return PDFInfoSource
        elif ext in ['.png', '.jpg', '.jpeg', '.bmp', '.gif']:
            return ImageInfoSource
        else:
            raise ValueError(f"Unsupported file extension: {ext}")

    if len(sys.argv) < 2:
        print("Usage: python info_retrival_engine.py <file_path>")
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.isfile(file_path):
        print(f"File not found: {file_path}")
        sys.exit(1)

    ext = os.path.splitext(file_path)[1].lower()
    try:
        info_source_cls = get_info_source_class(file_path)
    except ValueError as e:
        print(e)
        sys.exit(1)

    info_source = None
    if issubclass(info_source_cls, TextInfoSource):
        # For Text files, read as plain text
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        info_source = TextInfoSource(name=os.path.basename(file_path), info=text)
    elif issubclass(info_source_cls, PDFInfoSource):
        info_source = PDFInfoSource(name=os.path.basename(file_path), pdf_path=file_path)
        info_source.file = file_path  # Set the file path
        info = info_source.retrive_info()
        print(info)
        sys.exit(0)
    elif issubclass(info_source_cls, ImageInfoSource):
        info_source = ImageInfoSource(name=os.path.basename(file_path), image_path=file_path)
    else:
        print("Unsupported info source type.")
        sys.exit(1)

    # For Text and Image sources, just print .info (Text) or the object for Image
    if isinstance(info_source, TextInfoSource):
        print(info_source.info)
    elif isinstance(info_source, ImageInfoSource):
        print(f"Loaded image source: {info_source.image_path}")

if __name__ == "__main__":
    main()
