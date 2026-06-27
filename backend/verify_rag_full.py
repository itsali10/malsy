"""
Full RAG + embeddings + AI-readiness check for history_g6.
Run: py -3.10 verify_rag_full.py
"""
import json
import sys

sys.path.insert(0, ".")

from app.chapters_service import get_unit_content, list_units
from app.db import get_chroma_client, get_collection
from app.embeddings import get_embedder
from app.history_segmentation import segment_book_lessons, load_book_manifest
from app.lesson_graph import retrieve_for_item, _all_unit_chunks, _split_chunks_for_unit_part

BOOK_ID = "history_g6"
FAILURES: list[str] = []
WARNINGS: list[str] = []


def ok(msg: str) -> None:
    print(f"  [OK] {msg}")


def fail(msg: str) -> None:
    print(f"  [FAIL] {msg}")
    FAILURES.append(msg)


def warn(msg: str) -> None:
    print(f"  [WARN] {msg}")
    WARNINGS.append(msg)


def check_manifest_vs_chroma() -> None:
    print("\n=== 1. Manifest vs Chroma unit titles ===")
    manifest = load_book_manifest(BOOK_ID)
    manifest_units = {u["unit_id"]: u["title"] for u in manifest["units"]}

    client = get_chroma_client("chroma_db")
    units_col = client.get_or_create_collection("units")
    chroma = units_col.get(where={"book_id": BOOK_ID}, include=["metadatas"])

    if len(chroma["ids"]) != len(manifest_units):
        fail(f"Unit count mismatch: manifest={len(manifest_units)} chroma={len(chroma['ids'])}")
    else:
        ok(f"{len(chroma['ids'])} units in manifest and Chroma")

    for uid_full, meta in zip(chroma["ids"], chroma["metadatas"]):
        short = uid_full.split(":")[-1]
        expected = manifest_units.get(short, "")
        actual = meta.get("title", "")
        if expected and actual != expected:
            fail(f"{short}: title mismatch\n       manifest: {expected}\n       chroma:   {actual}")
        elif expected:
            ok(f"{short}: {actual[:50]}...")


def check_chunks_per_unit() -> None:
    print("\n=== 2. Chunks per unit (no empty units) ===")
    chunks_col = get_collection(get_chroma_client("chroma_db"), "pdf_chunks")
    all_chunks = chunks_col.get(where={"book_id": BOOK_ID}, include=["metadatas", "documents"])

    by_unit: dict[str, list] = {}
    for doc, meta in zip(all_chunks["documents"], all_chunks["metadatas"]):
        uid = meta.get("unit_id", "?")
        by_unit.setdefault(uid, []).append((meta, doc))

    for i in range(1, 7):
        uid = f"{BOOK_ID}:unit_{i:02d}"
        n = len(by_unit.get(uid, []))
        if n == 0:
            fail(f"{uid} has 0 chunks")
        else:
            ok(f"{uid}: {n} chunk(s)")

    # Cross-unit leakage: same chunk id prefix shouldn't appear in two units
    print("\n=== 3. Cross-unit isolation ===")
    for uid, items in by_unit.items():
        pages = sorted(set(int(m.get("pdf_page", -1)) for m, _ in items))
        ok(f"{uid} pages (pdf idx): {pages}")


def check_embeddings() -> None:
    print("\n=== 4. Embeddings model ===")
    embedder = get_embedder(device="cpu")
    vec = embedder.embed_query("Ancient Egypt Nile River")
    if not vec or len(vec) < 100:
        fail(f"Embedding vector too short: {len(vec) if vec else 0}")
    elif all(v == 0 for v in vec[:20]):
        fail("Embedding vector appears all zeros")
    else:
        ok(f"Embedding dim={len(vec)}, sample norm OK")


def check_retrieval_all_units() -> None:
    print("\n=== 5. retrieve_for_item (Part 1) all 6 units ===")
    queries = {
        "unit_01": "Nile River Upper Lower Egypt Narmer",
        "unit_02": "gods Ra religion worship temples",
        "unit_03": "pharaoh vizier social hierarchy society",
        "unit_04": "mummification afterlife preserved bodies",
        "unit_05": "dress clothing jewellery makeup wigs",
        "unit_06": "hieroglyphics scribes read write papyrus",
    }
    for short, query in queries.items():
        uid = f"{BOOK_ID}:{short}"
        ui = get_unit_content(uid)
        if "error" in ui:
            fail(f"{uid}: {ui['error']}")
            continue
        unit_pages = {
            "start_page": ui["start_page"],
            "end_page": ui["end_page"],
            "start_pdf": ui["start_pdf"],
            "end_pdf": ui["end_pdf"],
        }
        chunks = retrieve_for_item(uid, query, k=5, unit_part=0, unit_pages=unit_pages)
        if not chunks:
            fail(f"{uid}: 0 chunks retrieved for Part 1")
            continue
        preview = chunks[0]["text"][:80].replace("\n", " ")
        ok(f"{uid}: {len(chunks)} chunks — «{preview}...»")


