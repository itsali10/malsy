"""Pronunciation scoring — wav2vec2 phoneme model + eSpeak-ng."""

from __future__ import annotations

import asyncio
import base64
import os
import subprocess
import tempfile
from threading import Lock
from typing import Any, Dict, List, Tuple

import numpy as np
import torch
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["speech"])

# ──────────────────────────────────────────────────────────────
# Singleton model — loaded once on the first request, never again
# ──────────────────────────────────────────────────────────────
_MODEL_ID = "facebook/wav2vec2-lv-60-espeak-cv-ft"
_lock = Lock()
_processor = None
_model = None
_device = "cuda" if torch.cuda.is_available() else "cpu"


def _ensure_model() -> None:
    global _processor, _model
    if _processor is not None:
        return
    with _lock:
        if _processor is not None:
            return
        from transformers import (
            Wav2Vec2FeatureExtractor,
            Wav2Vec2ForCTC,
            Wav2Vec2PhonemeCTCTokenizer,
            Wav2Vec2Processor,
        )
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            tok = Wav2Vec2PhonemeCTCTokenizer.from_pretrained(
                _MODEL_ID, phonemizer_backend="espeak", phonemizer_lang="en-us"
            )
            fe = Wav2Vec2FeatureExtractor.from_pretrained(_MODEL_ID)
            _processor = Wav2Vec2Processor(feature_extractor=fe, tokenizer=tok)
            _model = Wav2Vec2ForCTC.from_pretrained(_MODEL_ID).to(_device)
            _model.eval()


# ──────────────────────────────────────────────────────────────
# eSpeak phoneme alphabet
# ──────────────────────────────────────────────────────────────
_ESPEAK_PHONEMES = sorted(
    [
        "dZ", "tS", "eI", "aI", "OI", "aU", "oU",
        "S", "Z", "T", "D", "N",
        "i", "I", "E", "a", "A", "O", "U", "@", "V", "Q", "0", "3",
        "p", "b", "t", "d", "k", "g",
        "f", "v", "s", "z", "h",
        "m", "n", "l", "r", "j", "w",
    ],
    key=len,
    reverse=True,
)

# IPA (wav2vec2 output) → eSpeak notation
_IPA_TO_ESPEAK: Dict[str, str] = {
    # Vowels
    "ɪ": "I",   "i": "I",
    "ʊ": "U",
    "ɛ": "E",   "e": "E",
    "ə": "@",
    "ɚ": "3",
    "ɝ": "3",
    "ʌ": "V",
    "ɔ": "0",
    "æ": "a",
    "ɑ": "A",
    # Long vowels
    "iː": "I",  "uː": "U",
    "ɑː": "A",  "ɔː": "0",
    # Diphthongs
    "eɪ": "eI",
    "aɪ": "aI",
    "ɔɪ": "OI",
    "aʊ": "aU",
    "oʊ": "oU",
    # Consonants
    "dʒ": "dZ",
    "tʃ": "tS",
    "ʃ": "S",
    "ʒ": "Z",
    "θ": "T",
    "ð": "D",
    "ŋ": "N",
    "ɹ": "r",   "r": "r",
    "ɾ": "r",
    "ɡ": "g",
}

# eSpeak reference → normalise to match what wav2vec2 consistently produces
_REF_NORMALIZE: Dict[str, str] = {
    "i": "I",   # "happy" vowel: eSpeak writes i, model writes I
}


def _parse_espeak(raw: str) -> List[str]:
    cleaned = "".join(c for c in raw if c.isalnum() or c == "@")
    tokens: List[str] = []
    i = 0
    while i < len(cleaned):
        for p in _ESPEAK_PHONEMES:
            if cleaned.startswith(p, i):
                tokens.append(p)
                i += len(p)
                break
        else:
            i += 1
    return tokens


def _ref_phonemes(word: str) -> List[str]:
    try:
        result = subprocess.run(
            ["espeak-ng", "-q", "-v", "en-us", "-x", word],
            capture_output=True, check=True,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="espeak-ng is not installed on this server")
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=503, detail=f"espeak-ng failed: {exc}")
    raw = result.stdout.decode("utf-8", errors="ignore").strip()
    phonemes = _parse_espeak(raw)
    return [_REF_NORMALIZE.get(p, p) for p in phonemes]


def _normalize_user(phonemes: List[str]) -> List[str]:
    return [_IPA_TO_ESPEAK.get(p, p) for p in phonemes]


