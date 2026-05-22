# Quick Start: Testing the Q&A System

## Step-by-Step Instructions

### Step 1: Start the Backend Server

Open a **Terminal/PowerShell window** and run:

```powershell
cd c:\Users\Linaa\OneDrive\Desktop\trail2\ai_teacher\backend
python -m uvicorn app.main:app --reload
```

**Keep this window open** - the server needs to keep running.

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Application startup complete.
```

---

### Step 2: Run the Test Script

Open a **NEW Terminal/PowerShell window** (keep the server running in the first window) and run:

```powershell
cd c:\Users\Linaa\OneDrive\Desktop\trail2\ai_teacher\backend
python test_qa_system.py
```

---

### Step 3: What to Expect

The script will:
1. ✅ Start a session and get a quiz question
2. ✅ Test wrong answer #1 → Should get Hint #1
3. ✅ Test wrong answer #2 → Should get Hint #2  
4. ✅ Test wrong answer #3 → Should get Re-explanation
5. ✅ Test correct answer → Should advance

**Example Output:**
```
======================================================================
  STEP 1: Starting Session
======================================================================
✓ Session started successfully
  Quiz Question: What does the prefix 'tri-' mean?
  Expected Points: ['Tri- means three']

======================================================================
  STEP 2: Testing Wrong Answer #1 (Should get Hint #1)
======================================================================
  Correct: False
  Hint: Think about words that start with "tri-"...
  Hint Count: 1
✓ SUCCESS: Received Hint #1

... (continues for all steps)
```

---

## Alternative: Manual Testing

If you prefer to test manually, you can use:

### Option A: PowerShell Commands

```powershell
# 1. Start session
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/session/start" -Method POST -ContentType "application/json" -Body '{"student_id":"test","chapter_id":"english_g6:unit_01"}'
$quiz = $response.quiz
Write-Host "Question: $($quiz.question)"

# 2. Answer wrong (Hint #1)
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/session/answer" -Method POST -ContentType "application/json" -Body '{"student_id":"test","student_answer":"wrong"}'
Write-Host "Hint: $($response.hint)"
Write-Host "Hint Count: $($response.hint_count)"

# 3. Answer wrong again (Hint #2)
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/session/answer" -Method POST -ContentType "application/json" -Body '{"student_id":"test","student_answer":"wrong again"}'
Write-Host "Hint: $($response.hint)"
Write-Host "Hint Count: $($response.hint_count)"

# 4. Answer wrong third time (Re-explanation)
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/session/answer" -Method POST -ContentType "application/json" -Body '{"student_id":"test","student_answer":"still wrong"}'
Write-Host "Remediation: $($response.remediation_text)"
```

### Option B: Python Interactive

```python
import requests

BASE = "http://127.0.0.1:8000"

# Start session
r = requests.post(f"{BASE}/session/start", json={"student_id":"test","chapter_id":"english_g6:unit_01"})
quiz = r.json()["quiz"]
print(f"Question: {quiz['question']}")

# Wrong answer #1
r = requests.post(f"{BASE}/session/answer", json={"student_id":"test","student_answer":"wrong"})
print(f"Hint: {r.json().get('hint')}")
print(f"Count: {r.json().get('hint_count')}")

# Wrong answer #2
r = requests.post(f"{BASE}/session/answer", json={"student_id":"test","student_answer":"wrong again"})
print(f"Hint: {r.json().get('hint')}")
print(f"Count: {r.json().get('hint_count')}")

# Wrong answer #3
r = requests.post(f"{BASE}/session/answer", json={"student_id":"test","student_answer":"still wrong"})
print(f"Remediation: {r.json().get('remediation_text')}")
```

---

## Troubleshooting

**Error: "Could not connect to server"**
- Make sure the server is running in another terminal
- Check that it's running on `http://127.0.0.1:8000`

**Error: "No active session"**
- Make sure you called `/session/start` first
- Use the same `student_id` in all requests

**Error: "Module not found"**
- Make sure you're in the `backend` directory
- Install dependencies: `pip install -r requirements.txt`

---

## Quick Reference

**Server URL:** `http://127.0.0.1:8000`

**Endpoints:**
- `POST /session/start` - Start a session
- `POST /session/answer` - Answer a quiz question
- `POST /session/continue_part2` - Continue to part 2
- `POST /session/next_unit` - Move to next unit

**Test Script:** `python test_qa_system.py`

