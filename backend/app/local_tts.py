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

import json
import os
import subprocess
import threading
import time
import wave
from pathlib import Path
from typing import Optional

# Only one offline TTS synthesis may run at a time. Spawning several Piper
# processes concurrently thrashes the CPU and makes every one of them slow
# enough to hit the subprocess timeout.
_TTS_LOCK = threading.Lock()


class _PiperWarmServer:
    """Keeps ONE Piper process alive so the voice model loads only once.

    Piper's --json-input mode reads one JSON request per line from stdin and
    writes each result to the requested output_file, all without reloading the
    model. This removes the multi-second per-request startup delay.
    """

    def __init__(self, exe: str, model: str) -> None:
        self.exe = exe
        self.model = model
        self.proc: Optional[subprocess.Popen] = None
        self.lock = threading.Lock()

    def _ensure(self) -> None:
        if self.proc and self.proc.poll() is None:
            return
        self.proc = subprocess.Popen(
            [self.exe, "--model", self.model, "--json-input"],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def _kill(self) -> None:
        if self.proc:
            try:
                self.proc.kill()
            except Exception:
                pass
        self.proc = None

    def synthesize(self, out_wav: Path, text: str, timeout: float) -> None:
        with self.lock:
            self._ensure()
            assert self.proc and self.proc.stdin

            try:
                out_wav.unlink(missing_ok=True)
            except OSError:
                pass

            req = json.dumps({"text": text, "output_file": str(out_wav)}) + "\n"
            try:
                self.proc.stdin.write(req.encode("utf-8"))
                self.proc.stdin.flush()
            except (BrokenPipeError, OSError) as exc:
                self._kill()
                raise RuntimeError(f"Piper warm pipe error: {exc}") from exc

            # Completion = file exists and its size has stopped growing.
            deadline = time.time() + timeout
            last_size = -1
            stable = 0
            while time.time() < deadline:
                if self.proc.poll() is not None:
                    self._kill()
                    raise RuntimeError("Piper warm process exited unexpectedly")
                if out_wav.exists():
                    sz = out_wav.stat().st_size
                    if sz > 44 and sz == last_size:
                        stable += 1
                        if stable >= 2:
                            return
                    else:
                        stable = 0
                    last_size = sz
                time.sleep(0.05)

            self._kill()
            raise RuntimeError(f"Piper warm synth timed out after {timeout:.0f}s")


_warm_server: Optional[_PiperWarmServer] = None
_warm_server_lock = threading.Lock()


def _get_warm_server(exe: str, model: str) -> _PiperWarmServer:
    global _warm_server
    with _warm_server_lock:
        if _warm_server is None or _warm_server.exe != exe or _warm_server.model != model:
            _warm_server = _PiperWarmServer(exe, model)
        return _warm_server


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
    try:
        timeout = float(os.getenv("PIPER_TIMEOUT") or "60")
    except ValueError:
        timeout = 60.0

    # Warm mode (default): keep one Piper process alive so the voice model
    # loads only once and later requests return in ~real-time.
    warm = (os.getenv("PIPER_WARM") or "1").strip().lower() not in {"0", "false", "no", "off"}
    if warm:
        try:
            _get_warm_server(exe, model).synthesize(out_wav, text, timeout)
            return
        except Exception as exc:
            print(f"[piper] warm mode failed ({exc}); falling back to one-shot")

    with _TTS_LOCK:
        try:
            proc = subprocess.run(
                [exe, "--model", model, "--output_file", str(out_wav)],
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                f"Piper timed out after {timeout:.0f}s. Send shorter text chunks "
                "or set PIPER_TIMEOUT higher."
            ) from exc
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
