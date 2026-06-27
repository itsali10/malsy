"""Compare Part 1 vs Part 2 RAG content for history units."""
import sys

sys.path.insert(0, ".")

from app.chapters_service import get_unit_content
from app.lesson_graph import _all_unit_chunks, retrieve_for_item


def main() -> None:
    print("=" * 70)
    print("PART 1 vs PART 2 CONTENT CHECK — history_g6")
    print("=" * 70)
    problems = 0

    for n in range(1, 7):
        uid = f"history_g6:unit_{n:02d}"
        ui = get_unit_content(uid)
        if "error" in ui:
            print(f"\n{uid}: ERROR {ui['error']}")
            problems += 1
            continue

        title = ui.get("title", uid)
        pages = {
            "start_page": ui["start_page"],
            "end_page": ui["end_page"],
            "start_pdf": ui["start_pdf"],
            "end_pdf": ui["end_pdf"],
        }
        all_c = _all_unit_chunks(uid)
        p1 = retrieve_for_item(uid, title, k=8, unit_part=0, unit_pages=pages)
        p2 = retrieve_for_item(uid, title, k=8, unit_part=1, unit_pages=pages)
        t1 = "\n".join(c["text"] for c in p1).strip()
        t2 = "\n".join(c["text"] for c in p2).strip()

        print(f"\n{uid}")
        print(f"  Title: {title}")
        print(f"  Total chunks in unit: {len(all_c)}")
        print(f"  Part 1: {len(p1)} chunk(s), {len(t1)} chars")
        print(f"  Part 2: {len(p2)} chunk(s), {len(t2)} chars")

        if t1 == t2:
            print("  *** FAIL: Part 1 and Part 2 text is IDENTICAL ***")
            problems += 1
        elif not t2:
            print("  *** FAIL: Part 2 is EMPTY ***")
            problems += 1
        elif not t1:
            print("  *** FAIL: Part 1 is EMPTY ***")
            problems += 1
        else:
            w1, w2 = set(t1.lower().split()), set(t2.lower().split())
            overlap = len(w1 & w2) / max(len(w1), len(w2)) if w1 and w2 else 0
            print(f"  OK — different content (word overlap {overlap:.0%})")
            print(f"  Part 1 begins: {t1[:90].replace(chr(10), ' ')}...")
            print(f"  Part 2 begins: {t2[:90].replace(chr(10), ' ')}...")

    print("\n" + "=" * 70)
    if problems:
        print(f"RESULT: {problems} unit(s) have Part 1 / Part 2 issues")
    else:
        print("RESULT: All units have distinct Part 1 and Part 2 content")
    print("=" * 70)


if __name__ == "__main__":
    main()
