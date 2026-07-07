"""Tests for English lesson plan page scoping and teaching retrieval."""

from app.lesson_content_mapping import (
    LESSON_EXTRACTION_FAILED_MESSAGE,
    compute_strict_lesson_bounds,
    find_manifest_lesson_by_title,
    resolve_lesson_for_planning,
    retrieve_chunks_for_lesson,
    truncate_text_at_next_lesson,
    validate_lesson_extraction_for_teaching,
)


def test_find_lesson_by_exact_title():
    les = find_manifest_lesson_by_title("english_g6", "Why do we build bridges and tunnels?")
    assert les is not None
    assert les["unit_id"] == "unit_01"
    assert les["start_page"] == 9


def test_strict_bounds_never_include_next_lesson_pages():
    lessons = [
        {"unit_id": "unit_01", "title": "L1", "start_page": 9, "end_page": 28},
        {"unit_id": "unit_02", "title": "L2", "start_page": 17, "end_page": 28},
    ]
    start, end, nxt = compute_strict_lesson_bounds(lessons[0], lessons)
    assert start == 9
    assert end == 16
    assert nxt["unit_id"] == "unit_02"


def test_title_is_source_of_truth_over_unit_id():
    info = resolve_lesson_for_planning(
        "english_g6",
        "english_g6:unit_01",
        {"title": "Overcoming Earth's Obstacles", "unit_id": "unit_01"},
    )
    assert info["unit_id"] == "unit_02"
    assert info["start_page"] == 17
    assert info["end_page"] == 28


def test_truncate_discards_text_after_next_lesson_heading():
    text = (
        "Grammar in Use for lesson one. "
        "Overcoming Earth's Obstacles is the next lesson title here."
    )
    truncated, hit = truncate_text_at_next_lesson(
        text,
        ["Overcoming Earth's Obstacles"],
    )
    assert hit is True
    assert "Overcoming" not in truncated
    assert "Grammar in Use" in truncated


def test_teaching_retrieval_scoped_to_bridges_lesson():
    """English lesson 1 must not include next lesson content."""
    lesson_id = "english_g6:unit_01"
    title = "Why do we build bridges and tunnels?"
    plan_unit = {"title": title, "unit_id": "unit_01"}
    chunks, source, mapping = retrieve_chunks_for_lesson(
        lesson_id,
        title,
        book_id="english_g6",
        plan_unit=plan_unit,
        unit_part=0,
        k=24,
    )
    combined = "\n".join(c["text"] for c in chunks)
    validation = mapping.get("extraction_validation") or {}
    assert chunks, f"expected chunks, got source={source}"
    assert validation.get("ok"), validation.get("errors")
    assert "overcoming" not in combined.lower()
    assert "bridge" in combined.lower() or "tunnel" in combined.lower()
    pages = [int(c["meta"].get("pdf_page") or 0) for c in chunks]
    assert max(pages) <= 16, f"page leak: {pages}"


def test_english_sections_do_not_split_pages_by_part_index():
    """Listening and pronunciation sections scope to their own pages (not page halves)."""
    lesson_id = "english_g6:unit_01"
    title = "Why do we build bridges and tunnels?"
    plan_unit = {"title": title, "unit_id": "unit_01"}
    chunks_p2, _, _ = retrieve_chunks_for_lesson(
        lesson_id, title, book_id="english_g6", plan_unit=plan_unit, unit_part=2, k=24
    )
    chunks_p3, _, _ = retrieve_chunks_for_lesson(
        lesson_id, title, book_id="english_g6", plan_unit=plan_unit, unit_part=3, k=24
    )
    pages_p2 = {int(c["meta"].get("book_page") or c["meta"].get("pdf_page") or 0) for c in chunks_p2}
    pages_p3 = {int(c["meta"].get("book_page") or c["meta"].get("pdf_page") or 0) for c in chunks_p3}
    assert pages_p2 == {15}, f"listening pages: {pages_p2}"
    assert pages_p3 == {16}, f"pronunciation pages: {pages_p3}"


def test_english_reading_grammar_sections_do_not_overlap():
    """Reading and Grammar must use disjoint pages and content."""
    from app.language_lesson_sections import section_type_for_index

    lesson_id = "english_g6:unit_01"
    title = "Why do we build bridges and tunnels?"
    plan_unit = {"title": title, "unit_id": "unit_01"}
    reading_chunks, _, _ = retrieve_chunks_for_lesson(
        lesson_id, title, book_id="english_g6", plan_unit=plan_unit, unit_part=0, k=50
    )
    grammar_chunks, _, _ = retrieve_chunks_for_lesson(
        lesson_id, title, book_id="english_g6", plan_unit=plan_unit, unit_part=1, k=50
    )
    reading_pages = {int(c["meta"].get("book_page") or 0) for c in reading_chunks}
    grammar_pages = {int(c["meta"].get("book_page") or 0) for c in grammar_chunks}
    assert reading_pages & grammar_pages == set()
    reading_text = "\n".join(c["text"] for c in reading_chunks).lower()
    grammar_text = "\n".join(c["text"] for c in grammar_chunks).lower()
    assert "grammar in use" not in reading_text
    assert "before you read" not in grammar_text
    assert section_type_for_index(0) == "reading"
    assert all((c.get("meta") or {}).get("section_type") in {"reading", "vocab"} for c in reading_chunks)
    assert all((c.get("meta") or {}).get("section_type") == "grammar" for c in grammar_chunks)


def test_extraction_failure_message_constant():
    assert "reprocess" in LESSON_EXTRACTION_FAILED_MESSAGE.lower()
    assert "lesson extraction failed" in LESSON_EXTRACTION_FAILED_MESSAGE.lower()


def test_science_lesson_parts_cover_full_lesson_without_leak():
    """Science lesson 1: parts must stay within pages 1-8 and never include lesson 2 chunks."""
    lesson_id = "science_g6:unit_01_lesson_01"
    title = "Science and the Scientific Method"
    plan_unit = {"title": title, "unit_id": "unit_01_lesson_01"}
    chunks_p0, _, mapping_p0 = retrieve_chunks_for_lesson(
        lesson_id, title, book_id="science_g6", plan_unit=plan_unit, unit_part=0, k=50
    )
    chunks_p1, _, mapping_p1 = retrieve_chunks_for_lesson(
        lesson_id, title, book_id="science_g6", plan_unit=plan_unit, unit_part=1, k=50
    )
    pages_p0 = {int(c["meta"].get("book_page") or 0) for c in chunks_p0}
    pages_p1 = {int(c["meta"].get("book_page") or 0) for c in chunks_p1}
    assert mapping_p0.get("extraction_validation", {}).get("ok"), mapping_p0
    assert max(pages_p0 | pages_p1) <= 8
    assert min(pages_p0 | pages_p1) >= 1
    assert 9 not in pages_p0 and 9 not in pages_p1
    assert pages_p0 & pages_p1 == set()
    for c in chunks_p0 + chunks_p1:
        assert "unit_01_lesson_02" not in str(c["meta"].get("unit_id") or "")
    assert pages_p0 | pages_p1 <= {1, 2, 3, 4, 5, 6, 7, 8}


def test_validate_rejects_next_lesson_title_in_text():
    validation = validate_lesson_extraction_for_teaching(
        lesson_title="Why do we build bridges and tunnels?",
        chunks=[{"text": "Some bridges. Overcoming Earth's Obstacles begins here."}],
        next_lesson={"title": "Overcoming Earth's Obstacles"},
    )
    assert not validation["ok"]
    assert validation["next_lesson_title_in_text"] is True
