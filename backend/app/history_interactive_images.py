"""
Generate 2 interactive lesson images per History lesson.

After the AI teacher content is ready, the LLM picks two visual concepts from
the lesson, writes tap labels + titles + fact chips, and DALL-E renders images.
Results are cached per unit on disk.
"""

from __future__ import annotations

import json
import os
import re
import uuid
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import OpenAI

from .history_lessons import get_lesson_by_unit_id, normalize_lesson_id
from .history_rag import HistoryRagError, get_lesson_chunk_text
from .llm import get_teacher_llm

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "interactive_images"
IMAGES_PER_LESSON = 2


def _unit_dir(book_id: str, unit_id: str) -> Path:
    safe_unit = unit_id.replace(":", "_")
    return DATA_DIR / book_id.replace(":", "_") / safe_unit


def _manifest_path(book_id: str, unit_id: str) -> Path:
    return _unit_dir(book_id, unit_id) / "manifest.json"


def _load_manifest(book_id: str, unit_id: str) -> Optional[Dict[str, Any]]:
    path = _manifest_path(book_id, unit_id)
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            images = data.get("images") or []
            if len(images) < IMAGES_PER_LESSON:
                return None
            if not _has_complete_metadata(images[:IMAGES_PER_LESSON]):
                return None
            for img in images[:IMAGES_PER_LESSON]:
                url = str(img.get("image_url") or "")
                if url.startswith("http"):
                    continue
                fname = img.get("filename")
                if not fname or not (_unit_dir(book_id, unit_id) / fname).exists():
                    return None
            return data
        except Exception:
            return None
    return None


def _has_complete_metadata(images: List[Dict[str, Any]]) -> bool:
    if len(images) < IMAGES_PER_LESSON:
        return False
    for i, img in enumerate(images[:IMAGES_PER_LESSON]):
        labels = [str(x).strip() for x in (img.get("labels") or []) if str(x).strip()]
        title = str(img.get("title") or "").strip()
        tap_label = str(img.get("tap_label") or "").strip()
        if not labels:
            return False
        if not title or title.lower().endswith(f"image {i + 1}"):
            return False
        if not tap_label or re.match(r"^tap image \d+$", tap_label, re.I):
            return False
    return True


def _recover_manifest_from_files(book_id: str, unit_id: str) -> Optional[Dict[str, Any]]:
    """Rebuild manifest when image files exist but manifest.json was removed."""
    out_dir = _unit_dir(book_id, unit_id)
    filenames: List[str] = []
    for i in range(1, IMAGES_PER_LESSON + 1):
        fname = f"img_{i}.png"
        if not (out_dir / fname).exists():
            return None
        filenames.append(fname)

    lesson = get_lesson_by_unit_id(unit_id, book_id) or {}
    images_out: List[Dict[str, Any]] = []
    for i, fname in enumerate(filenames):
        images_out.append({
            "id": str(uuid.uuid4()),
            "tap_label": f"Tap image {i + 1}",
            "title": f"{lesson.get('title', 'Lesson')} — image {i + 1}",
            "description": "",
            "labels": [],
            "image_url": _public_url(book_id, unit_id, fname),
            "filename": fname,
        })

    payload = {
        "book_id": book_id,
        "unit_id": unit_id,
        "lesson_title": lesson.get("title"),
        "lesson_number": lesson.get("lessonNumber"),
        "images": images_out,
        "recovered": True,
    }
    _save_manifest(book_id, unit_id, payload)
    print(f"[history-images] recovered manifest for {unit_id}")
    return payload


