"""Remove duplicate headings, bullets, and vocabulary from generated lesson plans before save."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Set

_NEAR_DUPLICATE_JACCARD = 0.82

_TITLE_ALIASES: Dict[str, str] = {
    "summary wrap up": "summary",
    "summary wrap-up": "summary",
    "wrap up": "summary",
    "wrap-up": "summary",
    "quiz review questions": "quiz",
    "quiz or review questions": "quiz",
    "quiz review": "quiz",
    "review questions": "quiz",
    "experiments or activities": "activities",
    "experiments activities": "activities",
    "experiment or activities": "activities",
    "key scientific concepts": "key scientific concepts",
    "scientific vocabulary": "scientific vocabulary",
    "historical vocabulary": "historical vocabulary",
    "learning objectives": "learning objectives",
    "lesson explanation": "lesson explanation",
    "diagrams images": "diagrams images",
    "diagrams and images": "diagrams images",
    "maps and images": "maps images",
    "maps images": "maps images",
}


def _normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _title_key(title: Any) -> str:
    normalized = _normalize_text(title)
    if not normalized:
        return ""
    return _TITLE_ALIASES.get(normalized, normalized)


def _token_set(value: Any) -> Set[str]:
    return {t for t in _normalize_text(value).split() if t}


def is_near_duplicate(a: Any, b: Any) -> bool:
    """True when two strings are identical or nearly the same after normalization."""
    left = str(a or "").strip()
    right = str(b or "").strip()
    if not left or not right:
        return False

    norm_left = _normalize_text(left)
    norm_right = _normalize_text(right)
    if norm_left == norm_right:
        return True
    if norm_left in norm_right or norm_right in norm_left:
        return True

    alias_left = _title_key(left)
    alias_right = _title_key(right)
    if alias_left and alias_left == alias_right:
        return True

    tokens_left = _token_set(left)
    tokens_right = _token_set(right)
    if not tokens_left or not tokens_right:
        return False
    overlap = len(tokens_left & tokens_right)
    union = len(tokens_left | tokens_right)
    return overlap / union >= _NEAR_DUPLICATE_JACCARD


def dedupe_strings(values: Iterable[Any], *, near: bool = True) -> List[str]:
    """Keep first occurrence of each unique string (optionally using near-duplicate matching)."""
    out: List[str] = []
    seen_norm: List[str] = []
    for raw in values:
        text = str(raw or "").strip()
        if not text:
            continue
        norm = _normalize_text(text)
        if not near:
            if norm in seen_norm:
                continue
            seen_norm.append(norm)
            out.append(text)
            continue
        if any(is_near_duplicate(text, kept) for kept in out):
            continue
        seen_norm.append(norm)
        out.append(text)
    return out


def _item_section_kind(item: Dict[str, Any]) -> str:
    title = str(item.get("title") or "")
    title_norm = _normalize_text(title)
    item_type = str(item.get("type") or "").lower()
    item_id = str(item.get("id") or "").lower()

    if "objective" in title_norm or "objective" in item_id:
        return "objectives"
    if "summary" in title_norm or "wrap" in title_norm or item_type == "wrap_up":
        return "summary"
    if any(w in title_norm for w in ("quiz", "review question", "assessment")):
        return "quiz"
    if any(w in title_norm for w in ("experiment", "activit", "lab", "hands-on")):
        return "activities"
    if item_type in ("vocab", "vocabulary") or "vocabulary" in title_norm:
        return "vocabulary"
    if "concept" in title_norm:
        return "concepts"
    if item_type == "visual" or any(w in title_norm for w in ("diagram", "image", "map", "chart")):
        return "visual"
    if item_type == "exercises":
        return "activities"
    return "other"


def _merge_item_cluster(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Merge duplicate checklist items, preserving the richest entry."""
    if len(items) == 1:
        return dict(items[0])

    def score(item: Dict[str, Any]) -> tuple:
        keywords = item.get("keywords") or []
        return (
            len(keywords),
            1 if item.get("must_cover") else 0,
            len(str(item.get("title") or "")),
        )

    ordered = sorted(items, key=score, reverse=True)
    merged = dict(ordered[0])
    keywords: List[str] = []
    for item in items:
        keywords.extend(item.get("keywords") or [])
    merged["keywords"] = dedupe_strings(keywords)
    merged["must_cover"] = any(bool(item.get("must_cover")) for item in items)
    return merged


