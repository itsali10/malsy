from app.db import get_chroma_client, get_collection

client = get_chroma_client("chroma_db")

chunks_col = get_collection(client, "pdf_chunks")
existing = chunks_col.get(where={"book_id": "history_g6"})
if existing["ids"]:
    chunks_col.delete(ids=existing["ids"])
    print(f"Deleted {len(existing['ids'])} old chunks")
else:
    print("No old chunks found")

units_col = client.get_or_create_collection("units")
old_units = units_col.get(where={"book_id": "history_g6"})
if old_units["ids"]:
    units_col.delete(ids=old_units["ids"])
    print(f"Deleted {len(old_units['ids'])} old units")
else:
    print("No old units found")

print("Cleared. Now re-ingesting...")

from app.ingest_books import ingest_book
result = ingest_book("data/books/history_g6", chroma_path="chroma_db")
print(f"Done! units ingested: {result['units_ingested']}, pages: {result['pdf_pages']}")
