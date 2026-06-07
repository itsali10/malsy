import subprocess
import torch
import sounddevice as sd

from transformers import (
    Wav2Vec2PhonemeCTCTokenizer,
    Wav2Vec2FeatureExtractor,
    Wav2Vec2Processor,
    Wav2Vec2ForCTC,
)

# ==============================
# CONFIG
# ==============================
MODEL_ID = "facebook/wav2vec2-lv-60-espeak-cv-ft"
TARGET_SENTENCE = "the quick brown fox jumps over the lazy dog"
SAMPLE_RATE = 16000
WORDS_PER_SECOND = 1.2  # conservative — better to record too long than cut off
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

def estimate_duration(sentence: str) -> int:
    words = sentence.split()
    return max(4, round(len(words) / WORDS_PER_SECOND) + 2)

# ==============================
# REFERENCE PHONEMES (eSpeak)
# ==============================
def get_reference_phonemes(text: str) -> list[str]:
    result = subprocess.run(
        ["espeak-ng", "-q", "-v", "en-us", "-x", text],
        capture_output=True,
        check=True,
    )
    raw = result.stdout.decode("utf-8", errors="ignore").strip()
    return parse_espeak_x(raw)

# ==============================
# PARSE ESPEAK -x OUTPUT
# ==============================
ESPEAK_PHONEMES = sorted(
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

def parse_espeak_x(raw: str) -> list[str]:
    cleaned = "".join(c for c in raw if c.isalnum() or c == "@")  # isalnum keeps digits like 0, 3
    tokens = []
    i = 0
    while i < len(cleaned):
        for p in ESPEAK_PHONEMES:
            if cleaned.startswith(p, i):
                tokens.append(p)
                i += len(p)
                break
        else:
            i += 1
    return tokens

IPA_TO_ESPEAK = {
    # Vowels
    "ɪ": "I",   "i": "I",
    "ʊ": "U",
    "ɛ": "E",   "e": "E",
    "ə": "@",
    "ɚ": "3",   # r-colored schwa (butter, over, under) → eSpeak 3
    "ɝ": "3",   # stressed r-colored vowel (bird, word) → eSpeak 3
    "ʌ": "V",
    "ɔ": "0",   # IPA ɔ → eSpeak 0 ("lot" vowel, as output by espeak-ng -x)
    "æ": "a",
    "ɑ": "A",
    # Long vowels (strip length marker)
    "iː": "i",  "uː": "U",
    "ɑː": "A",  "ɔː": "O",
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
    "ɾ": "r",   # flap r (American English)
    "ɡ": "g",   # IPA script-g (U+0261) vs ASCII g
}

# Normalise eSpeak reference phonemes to match what the model consistently produces.
# i → I: eSpeak writes the "happy" vowel (lazy, easy, city) as i;
#         wav2vec2 always outputs ɪ → I for the same sound. Treat as equivalent.
ESPEAK_REF_NORMALIZE = {
    "i": "I",
}

def normalize_user_phonemes(phonemes: list[str]) -> list[str]:
    return [IPA_TO_ESPEAK.get(p, p) for p in phonemes]

def normalize_reference_phonemes(phonemes: list[str]) -> list[str]:
    return [ESPEAK_REF_NORMALIZE.get(p, p) for p in phonemes]

# ==============================
# LOAD WAV2VEC2 PHONEME MODEL
# ==============================
tokenizer = Wav2Vec2PhonemeCTCTokenizer.from_pretrained(
    MODEL_ID,
    phonemizer_backend="espeak",
    phonemizer_lang="en-us",
)
feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(MODEL_ID)
processor = Wav2Vec2Processor(
    feature_extractor=feature_extractor,
    tokenizer=tokenizer,
)
model = Wav2Vec2ForCTC.from_pretrained(MODEL_ID).to(DEVICE)
model.eval()

# ==============================
# EDIT DISTANCE
# ==============================
def edit_distance(ref, hyp):
    dp = [[0] * (len(hyp) + 1) for _ in range(len(ref) + 1)]
    for i in range(len(ref) + 1):
        dp[i][0] = i
    for j in range(len(hyp) + 1):
        dp[0][j] = j
    for i in range(1, len(ref) + 1):
        for j in range(1, len(hyp) + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )
    return dp[-1][-1]

# ==============================
# PER-WORD SCORING
# DP segmentation: find the partition of user phonemes into W contiguous
# segments that minimises total edit distance across all words.
# Avoids the cascade misalignment caused by proportional splitting.
# ==============================
def score_per_word(words: list[str], ref_per_word: list[list[str]], user_phonemes: list[str]):
    W = len(ref_per_word)
    U = len(user_phonemes)
    INF = float("inf")

    # Precompute edit_distance(ref_per_word[i], user_phonemes[c:j]) for all i,c,j
    ed = [[[0] * (U + 1) for _ in range(U + 1)] for _ in range(W)]
    for i in range(W):
        for c in range(U + 1):
            for j in range(c, U + 1):
                ed[i][c][j] = edit_distance(ref_per_word[i], user_phonemes[c:j])

    # dp[i][j] = min cost to assign words[0..i-1] to user_phonemes[0..j-1]
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

    # Backtrack to recover optimal cut points
    boundaries = []
    j = U
    for i in range(W, 0, -1):
        c = back[i][j]
        boundaries.append((c, j))
        j = c
    boundaries.reverse()

    results = []
    for i, (start, end) in enumerate(boundaries):
        ref_word  = ref_per_word[i]
        user_slice = user_phonemes[start:end]
        d     = edit_distance(ref_word, user_slice)
        score = max(0.0, 1.0 - d / len(ref_word))
        results.append((words[i], ref_word, user_slice, round(score * 100, 1)))
    return results

# ==============================
# RECORD AUDIO
# ==============================
words = TARGET_SENTENCE.split()
ref_per_word = [normalize_reference_phonemes(get_reference_phonemes(w)) for w in words]
ref_all = [p for phonemes in ref_per_word for p in phonemes]

duration = estimate_duration(TARGET_SENTENCE)
print(f'Say: "{TARGET_SENTENCE}"')
print(f"Recording for {duration} seconds...")

audio = sd.rec(
    int(duration * SAMPLE_RATE),
    samplerate=SAMPLE_RATE,
    channels=1,
    dtype="float32",
)
sd.wait()
audio = audio.squeeze()

# ==============================
# TRANSCRIBE USER PHONEMES
# ==============================
inputs = processor(
    audio,
    sampling_rate=SAMPLE_RATE,
    return_tensors="pt",
    padding=True,
)
inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

with torch.no_grad():
    logits = model(**inputs).logits

pred_ids = torch.argmax(logits, dim=-1)
decoded = processor.batch_decode(pred_ids)[0]
user_phonemes = normalize_user_phonemes(decoded.split())

# ==============================
# SCORE
# ==============================
overall_distance = edit_distance(ref_all, user_phonemes)
overall_score = max(0.0, 1.0 - overall_distance / max(1, len(ref_all)))

word_results = score_per_word(words, ref_per_word, user_phonemes)

# ==============================
# OUTPUT
# ==============================
print(f'\nSentence : "{TARGET_SENTENCE}"')
print(f"Overall score: {round(overall_score * 100, 2)}%\n")
print(f"{'Word':<15} {'Ref phonemes':<30} {'Your phonemes':<30} {'Score'}")
print("-" * 85)
for word, ref, usr, score in word_results:
    bar = "█" * int(score / 10) + "░" * (10 - int(score / 10))
    print(f"{word:<15} {' '.join(ref):<30} {' '.join(usr):<30} {bar} {score}%")