def _save_manifest(book_id: str, unit_id: str, payload: Dict[str, Any]) -> None:
    out_dir = _unit_dir(book_id, unit_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(_manifest_path(book_id, unit_id), "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _parse_json_object(text: str) -> Dict[str, Any]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


def _build_image_specs(
    *,
    lesson: Dict[str, Any],
    teacher_text: str,
    book_excerpt: str,
) -> List[Dict[str, Any]]:
    allowed = lesson.get("allowedTopics") or []
    allowed_lines = "\n".join(f"- {t}" for t in allowed[:20])
    llm = get_teacher_llm()
    prompt = f"""You are building exactly 2 interactive image cards for a Grade 6 History lesson.

LESSON: {lesson.get('title', '')}
DESCRIPTION: {lesson.get('shortDescription', '')}

ALLOWED TOPICS (use ONLY these — nothing from other lessons):
{allowed_lines}

TEACHER EXPLANATION:
{(teacher_text or '')[:3500]}

TEXTBOOK EXCERPT:
{(book_excerpt or '')[:2500]}

Pick 2 visual concepts students should remember from THIS lesson only.
The images must COMPLEMENT the lesson video, not repeat it:
- Do NOT choose the same main objects, people, gods, or scenes that dominate the teacher/video explanation.
- Prefer supporting visuals: places, symbols, tools, materials, actions, processes, settings, objects, ceremonies, or cause/effect ideas.
- If the video/teacher text focuses on named characters or gods, the images should show the related symbol, setting, role, or process instead of another portrait of the same character/god.
- For a gods lesson, avoid making both cards individual god portraits. Prefer concepts like a temple ceremony, animal-headed statues, the solar barque, offerings, priest masks, sacred symbols, or god roles.
Each card will be tappable with a title and 2–4 short fact chips underneath.

Return ONLY valid JSON (no markdown):
{{
  "images": [
    {{
      "tap_label": "Tap the solar boat",
      "title": "Ra's Solar Barque",
      "description": "A symbol linked to Ra's journey across the sky",
      "labels": ["Sun journey", "Barque", "Light"],
      "image_prompt": "Child-friendly colorful educational illustration of an Ancient Egyptian solar barque sailing across a golden sky, temple silhouettes in the background, flat cartoon style, warm colors, no text in image, safe for ages 10-12"
    }}
  ]
}}

Rules:
- Exactly 2 images in the array.
- tap_label starts with "Tap" and names one thing (e.g. "Tap the temple", "Tap the solar boat", "Tap the papyrus").
- labels: 2–4 short words or phrases (max 3 words each).
- image_prompt: detailed DALL-E prompt, child-friendly, no text/writing in the image.
- Do NOT use topics from other lessons (no Nile in religion lesson, etc.).
- Avoid duplicate content with the lesson video: no two cards should be simple portraits of the same type of thing.
"""
    msg = llm.invoke([
        {"role": "system", "content": "You output only valid JSON for educational UI cards."},
        {"role": "user", "content": prompt},
    ])
    data = _parse_json_object(msg.content or "")
    images = data.get("images") or []
    if not isinstance(images, list) or len(images) < IMAGES_PER_LESSON:
        raise ValueError(f"Expected {IMAGES_PER_LESSON} image specs, got {len(images) if isinstance(images, list) else 0}")
    return images[:IMAGES_PER_LESSON]


def _image_models() -> List[str]:
    """Models to try, in order. Honors OPENAI_IMAGE_MODEL if set."""
    preferred = os.getenv("OPENAI_IMAGE_MODEL")
    models = [preferred] if preferred else []
    for m in ("gpt-image-1", "dall-e-3", "dall-e-2"):
        if m not in models:
            models.append(m)
    return models


def _write_image_from_response(res: Any, out_path: Path) -> bool:
    """Handle both URL and base64 image responses."""
    if not getattr(res, "data", None):
        return False
    item = res.data[0]
    b64 = getattr(item, "b64_json", None)
    if b64:
        import base64
        out_path.write_bytes(base64.b64decode(b64))
        return True
    url = getattr(item, "url", None)
    if url:
        with urllib.request.urlopen(url, timeout=120) as resp:
            out_path.write_bytes(resp.read())
        return True
    return False


def _generate_image_file(prompt: str, out_path: Path) -> bool:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return False
    client = OpenAI(api_key=api_key)

    for model in _image_models():
        kwargs: Dict[str, Any] = {
            "model": model,
            "prompt": prompt[:4000],
            "size": "1024x1024",
            "n": 1,
        }
        # quality param differs per model; dall-e-2 rejects it.
        if model == "dall-e-3":
            kwargs["quality"] = "standard"
        try:
            res = client.images.generate(**kwargs)
            if _write_image_from_response(res, out_path):
                print(f"[history-images] generated with {model}")
                return True
        except Exception as exc:
            msg = str(exc)
            print(f"[history-images] {model} failed: {msg}")
            # If model just doesn't exist for this account, try the next one.
            if "does not exist" in msg or "invalid_value" in msg or "model" in msg.lower():
                continue
            # Other errors (quota, content policy) won't be fixed by another model.
            break
    return False


def _public_url(book_id: str, unit_id: str, filename: str) -> str:
    safe_book = book_id.replace(":", "_")
    safe_unit = unit_id.replace(":", "_")
    return f"/interactive-images/static/{safe_book}/{safe_unit}/{filename}"


def get_saved_interactive_images(
    unit_id: str,
    *,
    book_id: str = "history_g6",
) -> Optional[Dict[str, Any]]:
    """Return cached interactive images only — never generates new ones."""
    lid = normalize_lesson_id(unit_id, book_id)
    lesson = get_lesson_by_unit_id(lid, book_id)
    if not lesson:
        raise ValueError(f"Unknown history lesson: {unit_id}")
    return _load_manifest(book_id, lid)


def get_or_create_interactive_images(
    unit_id: str,
    *,
    teacher_text: str = "",
    book_id: str = "history_g6",
    force: bool = False,
) -> Dict[str, Any]:
    """Return 2 cached interactive images or generate new ones."""
    lid = normalize_lesson_id(unit_id, book_id)
    lesson = get_lesson_by_unit_id(lid, book_id)
    if not lesson:
        raise ValueError(f"Unknown history lesson: {unit_id}")

    if not force:
        cached = _load_manifest(book_id, lid)
        if cached:
            return cached

    excerpt = ""
    try:
        excerpt = get_lesson_chunk_text(lid, max_chars=4000)
    except HistoryRagError as exc:
        print(f"[history-images] RAG excerpt unavailable: {exc}")

    specs = _build_image_specs(
        lesson=lesson,
        teacher_text=teacher_text,
        book_excerpt=excerpt,
    )

    out_dir = _unit_dir(book_id, lid)
    out_dir.mkdir(parents=True, exist_ok=True)
    images_out: List[Dict[str, Any]] = []

    for i, spec in enumerate(specs):
        filename = f"img_{i + 1}.png"
        out_path = out_dir / filename
        prompt = str(spec.get("image_prompt") or spec.get("title") or lesson.get("title"))
        generated = _generate_image_file(prompt, out_path)
        if not generated:
            filename = ""
        images_out.append({
            "id": str(uuid.uuid4()),
            "tap_label": str(spec.get("tap_label") or f"Tap image {i + 1}"),
            "title": str(spec.get("title") or ""),
            "description": str(spec.get("description") or ""),
            "labels": [str(x) for x in (spec.get("labels") or [])[:6]],
            "image_url": _public_url(book_id, lid, filename) if filename and out_path.exists() else None,
            "filename": filename if out_path.exists() else None,
        })

    payload = {
        "book_id": book_id,
        "unit_id": lid,
        "lesson_title": lesson.get("title"),
        "lesson_number": lesson.get("lessonNumber"),
        "images": images_out,
    }
    _save_manifest(book_id, lid, payload)
    return payload
