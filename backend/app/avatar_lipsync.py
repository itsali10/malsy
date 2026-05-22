from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple
import random
import statistics
import uuid


STRICT_THRESHOLDS_MS: Dict[str, int] = {
    "avg_drift_ms_max": 40,
    "p95_drift_ms_max": 70,
    "speech_start_latency_ms_max": 180,
    "mouth_close_offset_ms_max": 80,
}


_VOWEL_TO_VISEME = {
    "a": "A",
    "e": "E",
    "i": "I",
    "o": "O",
    "u": "U",
}

_CONSONANT_TO_VISEME = {
    "b": "BMP",
    "m": "BMP",
    "p": "BMP",
    "f": "FV",
    "v": "FV",
    "s": "SZ",
    "z": "SZ",
    "t": "TD",
    "d": "TD",
    "k": "KG",
    "g": "KG",
    "l": "L",
    "r": "R",
    "w": "WQ",
    "q": "WQ",
}


@dataclass
class VisemeEvent:
    sequence_id: int
    viseme: str
    time_ms: int
    duration_ms: int

    def as_dict(self) -> Dict[str, Any]:
        return {
            "sequence_id": self.sequence_id,
            "viseme": self.viseme,
            "time_ms": self.time_ms,
            "duration_ms": self.duration_ms,
        }


def _char_to_viseme(ch: str) -> str:
    c = ch.lower()
    if c in _VOWEL_TO_VISEME:
        return _VOWEL_TO_VISEME[c]
    if c in _CONSONANT_TO_VISEME:
        return _CONSONANT_TO_VISEME[c]
    if c in {" ", ",", ".", "!", "?", ";", ":"}:
        return "REST"
    return "NEUTRAL"


def build_viseme_timeline(text: str, speech_rate: float = 1.0) -> List[Dict[str, Any]]:
    """
    Build a deterministic, timestamped viseme timeline from text.
    This is a backend timing contract used to validate end-to-end lip-sync quality.
    """
    if not text:
        return []

    safe_rate = max(0.4, min(2.0, speech_rate))
    base_step = int(85 / safe_rate)
    min_duration = int(60 / safe_rate)
    max_duration = int(140 / safe_rate)

    sequence = 0
    t = 0
    events: List[VisemeEvent] = []
    prev_viseme = None

    for ch in text:
        viseme = _char_to_viseme(ch)
        if viseme == "REST":
            t += int(base_step * 0.9)
            continue

        # Smooth repeated visemes to avoid jittering mouth shape.
        if prev_viseme == viseme:
            t += int(base_step * 0.7)
            continue

        duration = max(min_duration, min(max_duration, base_step))
        events.append(
            VisemeEvent(
                sequence_id=sequence,
                viseme=viseme,
                time_ms=t,
                duration_ms=duration,
            )
        )
        sequence += 1
        prev_viseme = viseme
        t += base_step

    return [e.as_dict() for e in events]


def _p95(values: List[float]) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = max(0, min(len(sorted_vals) - 1, int(round(0.95 * (len(sorted_vals) - 1)))))
    return sorted_vals[idx]


def _align_by_sequence(expected: List[Dict[str, Any]], actual: List[Dict[str, Any]]) -> List[Tuple[int, int]]:
    actual_by_seq = {int(v.get("sequence_id", -1)): int(v.get("time_ms", 0)) for v in actual}
    pairs: List[Tuple[int, int]] = []
    for ev in expected:
        seq = int(ev.get("sequence_id", -1))
        if seq in actual_by_seq:
            pairs.append((int(ev.get("time_ms", 0)), actual_by_seq[seq]))
    return pairs


