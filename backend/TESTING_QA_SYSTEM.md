# Testing the Q&A System

This guide shows you how to test the quiz and answer system, including the hint system (2 hints, then re-explanation).

## Prerequisites

1. Make sure the backend server is running:
   ```bash
   cd ai_teacher/backend
   python -m uvicorn app.main:app --reload
   ```

2. The server should be running on `http://127.0.0.1:8000`

---

## Testing Steps

### Step 1: Start a Session

**Endpoint:** `POST /session/start`

**Request:**
```json
{
  "student_id": "test_student",
  "chapter_id": "english_g6:unit_01"
}
```

**cURL Command:**
```bash
curl -X POST "http://127.0.0.1:8000/session/start" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "test_student",
    "chapter_id": "english_g6:unit_01"
  }'
```

**Expected Response:**
```json
{
  "done": false,
  "chapter_id": "english_g6:unit_01",
  "session_units": [...],
  "current_unit_index_in_session": 0,
  "unit_part": 0,
  "teacher_text": "...",
  "quiz": {
    "question": "...",
    "expected_points": [...]
  }
}
```

**Save the `quiz` object** - you'll need it for testing answers.

---

### Step 2: Test Correct Answer

**Endpoint:** `POST /session/answer`

**Request:**
```json
{
  "student_id": "test_student",
  "student_answer": "Your correct answer here"
}
```

**cURL Command:**
```bash
curl -X POST "http://127.0.0.1:8000/session/answer" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "test_student",
    "student_answer": "Tri- means three"
  }'
```

**Expected Response (Correct):**
```json
{
  "correct": true,
  "evaluation": {
    "correct": true,
    "feedback": "...",
    "missing": []
  },
  "advance_text": "...",
  "next_action": "continue_unit_part2" or "next_unit"
}
```

---

### Step 3: Test Hint System (Wrong Answers)

#### Test 1: First Incorrect Answer (Hint #1)

**Request:**
```json
{
  "student_id": "test_student",
  "student_answer": "wrong answer"
}
```

**cURL Command:**
```bash
curl -X POST "http://127.0.0.1:8000/session/answer" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "test_student",
    "student_answer": "wrong answer"
  }'
```

**Expected Response (1st Wrong):**
```json
{
  "correct": false,
  "evaluation": {
    "correct": false,
    "feedback": "...",
    "missing": [...]
  },
  "hint": "Hint #1 text here...",
  "hint_count": 1,
  "remediation_text": "",
  "quiz": {...},
  "next_action": "answer_again"
}
```

#### Test 2: Second Incorrect Answer (Hint #2)

**Request:** (Same quiz question, wrong answer again)
```json
{
  "student_id": "test_student",
  "student_answer": "another wrong answer"
}
```

**Expected Response (2nd Wrong):**
```json
{
  "correct": false,
  "evaluation": {
    "correct": false,
    "feedback": "...",
    "missing": [...]
  },
  "hint": "Hint #2 text here (more helpful)...",
  "hint_count": 2,
  "remediation_text": "",
  "quiz": {...},
  "next_action": "answer_again"
}
```

#### Test 3: Third Incorrect Answer (Full Re-explanation)

**Request:** (Same quiz question, wrong answer again)
```json
{
  "student_id": "test_student",
  "student_answer": "yet another wrong answer"
}
```

**Expected Response (3rd Wrong):**
```json
{
  "correct": false,
  "evaluation": {
    "correct": false,
    "feedback": "...",
    "missing": [...]
  },
  "hint": "",
  "hint_count": 2,
  "remediation_text": "Full re-explanation of the concept...",
  "quiz": {...},
  "next_action": "answer_again"
}
```

---

## Complete Testing Flow Example

### Python Script for Testing

```python
import requests
import json

BASE_URL = "http://127.0.0.1:8000"
STUDENT_ID = "test_student"
CHAPTER_ID = "english_g6:unit_01"

# Step 1: Start session
print("=== Step 1: Starting Session ===")
response = requests.post(
    f"{BASE_URL}/session/start",
    json={
        "student_id": STUDENT_ID,
        "chapter_id": CHAPTER_ID
    }
)
session_data = response.json()
print(f"Session started. Quiz question: {session_data.get('quiz', {}).get('question', 'N/A')}")
quiz = session_data.get("quiz")
print()

# Step 2: Test wrong answer (Hint #1)
print("=== Step 2: Testing Wrong Answer #1 (Should get Hint #1) ===")
response = requests.post(
    f"{BASE_URL}/session/answer",
    json={
        "student_id": STUDENT_ID,
        "student_answer": "wrong answer"
    }
)
result = response.json()
print(f"Correct: {result.get('correct')}")
print(f"Hint: {result.get('hint', 'N/A')}")
print(f"Hint Count: {result.get('hint_count', 0)}")
print(f"Evaluation: {result.get('evaluation', {}).get('feedback', 'N/A')}")
print()

# Step 3: Test wrong answer again (Hint #2)
print("=== Step 3: Testing Wrong Answer #2 (Should get Hint #2) ===")
response = requests.post(
    f"{BASE_URL}/session/answer",
    json={
        "student_id": STUDENT_ID,
        "student_answer": "another wrong answer"
    }
)
result = response.json()
print(f"Correct: {result.get('correct')}")
print(f"Hint: {result.get('hint', 'N/A')}")
print(f"Hint Count: {result.get('hint_count', 0)}")
print(f"Evaluation: {result.get('evaluation', {}).get('feedback', 'N/A')}")
print()

# Step 4: Test wrong answer third time (Re-explanation)
print("=== Step 4: Testing Wrong Answer #3 (Should get Re-explanation) ===")
response = requests.post(
    f"{BASE_URL}/session/answer",
    json={
        "student_id": STUDENT_ID,
        "student_answer": "yet another wrong answer"
    }
)
result = response.json()
print(f"Correct: {result.get('correct')}")
print(f"Remediation: {result.get('remediation_text', 'N/A')}")
print(f"Hint Count: {result.get('hint_count', 0)}")
print()

# Step 5: Test correct answer
print("=== Step 5: Testing Correct Answer ===")
# Use the expected_points from the quiz to form a correct answer
correct_answer = " ".join(quiz.get("expected_points", ["correct answer"]))
response = requests.post(
    f"{BASE_URL}/session/answer",
    json={
        "student_id": STUDENT_ID,
        "student_answer": correct_answer
    }
)
result = response.json()
print(f"Correct: {result.get('correct')}")
print(f"Advance Text: {result.get('advance_text', 'N/A')}")
print(f"Next Action: {result.get('next_action', 'N/A')}")
```

