"""
RAG diagnostic script for history_g6.
Run: py -3.10 check_rag.py
"""
import sys, json
sys.path.insert(0, ".")

import chromadb
from app.embeddings import get_embedder
embedder = get_embedder()

client = chromadb.PersistentClient(path="chroma_db")

# ── 1. Collections ──────────────────────────────────────────────────────────
colnames = [c.name for c in client.list_collections()]
print("=" * 60)
print("COLLECTIONS:", colnames)
print("=" * 60)

# ── 2. Units collection ─────────────────────────────────────────────────────
if "units" in colnames:
    units_col = client.get_collection("units")
    total = units_col.count()
    print(f"\nUNITS collection: {total} total records")
    hist = units_col.get(where={"book_id": "history_g6"})
    hist_ids = hist["ids"]
    print(f"  history_g6 units ({len(hist_ids)}):")
    for uid, meta in zip(hist_ids, hist["metadatas"]):
        print(f"    {uid}  |  title: {meta.get('title','?')}  |  pages: {meta.get('start_page','?')}-{meta.get('end_page','?')}")
else:
    print("\n[ERROR] 'units' collection is MISSING — history was never ingested!")

# ── 3. pdf_chunks collection ─────────────────────────────────────────────────
if "pdf_chunks" in colnames:
    chunks_col = client.get_collection("pdf_chunks")
    total = chunks_col.count()
    print(f"\nPDF_CHUNKS collection: {total} total records")
    hist_chunks = chunks_col.get(where={"book_id": "history_g6"})
    chunk_ids = hist_chunks["ids"]
    print(f"  history_g6 chunks: {len(chunk_ids)}")
    if chunk_ids:
        pages = sorted(set(int(m.get("pdf_page", 0)) for m in hist_chunks["metadatas"]))
        unit_ids = sorted(set(m.get("unit_id", "?") for m in hist_chunks["metadatas"]))
        print(f"  pages covered: {pages}")
        print(f"  unit_ids covered: {unit_ids}")
        print(f"\n  --- First chunk preview ---")
        m0 = hist_chunks["metadatas"][0]
        print(f"  unit_id: {m0.get('unit_id')}  |  page: {m0.get('pdf_page')}")
        print(f"  text: {hist_chunks['documents'][0][:300]}")
    else:
        print("  [ERROR] No chunks found — re-run: python run_ingest_books.py --book history")
else:
    print("\n[ERROR] 'pdf_chunks' collection is MISSING!")

# ── 4. Live retrieval test ───────────────────────────────────────────────────
print("\n" + "=" * 60)
print("LIVE RETRIEVAL TEST")
print("=" * 60)

if "pdf_chunks" in colnames and chunk_ids:
    from app.lesson_graph import retrieve_for_item
    from app.chapters_service import get_unit_content

    test_units = [
        ("history_g6:unit_01", "Ancient Egypt Nile River civilization pharaohs"),
        ("history_g6:unit_02", "Religion gods temples worship ancient Egypt"),
        ("history_g6:unit_06", "Hieroglyphics scribes writing ancient Egypt"),
    ]

    all_ok = True
    for uid, query in test_units:
        ui = get_unit_content(uid)
        unit_pages = {
            "start_page": ui.get("start_page", 0),
            "end_page": ui.get("end_page", 0),
            "start_pdf": ui.get("start_pdf", 0),
            "end_pdf": ui.get("end_pdf", 0),
        }
        # Single-page units: unit_part=0, page filter should keep ALL chunks
        chunks = retrieve_for_item(uid, query, k=5, unit_part=0, unit_pages=unit_pages)
        print(f"\n  Unit: {uid}")
        print(f"  start_pdf={unit_pages['start_pdf']}  end_pdf={unit_pages['end_pdf']}")
        print(f"  Retrieved: {len(chunks)} chunks")
        for c in chunks:
            print(f"    pdf_page={c['meta'].get('pdf_page')}  text: {c['text'][:120]}...")
        if len(chunks) == 0:
            print(f"  [ERROR] No chunks returned for {uid}!")
            all_ok = False
        else:
            print(f"  [OK]")

    if all_ok:
        print("\n[OK] retrieve_for_item works correctly for all tested history units.")
    else:
        print("\n[ERROR] Some units returned 0 chunks — page filter may still be broken.")
else:
    print("[SKIP] No history chunks to test retrieval on.")

print("\n" + "=" * 60)
print("DONE")
print("=" * 60)