def evaluate_lipsync_quality(
    *,
    expected_visemes: List[Dict[str, Any]],
    actual_visemes: List[Dict[str, Any]],
    utterance_start_ms: int,
    speech_started_ms: int,
    speech_ended_ms: int,
    audio_end_ms: int,
    transport_stats: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    pairs = _align_by_sequence(expected_visemes, actual_visemes)
    drifts = [abs(act - exp) for exp, act in pairs]

    avg_drift = statistics.fmean(drifts) if drifts else 9999.0
    p95_drift = _p95(drifts) if drifts else 9999.0
    speech_start_latency = max(0, speech_started_ms - utterance_start_ms)
    mouth_close_offset = abs(speech_ended_ms - audio_end_ms)

    transport_stats = transport_stats or {}
    out_of_order = int(transport_stats.get("out_of_order_packets", 0))
    recovered = bool(transport_stats.get("recovered_within_utterance", True))

    checks = {
        "avg_drift_ok": avg_drift <= STRICT_THRESHOLDS_MS["avg_drift_ms_max"],
        "p95_drift_ok": p95_drift <= STRICT_THRESHOLDS_MS["p95_drift_ms_max"],
        "speech_start_latency_ok": speech_start_latency <= STRICT_THRESHOLDS_MS["speech_start_latency_ms_max"],
        "mouth_close_offset_ok": mouth_close_offset <= STRICT_THRESHOLDS_MS["mouth_close_offset_ms_max"],
        "packet_order_ok": out_of_order == 0,
        "jitter_recovery_ok": recovered,
    }

    return {
        "pass": all(checks.values()),
        "thresholds_ms": STRICT_THRESHOLDS_MS,
        "metrics": {
            "matched_visemes": len(pairs),
            "expected_visemes": len(expected_visemes),
            "actual_visemes": len(actual_visemes),
            "avg_drift_ms": round(avg_drift, 2),
            "p95_drift_ms": round(p95_drift, 2),
            "speech_start_latency_ms": speech_start_latency,
            "mouth_close_offset_ms": mouth_close_offset,
            "out_of_order_packets": out_of_order,
            "recovered_within_utterance": recovered,
        },
        "checks": checks,
    }


def _simulate_actual_visemes(
    expected: List[Dict[str, Any]],
    jitter_ms: int,
    out_of_order_chance: float,
) -> Tuple[List[Dict[str, Any]], int]:
    actual: List[Dict[str, Any]] = []
    out_of_order_packets = 0
    rng = random.Random(42 + len(expected) + jitter_ms)

    for ev in expected:
        noisy = dict(ev)
        noisy["time_ms"] = int(ev["time_ms"]) + rng.randint(-jitter_ms, jitter_ms)
        actual.append(noisy)

    for i in range(1, len(actual)):
        if rng.random() < out_of_order_chance:
            actual[i - 1], actual[i] = actual[i], actual[i - 1]
            out_of_order_packets += 1

    # Simple reordering buffer modeled by sequence sort.
    actual_sorted = sorted(actual, key=lambda x: int(x.get("sequence_id", 0)))
    return actual_sorted, out_of_order_packets


def run_qa_harness(
    *,
    utterance_count: int = 100,
    jitter_ms: int = 35,
    out_of_order_chance: float = 0.0,
) -> Dict[str, Any]:
    corpus = [
        "Hello student welcome to your lesson today.",
        "Read the paragraph carefully and answer the question.",
        "What is the main idea of this story?",
        "Great job now let us continue to the next part.",
        "Listen to the sentence and repeat after me.",
    ]
    utterance_count = max(10, min(400, utterance_count))

    results = []
    pass_count = 0

    for i in range(utterance_count):
        text = corpus[i % len(corpus)]
        expected = build_viseme_timeline(text=text, speech_rate=1.0)
        actual, out_of_order_packets = _simulate_actual_visemes(
            expected,
            jitter_ms=jitter_ms,
            out_of_order_chance=out_of_order_chance,
        )

        start_ms = 0
        speech_started_ms = 120
        speech_ended_ms = (expected[-1]["time_ms"] + expected[-1]["duration_ms"]) if expected else 0
        audio_end_ms = speech_ended_ms + random.randint(-25, 25)

        score = evaluate_lipsync_quality(
            expected_visemes=expected,
            actual_visemes=actual,
            utterance_start_ms=start_ms,
            speech_started_ms=speech_started_ms,
            speech_ended_ms=speech_ended_ms,
            audio_end_ms=audio_end_ms,
            transport_stats={
                "out_of_order_packets": out_of_order_packets,
                "recovered_within_utterance": out_of_order_packets == 0,
            },
        )
        results.append(score)
        if score["pass"]:
            pass_count += 1

    avg_drift_series = [r["metrics"]["avg_drift_ms"] for r in results]
    p95_series = [r["metrics"]["p95_drift_ms"] for r in results]

    return {
        "run_id": str(uuid.uuid4()),
        "utterance_count": utterance_count,
        "passed_utterances": pass_count,
        "pass_rate": round((pass_count / utterance_count) * 100, 2),
        "aggregates": {
            "avg_of_avg_drift_ms": round(statistics.fmean(avg_drift_series), 2),
            "avg_of_p95_drift_ms": round(statistics.fmean(p95_series), 2),
        },
        "strict_thresholds_ms": STRICT_THRESHOLDS_MS,
        "ready_for_rollout": pass_count == utterance_count,
    }
