"""Tests for lesson plan deduplication before save."""

from app.plan_deduplication import dedupe_book_plan, dedupe_unit_plan, is_near_duplicate, partition_plan_items_for_display


def test_is_near_duplicate_titles():
    assert is_near_duplicate("Key Scientific Concepts", "Key scientific concepts")
    assert is_near_duplicate("Summary/Wrap-Up", "Summary")
    assert is_near_duplicate(
        "Unit review, connections between topics",
        "Unit review, connections between topics",
    )
    assert not is_near_duplicate("Lesson Explanation", "Learning Objectives")


def test_dedupe_duplicate_section_titles():
    plan = {
        "unit_title": "Biology",
        "items": [
            {"id": "a", "type": "other", "title": "Lesson Explanation", "keywords": ["intro"], "must_cover": True},
            {"id": "b", "type": "other", "title": "Key Scientific Concepts", "keywords": ["hypothesis"], "must_cover": True},
            {"id": "c", "type": "vocab", "title": "Key Scientific Concepts", "keywords": ["observation"], "must_cover": True},
        ],
    }
    cleaned = dedupe_unit_plan(plan)
    titles = [i["title"] for i in cleaned["items"]]
    assert titles.count("Key Scientific Concepts") == 1
    concepts = next(i for i in cleaned["items"] if "concept" in i["title"].lower())
    assert "hypothesis" in concepts["keywords"]
    assert "observation" in concepts["keywords"]


def test_dedupe_duplicate_bullets_and_vocabulary():
    plan = {
        "unit_title": "Test",
        "items": [
            {
                "id": "obj",
                "type": "other",
                "title": "Learning Objectives",
                "keywords": [
                    "Observation",
                    "Hypothesis",
                    "Observation",
                ],
                "must_cover": True,
            },
            {
                "id": "vocab",
                "type": "vocab",
                "title": "Scientific Vocabulary",
                "keywords": ["Hypothesis", "Variable", "hypothesis"],
                "must_cover": True,
            },
        ],
    }
    cleaned = dedupe_unit_plan(plan)
    obj = next(i for i in cleaned["items"] if "objective" in i["title"].lower())
    vocab = next(i for i in cleaned["items"] if i["type"] == "vocab")
    assert obj["keywords"] == ["Observation", "Hypothesis"]
    assert vocab["keywords"] == ["Variable"]


def test_dedupe_summary_quiz_and_activities():
    plan = {
        "unit_title": "Test",
        "items": [
            {"id": "s1", "type": "wrap_up", "title": "Summary", "keywords": ["recap A", "recap A"], "must_cover": True},
            {"id": "s2", "type": "other", "title": "Summary/Wrap-Up", "keywords": ["recap B"], "must_cover": True},
            {"id": "q1", "type": "exercises", "title": "Quiz", "keywords": ["Q1", "Q1"], "must_cover": True},
            {"id": "q2", "type": "exercises", "title": "Quiz or Review Questions", "keywords": ["Q2"], "must_cover": True},
            {"id": "a1", "type": "exercises", "title": "Experiments or Activities", "keywords": ["lab 1"], "must_cover": True},
            {"id": "a2", "type": "exercises", "title": "Experiments and Activities", "keywords": ["lab 1", "lab 2"], "must_cover": True},
        ],
    }
    cleaned = dedupe_unit_plan(plan)
    kinds = {}
    for item in cleaned["items"]:
        title = item["title"].lower()
        if "summary" in title or "wrap" in title:
            kinds.setdefault("summary", []).append(item)
        elif "quiz" in title or "review" in title:
            kinds.setdefault("quiz", []).append(item)
        elif "activit" in title or "experiment" in title:
            kinds.setdefault("activities", []).append(item)
    assert len(kinds.get("summary", [])) == 1
    assert len(kinds.get("quiz", [])) == 1
    assert len(kinds.get("activities", [])) == 1
    assert kinds["summary"][0]["keywords"] == ["recap A", "recap B"]
    assert kinds["quiz"][0]["keywords"] == ["Q1", "Q2"]
    assert kinds["activities"][0]["keywords"] == ["lab 1", "lab 2"]


def test_dedupe_book_plan_objectives():
    plan = {
        "objectives": [
            "Teach science in order",
            "Teach science in order",
            "Build scientific thinking",
        ],
        "units": [
            {"unit_id": "u1", "title": "A", "keywords": ["cell", "cell", "tissue"]},
        ],
    }
    cleaned = dedupe_book_plan(plan)
    assert cleaned["objectives"] == ["Teach science in order", "Build scientific thinking"]
    assert cleaned["units"][0]["keywords"] == ["cell", "tissue"]


def test_existing_science_plan_deduplication():
    plan = {
        "unit_title": "Biology",
        "items": [
            {
                "id": "learning_objectives",
                "type": "other",
                "title": "Learning Objectives",
                "keywords": ["Observation skills", "Hypothesis formation", "Controlled experiments"],
                "must_cover": True,
            },
            {
                "id": "key_scientific_concepts",
                "type": "other",
                "title": "Key Scientific Concepts",
                "keywords": ["Hypothesis", "Observations", "Controlled experiment"],
                "must_cover": True,
            },
            {
                "id": "scientific_vocabulary",
                "type": "vocab",
                "title": "Scientific Vocabulary",
                "keywords": ["Controlled experiment", "Hypothesis", "Observations"],
                "must_cover": True,
            },
            {
                "id": "quiz_review_questions",
                "type": "exercises",
                "title": "Quiz/Review Questions",
                "keywords": ["Controlled experiments", "Hypothesis formation"],
                "must_cover": True,
            },
        ],
    }
    cleaned = dedupe_unit_plan(plan)
    vocab = next(i for i in cleaned["items"] if i["type"] == "vocab")
    assert vocab["keywords"] == []
    quiz = next(i for i in cleaned["items"] if "quiz" in i["title"].lower())
    assert quiz["keywords"] == []
    concepts = next(i for i in cleaned["items"] if "concept" in i["title"].lower())
    assert concepts["keywords"] == ["Observations"]


def test_partition_avoids_overlapping_buckets():
    items = [
        {"id": "1", "type": "other", "title": "Lesson Explanation", "keywords": ["intro"], "must_cover": True},
        {"id": "2", "type": "other", "title": "Key Scientific Concepts", "keywords": ["cells"], "must_cover": True},
        {"id": "3", "type": "other", "title": "Key Scientific Concepts", "keywords": ["tissues"], "must_cover": True},
        {"id": "4", "type": "other", "title": "Unit review, connections between topics", "keywords": ["review"], "must_cover": True},
        {"id": "5", "type": "wrap_up", "title": "Summary", "keywords": ["recap"], "must_cover": True},
    ]
    partitioned = partition_plan_items_for_display(items)
    all_ids = []
    for bucket in partitioned.values():
        all_ids.extend(i["id"] for i in bucket)
    assert len(all_ids) == len(set(all_ids))
    assert len(partitioned["concepts"]) == 1
    assert partitioned["concepts"][0]["keywords"] == ["cells", "tissues"]
    assert len(partitioned["explanation_items"]) == 2
    assert partitioned["summary"][0]["title"] == "Summary"
