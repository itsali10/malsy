"""
TTS for Unity AvatarTtsPlayer: POST /tts only (MP3/WAV URL).

Mouth animation: use Meta OVRLipSync in Unity on the same AudioSource — no server-side viseme stream.
OpenAI or offline: TTS_BACKEND=piper | coqui_xtts (see local_tts.py).
"""

from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

load_dotenv()

TTS_DIR = Path(__file__).resolve().parent.parent / "data" / "tts_audio"

OPENAI_VOICES = frozenset({"alloy", "echo", "fable", "onyx", "nova", "shimmer"})


def _normalize_voice(voice_id: str) -> str:
    v = (voice_id or "alloy").lower().strip()
    return v if v in OPENAI_VOICES else "alloy"


def _tts_backend() -> str:
    return (os.getenv("TTS_BACKEND") or "openai").lower().strip()


def _openai_synthesize_bytes(*, text: str, voice: str, speed: float, response_format: str) -> bytes:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured for TTS")

    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    safe = text.strip()[:4096]
    if not safe:
        raise HTTPException(status_code=400, detail="text is empty")

    sp = float(speed)
    sp = max(0.25, min(4.0, sp))

    speech = client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=safe,
        speed=sp,
        response_format=response_format,
    )
    if hasattr(speech, "content") and speech.content:
        return speech.content
    return b"".join(speech.iter_bytes())


def _ffmpeg_wav_to_mp3(wav: Path, mp3: Path) -> bool:
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(wav),
                "-codec:a",
                "libmp3lame",
                "-qscale:a",
                "4",
                str(mp3),
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )
        return mp3.is_file() and mp3.stat().st_size > 0
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def _synthesize_audio_bytes(*, text: str, voice: str, speed: float, response_format: str) -> bytes:
    fmt = (response_format or "mp3").lower().strip()
    if _tts_backend() == "openai":
        return _openai_synthesize_bytes(text=text, voice=voice, speed=speed, response_format=fmt)

    import tempfile

    from .local_tts import synthesize_offline_wav

    safe = text.strip()[:4096]
    if not safe:
        raise HTTPException(status_code=400, detail="text is empty")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = Path(tmp.name)
    try:
        synthesize_offline_wav(wav_path, safe, voice, speed)
        if fmt == "wav":
            return wav_path.read_bytes()
        if fmt == "mp3":
            mp3_path = wav_path.with_suffix(".mp3")
            if _ffmpeg_wav_to_mp3(wav_path, mp3_path):
                return mp3_path.read_bytes()
            raise HTTPException(
                status_code=503,
                detail="Offline TTS produced WAV but ffmpeg is required to make MP3; "
                "install ffmpeg or use format=wav in /tts request.",
            )
        raise HTTPException(status_code=400, detail=f"format {fmt} not supported for offline TTS (use wav or mp3)")
    finally:
        try:
            wav_path.unlink(missing_ok=True)
            wav_path.with_suffix(".mp3").unlink(missing_ok=True)
        except OSError:
            pass


def _save_audio(data: bytes, suffix: str) -> str:
    TTS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{suffix}"
    path = TTS_DIR / name
    path.write_bytes(data)
    return f"/tts/static/{name}"


class TtsRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "text": "Hello from the AI teacher.",
                "voice_id": "alloy",
                "speed": 1.0,
                "return_base64": False,
                "format": "mp3",
            }
        }
    )

    text: str = Field(
        default="",
        description="Words to synthesize. Must be non-empty or the API returns 400.",
    )
    voice_id: str = "alloy"
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    return_base64: bool = False
    format: str = "mp3"


router = APIRouter(tags=["tts"])


@router.post("/tts")
def post_tts(req: TtsRequest) -> Dict[str, Any]:
    fmt = (req.format or "mp3").lower().strip()
    if fmt not in {"mp3", "wav", "opus", "aac", "flac"}:
        fmt = "mp3"
    voice = _normalize_voice(req.voice_id)
    try:
        data = _synthesize_audio_bytes(text=req.text, voice=voice, speed=req.speed, response_format=fmt)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS failed: {e!s}") from e

    suffix = f".{fmt}"
    audio_url = _save_audio(data, suffix)
    out: Dict[str, Any] = {"audio_url": audio_url, "voice_id": voice}
    if req.return_base64:
        import base64

        out["audio_base64"] = base64.b64encode(data).decode("ascii")
    return out


def mount_tts_static(app: FastAPI) -> None:
    TTS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/tts/static", StaticFiles(directory=str(TTS_DIR)), name="tts_static")