def _cluster_items_by_title(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    clusters: List[List[Dict[str, Any]]] = []
    for item in items:
        title = str(item.get("title") or "").strip()
        placed = False
        for cluster in clusters:
            cluster_title = str(cluster[0].get("title") or "").strip()
            if is_near_duplicate(title, cluster_title):
                cluster.append(item)
                placed = True
                break
        if not placed:
            clusters.append([item])
    return [_merge_item_cluster(cluster) for cluster in clusters]


def _dedupe_kind_singletons(items: List[Dict[str, Any]], kind: str) -> List[Dict[str, Any]]:
    """Merge multiple items of the same section kind (e.g. two summaries) into one."""
    matched = [i for i in items if _item_section_kind(i) == kind]
    if len(matched) <= 1:
        return items
    rest = [i for i in items if _item_section_kind(i) != kind]
    merged = _merge_item_cluster(matched)
    if kind == "summary" and not merged.get("title"):
        merged["title"] = "Summary"
    if kind == "quiz" and not merged.get("title"):
        merged["title"] = "Quiz"
    if kind == "objectives" and not merged.get("title"):
        merged["title"] = "Learning objectives"
    return rest + [merged]


def _dedupe_keywords_sequential(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop bullets that repeat (or nearly repeat) an earlier bullet anywhere in the plan."""
    seen: List[str] = []
    out: List[Dict[str, Any]] = []
    for item in items:
        keywords = []
        for kw in item.get("keywords") or []:
            text = str(kw or "").strip()
            if not text or any(is_near_duplicate(text, kept) for kept in seen):
                continue
            seen.append(text)
            keywords.append(text)
        out.append({**item, "keywords": keywords})
    return out


def dedupe_unit_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Remove duplicate section titles, bullets, vocabulary, and related checklist redundancy."""
    if not plan:
        return plan

    items = [dict(i) for i in (plan.get("items") or []) if isinstance(i, dict)]
    if not items:
        return plan

    items = _cluster_items_by_title(items)
    for kind in ("objectives", "summary", "quiz", "activities", "concepts"):
        items = _dedupe_kind_singletons(items, kind)

    cleaned: List[Dict[str, Any]] = []
    for item in items:
        keywords = dedupe_strings(item.get("keywords") or [])
        cleaned.append({**item, "keywords": keywords})

    cleaned = _dedupe_keywords_sequential(cleaned)

    # Final pass: section titles must be unique (near-duplicate titles merged again if any remain).
    cleaned = _cluster_items_by_title(cleaned)

    out = dict(plan)
    out["items"] = cleaned
    return out


def dedupe_book_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Deduplicate book-level objectives and per-unit keyword lists."""
    if not plan:
        return plan

    out = dict(plan)
    out["objectives"] = dedupe_strings(plan.get("objectives") or [])

    units_out: List[Dict[str, Any]] = []
    for unit in plan.get("units") or []:
        if not isinstance(unit, dict):
            continue
        unit_copy = dict(unit)
        unit_copy["keywords"] = dedupe_strings(unit.get("keywords") or [])
        units_out.append(unit_copy)
    out["units"] = units_out
    return out


def _partition_item_bucket(item: Dict[str, Any]) -> str:
    """Assign each checklist item to exactly one admin display bucket."""
    title_norm = _normalize_text(item.get("title"))
    item_type = str(item.get("type") or "").lower()

    if "objective" in title_norm:
        return "objectives"
    if "summary" in title_norm or "wrap" in title_norm or item_type == "wrap_up":
        return "summary"
    if "quiz" in title_norm or "review question" in title_norm or "assessment" in title_norm:
        return "quiz"
    if item_type in ("vocab", "vocabulary") or "vocabulary" in title_norm:
        return "vocabulary"
    if "concept" in title_norm:
        return "concepts"
    if item_type == "visual" or any(w in title_norm for w in ("diagram", "image", "map", "chart", "figure")):
        return "visual"
    if any(w in title_norm for w in ("experiment", "activit", "lab", "hands-on")):
        return "activities"
    if item_type in ("exercises", "mcq", "quiz"):
        return "quiz"
    if item_type in ("reading", "grammar", "listening", "speaking", "pronunciation"):
        return "explanation"
    if any(w in title_norm for w in ("explanation", "introduction", "lesson", "overview")):
        return "explanation"
    if item_type in ("unit_opening", "discussion", "other"):
        return "explanation"
    return "explanation"


def partition_plan_items_for_display(items: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Partition plan items into non-overlapping admin display buckets."""
    cleaned = dedupe_unit_plan({"items": items}).get("items") or []
    buckets: Dict[str, List[Dict[str, Any]]] = {
        "explanation_items": [],
        "objectives": [],
        "concepts": [],
        "vocabulary": [],
        "visual": [],
        "activities": [],
        "summary": [],
        "quiz": [],
    }
    for item in cleaned:
        bucket = _partition_item_bucket(item)
        if bucket == "objectives":
            buckets["objectives"].append(item)
        elif bucket == "concepts":
            buckets["concepts"].append(item)
        elif bucket == "vocabulary":
            buckets["vocabulary"].append(item)
        elif bucket == "visual":
            buckets["visual"].append(item)
        elif bucket == "activities":
            buckets["activities"].append(item)
        elif bucket == "summary":
            buckets["summary"].append(item)
        elif bucket == "quiz":
            buckets["quiz"].append(item)
        else:
            buckets["explanation_items"].append(item)
    return buckets
