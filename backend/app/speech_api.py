"""Speech-to-text for Unity mic (OpenAI Whisper)."""

from __future__ import annotations

import base64
import os
import tempfile
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["speech"])


class TranscribeReq(BaseModel):
    audio_base64: str = Field(..., description="Raw WAV file bytes, base64-encoded")
    language: str | None = Field(default=None, description="Optional ISO-639-1 code, e.g. en")


@router.post("/speech/transcribe")
def transcribe_audio(req: TranscribeReq) -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")

    try:
        raw = base64.b64decode(req.audio_base64, validate=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio: {e!s}") from e

    if len(raw) < 256:
        raise HTTPException(status_code=400, detail="Audio too short")

    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio too large (max ~25MB)")

    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(raw)
            path = tmp.name
        with open(path, "rb") as audio_file:
            kwargs: Dict[str, Any] = {"model": "whisper-1", "file": audio_file}
            if req.language:
                kwargs["language"] = req.language[:8]
            tr = client.audio.transcriptions.create(**kwargs)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e!s}") from e
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass

    text = getattr(tr, "text", None) or ""
    return {"text": text.strip()}

