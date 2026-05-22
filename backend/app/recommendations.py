from __future__ import annotations

from typing import Any, Dict, List, Optional


# Output schema:
# {
#   "recommended_next_action": "answer_again" | "continue_unit_part2" | "next_unit",
#   "next_steps": [string, ...]    # 1-5 items
# }


def build_recommendations(
    *,
    latest_attempt: Dict[str, Any],
    evaluation_summary: Dict[str, Any],
    unit_part: int,
) -> Dict[str, Any]:
    correct = bool(latest_attempt.get("correct", False))
    remediation_used = bool(latest_attempt.get("remediation_used", False))
    hint_after = int(latest_attempt.get("hint_count_after", 0) or 0)

    next_steps: List[str] = []
    if correct:
        if unit_part == 0:
            recommended_next_action = "continue_unit_part2"
            next_steps.append("Continue to the next part of this unit.")
        else:
            recommended_next_action = "next_unit"
            next_steps.append("Move on to the next unit.")
        needs_review = evaluation_summary.get("needs_review", [])
        if isinstance(needs_review, list) and needs_review:
            next_steps.append("Quickly review the topics you missed before (needs_review list).")
    else:
        recommended_next_action = "answer_again"
        if remediation_used:
            next_steps.append("Re-read the re-explanation and try the same question again.")
        elif hint_after == 1:
            next_steps.append("Use Hint #1 and try answering again in your own words.")
        elif hint_after == 2:
            next_steps.append("Use Hint #2 and try again. Focus on the key ideas from the lesson.")
        else:
            next_steps.append("Try again. Look back at the main ideas in the lesson.")

    recent_window = evaluation_summary.get("recent_window", {})
    recent_accuracy = None
    if isinstance(recent_window, dict):
        recent_accuracy = recent_window.get("accuracy")
    if isinstance(recent_accuracy, (int, float)) and recent_accuracy < 70:
        next_steps.append("Do a short review session: vocabulary + grammar key points from this unit.")

    # Trim to 1-5 items, keep most relevant first.
    if not next_steps:
        next_steps = ["Continue learning step by step and keep practicing."]
    next_steps = next_steps[:5]

    return {"recommended_next_action": recommended_next_action, "next_steps": next_steps}

