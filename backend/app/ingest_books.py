import os
import json
from typing import Dict, Any, List, Tuple
from pypdf import PdfReader
from .db import get_chroma_client, get_collection
from .embeddings import get_embedder

def simple_chunk(text: str, chunk_size=1200, overlap=200) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    chunks = []
    i = 0
    while i < len(text):
        chunks.append(text[i:i + chunk_size])
        i += (chunk_size - overlap)
    return chunks

def load_manifest(book_dir: str) -> Dict[str, Any]:
    path = os.path.join(book_dir, "manifest.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def pdf_path(book_dir: str, manifest: Dict[str, Any]) -> str:
    return os.path.join(book_dir, manifest["pdf_filename"])

def book_page_to_pdf_index(book_page: int, pdf_page_offset: int) -> int:
    return (book_page + pdf_page_offset) - 1

def compute_ranges(units: List[Dict[str, Any]], pdf_offset: int, pdf_total_pages: int) -> List[Dict[str, Any]]:
    units_sorted = sorted(units, key=lambda u: int(u.get("start_page", 0)))
    ranges = []
    for i, u in enumerate(units_sorted):
        start_book = int(u.get("start_page", 0))
        start_pdf = book_page_to_pdf_index(start_book, pdf_offset)

        if start_pdf < 0:
            start_pdf = 0
        if start_pdf >= pdf_total_pages:
            start_pdf = pdf_total_pages - 1

        if i + 1 < len(units_sorted):
            next_start_book = int(units_sorted[i + 1].get("start_page", 0))
            end_pdf = book_page_to_pdf_index(next_start_book, pdf_offset) - 1
        else:
            end_pdf = pdf_total_pages - 1

        if end_pdf < start_pdf:
            end_pdf = start_pdf

        # Compute end_pdf from manifest end_page if available, otherwise use next unit start
        end_book = u.get("end_page", None)
        if end_book is not None:
            end_pdf_from_manifest = book_page_to_pdf_index(end_book, pdf_offset)
            if end_pdf_from_manifest >= 0 and end_pdf_from_manifest < pdf_total_pages:
                end_pdf = end_pdf_from_manifest
            if end_pdf < start_pdf:
                end_pdf = start_pdf

        ranges.append({
            "unit_id": u["unit_id"],
            "title": u["title"],
            "start_book_page": start_book,
            "end_book_page": end_book,
            "start_page": start_book,  # Store book pages as start_page/end_page too
            "end_page": end_book,
            "start_pdf": start_pdf,
            "end_pdf": end_pdf
        })

    return ranges

def extract_pdf_text(reader: PdfReader, start_pdf: int, end_pdf: int) -> List[Tuple[int, str]]:
    out = []
    for p in range(start_pdf, end_pdf + 1):
        page = reader.pages[p]
        txt = page.extract_text() or ""
        out.append((p, txt))
    return out

def ingest_book(book_dir: str, chroma_path="chroma_db"):
    manifest = load_manifest(book_dir)
    book_id = manifest["book_id"]
    title = manifest.get("title", book_id)

    pdf_offset = int(manifest.get("page_map", {}).get("pdf_page_offset", 0))

    reader = PdfReader(pdf_path(book_dir, manifest))
    total_pages = len(reader.pages)

    ranges = compute_ranges(manifest["units"], pdf_offset, total_pages)

    client = get_chroma_client(chroma_path)

    units_col = client.get_or_create_collection("units")
    chunks_col = get_collection(client, "pdf_chunks")

    embedder = get_embedder(device="cpu")

    for r in ranges:
        unit_id = f"{book_id}:{r['unit_id']}"
        unit_title = r["title"]

        units_col.upsert(
            ids=[unit_id],
            documents=[unit_title],
            metadatas=[{
                "book_id": book_id,
                "unit_id": unit_id,
                "title": unit_title,
                "start_pdf": r["start_pdf"],
                "end_pdf": r["end_pdf"],
                "start_book_page": r["start_book_page"],
                "end_book_page": r.get("end_book_page", None),
                "start_page": r.get("start_page", r["start_book_page"]),  # Use book pages
                "end_page": r.get("end_page", r.get("end_book_page", None)),
                "pdf_page_offset": pdf_offset
            }]
        )

        pages = extract_pdf_text(reader, r["start_pdf"], r["end_pdf"])

        for (pdf_page, page_text) in pages:
            for ci, chunk in enumerate(simple_chunk(page_text)):
                chunk_id = f"{unit_id}:p{pdf_page}:c{ci}"
                vec = embedder.embed_query(chunk)

                chunks_col.add(
                    ids=[chunk_id],
                    documents=[chunk],
                    embeddings=[vec],
                    metadatas=[{
                        "book_id": book_id,
                        "unit_id": unit_id,
                        "unit_title": unit_title,
                        "pdf_page": pdf_page
                    }]
                )

    return {
        "book_id": book_id,
        "title": title,
        "units_ingested": len(ranges),
        "pdf_pages": total_pages
    }

def ingest_all_books(books_root: str, chroma_path="chroma_db"):
    results = []
    for name in os.listdir(books_root):
        book_dir = os.path.join(books_root, name)
        if not os.path.isdir(book_dir):
            continue
        manifest_path = os.path.join(book_dir, "manifest.json")
        if not os.path.exists(manifest_path):
            continue
        results.append(ingest_book(book_dir, chroma_path=chroma_path))
    return results
