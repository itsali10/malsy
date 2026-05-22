"""
Offline TTS to WAV (same PC / RTX). Set TTS_BACKEND=piper or TTS_BACKEND=coqui_xtts (see synthesize_offline_wav).

Piper:
  PIPER_EXE (optional, default: piper on PATH)
  PIPER_MODEL_PATH — path to .onnx voice model

Coqui XTTS v2 (install: pip install TTS; CUDA torch recommended):
  XTTS_SPEAKER_WAV — reference .wav for voice timbre
  optional COQUI_MODEL (default: tts_models/multilingual/multi-dataset/xtts_v2)
  optional TTS_DEVICE (cuda | cpu)
  optional XTTS_LANGUAGE (default: en)
"""

from __future__ import annotations

import os
import subprocess
import wave
from pathlib import Path


def wav_duration_sec(path: Path) -> float:
    try:
        with wave.open(str(path), "rb") as w:
            return w.getnframes() / float(w.getframerate() or 22050)
    except Exception:
        return 1.0


def synthesize_offline_wav(
    out_wav: Path,
    text: str,
    voice: str,
    speed: float,
) -> None:
    """Write WAV using Piper or Coqui; `voice` / `speed` reserved for future mapping."""
    del voice, speed  # XTTS uses reference wav; Piper uses fixed model
    safe = (text or "").strip()[:4096]
    if not safe:
        raise ValueError("text is empty")

    backend = (os.getenv("TTS_BACKEND") or "").lower().strip()
    if backend == "piper":
        _piper_synthesize(out_wav, safe)
        return
    if backend in {"coqui", "coqui_xtts", "coqui", "xtts"}:
        _coqui_xtts_synthesize(out_wav, safe)
        return

    raise RuntimeError(
        f"TTS_BACKEND={backend!r} is not offline; use piper or coqui_xtts (or openai in tts_api)"
    )


def _piper_synthesize(out_wav: Path, text: str) -> None:
    model = (os.getenv("PIPER_MODEL_PATH") or "").strip()
    if not model:
        raise RuntimeError("PIPER_MODEL_PATH not set (path to .onnx voice model)")

    exe = (os.getenv("PIPER_EXE") or "piper").strip()
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [exe, "--model", model, "--output_file", str(out_wav)],
        input=text.encode("utf-8"),
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or b"").decode("utf-8", errors="replace")
        raise RuntimeError(f"Piper failed: {msg or proc.returncode}")


def _coqui_xtts_synthesize(out_wav: Path, text: str) -> None:
    speaker = (os.getenv("XTTS_SPEAKER_WAV") or "").strip()
    if not speaker or not Path(speaker).is_file():
        raise RuntimeError(
            "XTTS_SPEAKER_WAV must point to an existing reference .wav for voice cloning"
        )

    try:
        from TTS.api import TTS
    except ImportError as e:
        raise RuntimeError(
            "Coqui TTS not installed. Example: pip install TTS (and CUDA-enabled torch)"
        ) from e

    device = (os.getenv("TTS_DEVICE") or "cuda").strip()
    model_name = (
        os.getenv("COQUI_MODEL") or "tts_models/multilingual/multi-dataset/xtts_v2"
    ).strip()

    out_wav.parent.mkdir(parents=True, exist_ok=True)
    tts = TTS(model_name).to(device)
    tts.tts_to_file(
        text=text,
        file_path=str(out_wav),
        speaker_wav=speaker,
        language=os.getenv("XTTS_LANGUAGE", "en"),
    )