# ──────────────────────────────────────────────────────────────
# Edit distance + DP word segmentation
# ──────────────────────────────────────────────────────────────
def _edit_distance(ref: List[str], hyp: List[str]) -> int:
    dp = [[0] * (len(hyp) + 1) for _ in range(len(ref) + 1)]
    for i in range(len(ref) + 1):
        dp[i][0] = i
    for j in range(len(hyp) + 1):
        dp[0][j] = j
    for i in range(1, len(ref) + 1):
        for j in range(1, len(hyp) + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    return dp[-1][-1]


def _segment_words(
    words: List[str],
    ref_per_word: List[List[str]],
    user_phonemes: List[str],
) -> List[Tuple[str, List[str], List[str], float]]:
    W, U = len(ref_per_word), len(user_phonemes)
    INF = float("inf")

    # Precompute edit distances for all (word, start, end) spans
    ed = [[[0] * (U + 1) for _ in range(U + 1)] for _ in range(W)]
    for i in range(W):
        for c in range(U + 1):
            for j in range(c, U + 1):
                ed[i][c][j] = _edit_distance(ref_per_word[i], user_phonemes[c:j])

    dp   = [[INF] * (U + 1) for _ in range(W + 1)]
    back = [[0]   * (U + 1) for _ in range(W + 1)]
    dp[0][0] = 0

    for i in range(1, W + 1):
        for j in range(U + 1):
            for c in range(j + 1):
                if dp[i - 1][c] == INF:
                    continue
                cost = dp[i - 1][c] + ed[i - 1][c][j]
                if cost < dp[i][j]:
                    dp[i][j] = cost
                    back[i][j] = c

    boundaries: List[Tuple[int, int]] = []
    j = U
    for i in range(W, 0, -1):
        c = back[i][j]
        boundaries.append((c, j))
        j = c
    boundaries.reverse()

    results = []
    for i, (start, end) in enumerate(boundaries):
        ref_w = ref_per_word[i]
        got_w = user_phonemes[start:end]
        d = _edit_distance(ref_w, got_w)
        score = max(0.0, 1.0 - d / max(1, len(ref_w)))
        results.append((words[i], ref_w, got_w, round(score * 100, 1)))
    return results


# ──────────────────────────────────────────────────────────────
# Request / response models
# ──────────────────────────────────────────────────────────────
class PronunciationReq(BaseModel):
    audio_base64: str = Field(..., description="Base64-encoded WAV file (16 kHz mono float32 or int16)")
    sentence: str = Field(..., description="The sentence the student was asked to read")


class WordResult(BaseModel):
    word: str
    ref: List[str]
    got: List[str]
    score: float


class PronunciationResp(BaseModel):
    overall_score: float
    words: List[WordResult]


# ──────────────────────────────────────────────────────────────
# Endpoint
# ──────────────────────────────────────────────────────────────
@router.post("/speech/pronunciation", response_model=PronunciationResp)
async def score_pronunciation(req: PronunciationReq) -> Any:
    """Score pronunciation of a sentence against eSpeak reference phonemes."""
    _ensure_model()
    return await asyncio.to_thread(_score_sync, req.audio_base64, req.sentence)


def _score_sync(audio_b64: str, sentence: str) -> Dict[str, Any]:
    # ── decode audio ──────────────────────────────────────────
    try:
        raw = base64.b64decode(audio_b64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio: {exc}")

    if len(raw) < 256:
        raise HTTPException(status_code=400, detail="Audio too short")
    if len(raw) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio too large (max 50 MB)")

    try:
        import soundfile as sf
    except ImportError:
        raise HTTPException(status_code=503, detail="soundfile is not installed on this server")

    path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(raw)
            path = tmp.name
        audio, sr = sf.read(path, dtype="float32")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read audio: {exc}")
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass

    # mono
    if audio.ndim == 2:
        audio = audio.mean(axis=1)

    # resample to 16 kHz if needed
    if sr != 16000:
        try:
            import scipy.signal
            audio = scipy.signal.resample(audio, int(len(audio) * 16000 / sr)).astype(np.float32)
        except ImportError:
            raise HTTPException(status_code=503, detail="scipy is required for resampling non-16kHz audio")

    # ── reference phonemes ────────────────────────────────────
    words = sentence.split()
    if not words:
        raise HTTPException(status_code=400, detail="Sentence is empty")

    ref_per_word = [_ref_phonemes(w) for w in words]
    ref_all = [p for phonemes in ref_per_word for p in phonemes]

    # ── transcribe user phonemes ──────────────────────────────
    inputs = _processor(audio, sampling_rate=16000, return_tensors="pt", padding=True)
    inputs = {k: v.to(_device) for k, v in inputs.items()}

    with torch.no_grad():
        logits = _model(**inputs).logits

    pred_ids = torch.argmax(logits, dim=-1)
    decoded = _processor.batch_decode(pred_ids)[0]
    user_phonemes = _normalize_user(decoded.split())

    # ── score ─────────────────────────────────────────────────
    overall_dist = _edit_distance(ref_all, user_phonemes)
    overall_score = max(0.0, 1.0 - overall_dist / max(1, len(ref_all)))

    word_results = _segment_words(words, ref_per_word, user_phonemes)

    return {
        "overall_score": round(overall_score * 100, 2),
        "words": [
            {"word": w, "ref": ref, "got": got, "score": score}
            for w, ref, got, score in word_results
        ],
    }
