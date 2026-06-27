"""
Run this script (from the backend/ directory) after placing your history PDF:

    python ingest_history.py

Uses lesson-scoped ingestion: each chunk is owned by exactly one lesson.
"""

import os
import sys

BOOK_DIR = os.path.join("data", "books", "history_g6")
CHROMA_PATH = "chroma_db"


def main():
    manifest_path = os.path.join(BOOK_DIR, "manifest.json")
    lessons_path = os.path.join(BOOK_DIR, "lessons.json")
    if not os.path.exists(manifest_path):
        print(f"ERROR: manifest not found at {manifest_path}")
        sys.exit(1)
    if not os.path.exists(lessons_path):
        print(f"ERROR: lessons catalog not found at {lessons_path}")
        sys.exit(1)

    import json
    manifest = json.loads(open(manifest_path, encoding="utf-8").read())
    pdf_name = manifest.get("pdf_filename", "")
    pdf_path = os.path.join(BOOK_DIR, pdf_name)

    if not os.path.exists(pdf_path):
        print(f"ERROR: PDF not found at {pdf_path}")
        print(f"       Copy your history PDF to that path and rename it to: {pdf_name}")
        sys.exit(1)

    print(f"Ingesting '{manifest.get('title', 'History')}' with lesson-scoped chunks ...")

    from app.history_ingest import ingest_history_book
    from app.history_lessons import sync_manifest_from_catalog, validate_lesson_catalog

    sync_manifest_from_catalog("history_g6")
    validation = validate_lesson_catalog("history_g6")
    if not validation.get("valid"):
        print("WARNING: lessons catalog validation issues:")
        for err in validation.get("errors") or []:
            print(f"  - {err}")

    result = ingest_history_book(BOOK_DIR, chroma_path=CHROMA_PATH)

    print("\nDone!")
    print(f"  book_id         : {result['book_id']}")
    print(f"  lessons ingested: {result['lessons_ingested']}")
    print(f"  chunks written  : {result['chunks_written']}")
    print(f"  chunks purged   : {result['chunks_purged']}")
    print(f"  PDF pages       : {result['pdf_pages']}")
    print("\nRe-run the backend and open History lessons in malsy-ui.")


if __name__ == "__main__":
    main()