---

## Testing with Postman or HTTP Client

### 1. Start Session
- **Method:** POST
- **URL:** `http://127.0.0.1:8000/session/start`
- **Body (JSON):**
  ```json
  {
    "student_id": "test_student",
    "chapter_id": "english_g6:unit_01"
  }
  ```
- **Save:** Copy the `quiz.question` from response

### 2. Answer Quiz (Wrong - Hint #1)
- **Method:** POST
- **URL:** `http://127.0.0.1:8000/session/answer`
- **Body (JSON):**
  ```json
  {
    "student_id": "test_student",
    "student_answer": "wrong answer"
  }
  ```
- **Check:** Response should have `hint` field with hint #1, `hint_count: 1`

### 3. Answer Quiz (Wrong - Hint #2)
- **Method:** POST
- **URL:** `http://127.0.0.1:8000/session/answer`
- **Body (JSON):**
  ```json
  {
    "student_id": "test_student",
    "student_answer": "another wrong answer"
  }
  ```
- **Check:** Response should have `hint` field with hint #2, `hint_count: 2`

### 4. Answer Quiz (Wrong - Re-explanation)
- **Method:** POST
- **URL:** `http://127.0.0.1:8000/session/answer`
- **Body (JSON):**
  ```json
  {
    "student_id": "test_student",
    "student_answer": "yet another wrong answer"
  }
  ```
- **Check:** Response should have `remediation_text` field, `hint_count: 2`, no `hint` field

### 5. Answer Quiz (Correct)
- **Method:** POST
- **URL:** `http://127.0.0.1:8000/session/answer`
- **Body (JSON):**
  ```json
  {
    "student_id": "test_student",
    "student_answer": "correct answer based on expected_points"
  }
  ```
- **Check:** Response should have `correct: true`, `advance_text`, and `next_action`

---

## Testing Listening Questions

Listening questions work the same way as quiz questions:

1. **Start session** - The teacher_text will include a listening story and questions
2. **Answer listening questions** using `/session/answer` endpoint
3. **Same hint system applies:**
   - 1st wrong → Hint #1
   - 2nd wrong → Hint #2
   - 3rd wrong → Re-explanation

---

## Quick Test Commands

### Windows PowerShell

```powershell
# Start session
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/session/start" -Method POST -ContentType "application/json" -Body '{"student_id":"test_student","chapter_id":"english_g6:unit_01"}'
$quiz = $response.quiz
Write-Host "Quiz: $($quiz.question)"

# Wrong answer #1
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/session/answer" -Method POST -ContentType "application/json" -Body '{"student_id":"test_student","student_answer":"wrong"}'
Write-Host "Hint #1: $($response.hint)"

# Wrong answer #2
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/session/answer" -Method POST -ContentType "application/json" -Body '{"student_id":"test_student","student_answer":"wrong again"}'
Write-Host "Hint #2: $($response.hint)"

# Wrong answer #3
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/session/answer" -Method POST -ContentType "application/json" -Body '{"student_id":"test_student","student_answer":"still wrong"}'
Write-Host "Remediation: $($response.remediation_text)"
```

---

## Expected Behavior Summary

| Attempt | Answer | Response Contains |
|---------|--------|-------------------|
| 1st | Wrong | `hint` (Hint #1), `hint_count: 1` |
| 2nd | Wrong | `hint` (Hint #2), `hint_count: 2` |
| 3rd | Wrong | `remediation_text` (full re-explanation), `hint_count: 2`, no `hint` |
| 4th+ | Correct | `correct: true`, `advance_text`, `next_action` |

---

## Troubleshooting

1. **"No active session" error:**
   - Make sure you called `/session/start` first
   - Check that `student_id` matches in all requests

2. **Hint count not incrementing:**
   - Check that progress is being saved correctly
   - Verify `hint_count` is in the progress store

3. **Same quiz question:**
   - The quiz should stay the same until answered correctly
   - Check that `provided_quiz` is being passed correctly

4. **No hints appearing:**
   - Check that `HINT_PROMPT` is being called
   - Verify the evaluation is marking answers as incorrect

---

## Testing Checklist

- [ ] Start session and receive quiz
- [ ] Answer correctly → Get `correct: true` and advance
- [ ] Answer incorrectly (1st time) → Get hint #1
- [ ] Answer incorrectly (2nd time) → Get hint #2
- [ ] Answer incorrectly (3rd time) → Get re-explanation
- [ ] Answer correctly after hints → Get `correct: true`
- [ ] Verify quiz question stays the same during retries
- [ ] Verify hint_count increments correctly (1, 2, then reset)


