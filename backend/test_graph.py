from app.lesson_graph import lesson_graph

out = lesson_graph.invoke({
    "chapter_id": "ch_001",
    "section_index": 0,
    "student_answer": "Paris"   # just to test evaluation path
})

print("PLAN:\n", out["lesson_plan"])
print("\nTEACH:\n", out["teacher_text"][:500], "...")
print("\nQUIZ:\n", out["quiz"])
print("\nEVAL:\n", out["evaluation"])
