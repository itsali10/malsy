import os
from app.ingest_books import ingest_all_books

if __name__ == "__main__":
    books_root = os.path.join("data", "books")
    out = ingest_all_books(books_root, chroma_path="chroma_db")
    print(out)