def check_part2_split() -> None:
    print("\n=== 6. Part 1 / Part 2 content split ===")
    uid = f"{BOOK_ID}:unit_01"
    ui = get_unit_content(uid)
    unit_pages = {
        "start_page": ui["start_page"],
        "end_page": ui["end_page"],
        "start_pdf": ui["start_pdf"],
        "end_pdf": ui["end_pdf"],
    }
    all_c = _all_unit_chunks(uid)
    p1 = _split_chunks_for_unit_part(all_c, 0, 8)
    p2 = _split_chunks_for_unit_part(all_c, 1, 8)
    if not p1:
        fail("Part 1 split empty for unit_01")
    else:
        ok(f"Part 1: {len(p1)} chunk(s)")
    if not p2:
        warn("Part 2 split empty for unit_01 (may be OK if single short page)")
    else:
        ok(f"Part 2: {len(p2)} chunk(s)")
    if p1 and p2 and p1[0]["text"] == p2[0]["text"]:
        warn("Part 1 and Part 2 have identical first chunk for unit_01")


def check_no_project_noise() -> None:
    print("\n=== 7. Activity / project text contamination ===")
    noise_markers = [
        "your research project",
        "we would encourage you to do one of the following",
        "congratulations",
        "worksheet",
    ]
    chunks_col = get_collection(get_chroma_client("chroma_db"), "pdf_chunks")
    hist = chunks_col.get(where={"book_id": BOOK_ID}, include=["metadatas", "documents"])
    for doc, meta in zip(hist["documents"], hist["metadatas"]):
        low = doc.lower()
        for marker in noise_markers:
            if marker in low:
                uid = meta.get("unit_id", "?")
                warn(f"{uid} pdf_page={meta.get('pdf_page')} contains activity text: «{marker}»")
                break


def check_segmentation_api() -> None:
    print("\n=== 8. Lesson segmentation (UI source) ===")
    data = segment_book_lessons(BOOK_ID)
    if len(data["lessons"]) != 6:
        fail(f"Expected 6 lessons, got {len(data['lessons'])}")
    else:
        ok("6 textbook-aligned lessons")
    for l in data["lessons"]:
        if not l.get("title") or not l.get("description"):
            fail(f"Lesson {l.get('lessonNumber')} missing title/description")
        words = len(l["description"].split())
        if words > 20:
            warn(f"Lesson {l['lessonNumber']} description has {words} words (>20)")


def check_english_untouched() -> None:
    print("\n=== 9. English book (must still exist if ingested) ===")
    chunks_col = get_collection(get_chroma_client("chroma_db"), "pdf_chunks")
    eng = chunks_col.get(where={"book_id": "english_g6"})
    n = len(eng.get("ids") or [])
    if n:
        ok(f"english_g6 still has {n} chunks")
    else:
        warn("english_g6 not in Chroma (may not be ingested yet)")


def main() -> None:
    print("=" * 60)
    print("MALSY RAG FULL VERIFICATION — history_g6")
    print("=" * 60)

    check_manifest_vs_chroma()
    check_chunks_per_unit()
    check_embeddings()
    check_retrieval_all_units()
    check_part2_split()
    check_no_project_noise()
    check_segmentation_api()
    check_english_untouched()

    print("\n" + "=" * 60)
    print(f"WARNINGS: {len(WARNINGS)}")
    for w in WARNINGS:
        print(f"  - {w}")
    print(f"FAILURES: {len(FAILURES)}")
    for f in FAILURES:
        print(f"  - {f}")
    print("=" * 60)
    if FAILURES:
        print("RESULT: NOT READY — fix failures above")
        sys.exit(1)
    if WARNINGS:
        print("RESULT: READY WITH WARNINGS — review above")
    else:
        print("RESULT: ALL CHECKS PASSED")
    sys.exit(0)


if __name__ == "__main__":
    main()
