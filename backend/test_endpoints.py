#!/usr/bin/env python3
"""
Quick test script for all FastAPI endpoints.
Run: python test_endpoints.py
"""
import httpx
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def print_response(title, response):
    print(f"\n{'='*60}")
    print(f"{title}")
    print(f"{'='*60}")
    print(f"Status: {response.status_code}")
    try:
        data = response.json()
        print(json.dumps(data, indent=2)[:1000])  # First 1000 chars
        if len(json.dumps(data)) > 1000:
            print("... (truncated)")
    except:
        print(response.text[:500])

def request_with_retry(client: httpx.Client, method: str, url: str, **kwargs) -> httpx.Response:
    # Helps on Windows when Uvicorn --reload restarts mid-request (WinError 10054).
    delays = [0.2, 0.5, 1.0, 2.0]
    last_exc = None
    for d in [0.0] + delays:
        if d:
            time.sleep(d)
        try:
            return client.request(method, url, **kwargs)
        except (httpx.TransportError, httpx.ReadError) as e:
            last_exc = e
            continue
    raise last_exc or RuntimeError("Request failed")

def main():
    client = httpx.Client(timeout=180.0)
    
    # 1. GET / (Root endpoint)
    print("\n[1] Testing GET / (Root)")
    r = request_with_retry(client, "GET", f"{BASE_URL}/")
    print_response("GET /", r)
    
    # 2. GET /units
    print("\n[2] Testing GET /units")
    r = request_with_retry(client, "GET", f"{BASE_URL}/units")
    print_response("GET /units", r)
    
    # Get a unit_id from the response for later tests
    units_data = r.json() if r.status_code == 200 else {}
    available_units = units_data.get("units", [])
    test_unit_id = None
    if available_units:
        test_unit_id = available_units[0].get("unit_id", "english_g6:unit_01")
    else:
        test_unit_id = "english_g6:unit_01"
    
    # 3. GET /unit/{unit_id}
    print(f"\n[3] Testing GET /unit/{test_unit_id}")
    r = request_with_retry(client, "GET", f"{BASE_URL}/unit/{test_unit_id}")
    print_response(f"GET /unit/{test_unit_id}", r)
    
    # 4. POST /session/start
    print("\n[4] Testing POST /session/start")
    student_id = "test_student_123"
    chapter_id = test_unit_id
    r = request_with_retry(
        client,
        "POST",
        f"{BASE_URL}/session/start",
        json={"student_id": student_id, "chapter_id": chapter_id},
    )
    print_response("POST /session/start", r)
    
    if r.status_code == 200:
        session_data = r.json()
        if not session_data.get("done"):
            quiz = session_data.get("quiz", {})
            print(f"\nQuiz question preview: {quiz.get('question', 'N/A')[:100]}...")
            
            # 5. POST /session/answer (with a wrong answer to test hints)
            print("\n[5] Testing POST /session/answer (wrong answer - hint #1)")
            r = request_with_retry(
                client,
                "POST",
                f"{BASE_URL}/session/answer",
                json={"student_id": student_id, "student_answer": "wrong answer for testing"},
            )
            print_response("POST /session/answer (wrong)", r)
            
            # 6. POST /session/answer (with correct answer)
            print("\n[6] Testing POST /session/answer (correct answer)")
            # Use expected_points from quiz if available
            expected_points = quiz.get("expected_points", [])
            if expected_points:
                correct_answer = " ".join(expected_points)
            else:
                correct_answer = "correct answer based on the lesson content"
            
            # Start a fresh session for correct answer test
            r_start = request_with_retry(
                client,
                "POST",
                f"{BASE_URL}/session/start",
                json={"student_id": f"{student_id}_correct", "chapter_id": chapter_id},
            )
            if r_start.status_code == 200:
                fresh_quiz = r_start.json().get("quiz", {})
                fresh_expected = fresh_quiz.get("expected_points", [])
                if fresh_expected:
                    correct_answer = " ".join(fresh_expected)
                
                r = request_with_retry(
                    client,
                    "POST",
                    f"{BASE_URL}/session/answer",
                    json={"student_id": f"{student_id}_correct", "student_answer": correct_answer},
                )
                print_response("POST /session/answer (correct)", r)
                
                # 7. POST /session/continue_part2 (if applicable)
                answer_data = r.json() if r.status_code == 200 else {}
                if answer_data.get("next_action") == "continue_unit_part2":
                    print("\n[7] Testing POST /session/continue_part2")
                    r = request_with_retry(
                        client,
                        "POST",
                        f"{BASE_URL}/session/continue_part2",
                        json={"student_id": f"{student_id}_correct"},
                    )
                    print_response("POST /session/continue_part2", r)
            
            # 8. POST /session/next_unit
            print("\n[8] Testing POST /session/next_unit")
            # Use a fresh session for next_unit test
            r_start = request_with_retry(
                client,
                "POST",
                f"{BASE_URL}/session/start",
                json={"student_id": f"{student_id}_next", "chapter_id": chapter_id},
            )
            if r_start.status_code == 200:
                r = request_with_retry(
                    client,
                    "POST",
                    f"{BASE_URL}/session/next_unit",
                    json={"student_id": f"{student_id}_next"},
                )
                print_response("POST /session/next_unit", r)

    # 9. POST /exam/weekly/start
    print("\n[9] Testing POST /exam/weekly/start")
    exam_student = "test_student_exam_1"
    r = request_with_retry(
        client,
        "POST",
        f"{BASE_URL}/exam/weekly/start",
        json={"student_id": exam_student, "unit_id": test_unit_id},
    )
    print_response("POST /exam/weekly/start", r)

    exam_data = r.json() if r.status_code == 200 else {}
    exam_id = exam_data.get("exam_id")
    q = exam_data.get("current_question") or {}

    # 10. POST /exam/answer (answer first question best-effort)
    if exam_id and q.get("id"):
        print("\n[10] Testing POST /exam/answer (first question)")
        qtype = q.get("type")
        if qtype == "mcq":
            choices = q.get("choices") or []
            ans = (choices[0].get("id") if choices and isinstance(choices[0], dict) else "A")
        elif qtype == "fill_blank":
            ans = ["test"]
        elif qtype == "matching":
            ans = {}
        else:
            ans = "test"

        r = request_with_retry(
            client,
            "POST",
            f"{BASE_URL}/exam/answer",
            json={
                "student_id": exam_student,
                "exam_id": exam_id,
                "question_id": q.get("id"),
                "answer": ans
            }
        )
        print_response("POST /exam/answer", r)

        # 11. POST /exam/finish (finish early)
        print("\n[11] Testing POST /exam/finish")
        r = request_with_retry(
            client,
            "POST",
            f"{BASE_URL}/exam/finish",
            json={"student_id": exam_student, "exam_id": exam_id},
        )
        print_response("POST /exam/finish", r)

        # 12. GET /exam/{exam_id}
        print("\n[12] Testing GET /exam/{exam_id}")
        r = request_with_retry(client, "GET", f"{BASE_URL}/exam/{exam_id}", params={"student_id": exam_student})
        print_response("GET /exam/{exam_id}", r)

    # 13. GET /evaluation/weekly
    print("\n[13] Testing GET /evaluation/weekly")
    r = request_with_retry(client, "GET", f"{BASE_URL}/evaluation/weekly", params={"student_id": exam_student})
    print_response("GET /evaluation/weekly", r)

    # 14. GET /evaluation/monthly
    print("\n[14] Testing GET /evaluation/monthly")
    r = request_with_retry(client, "GET", f"{BASE_URL}/evaluation/monthly", params={"student_id": exam_student})
    print_response("GET /evaluation/monthly", r)

    # 15. GET /evaluation/summary
    print("\n[15] Testing GET /evaluation/summary")
    r = request_with_retry(client, "GET", f"{BASE_URL}/evaluation/summary", params={"student_id": exam_student})
    print_response("GET /evaluation/summary", r)

    # 16. GET /evaluation/unit/{unit_id}
    print("\n[16] Testing GET /evaluation/unit/{unit_id}")
    r = request_with_retry(client, "GET", f"{BASE_URL}/evaluation/unit/{test_unit_id}", params={"student_id": exam_student})
    print_response("GET /evaluation/unit/{unit_id}", r)

    # 17. POST /avatar/lipsync/prepare
    print("\n[17] Testing POST /avatar/lipsync/prepare")
    prepare_body = {
        "student_id": "test_student_avatar",
        "text": "Hello student welcome to your lesson.",
        "speech_rate": 1.0,
    }
    r = request_with_retry(client, "POST", f"{BASE_URL}/avatar/lipsync/prepare", json=prepare_body)
    print_response("POST /avatar/lipsync/prepare", r)
    prep = r.json() if r.status_code == 200 else {}

    # 18. POST /avatar/lipsync/evaluate
    print("\n[18] Testing POST /avatar/lipsync/evaluate")
    expected_visemes = prep.get("visemes", [])
    actual_visemes = []
    for v in expected_visemes:
        vv = dict(v)
        vv["time_ms"] = int(vv.get("time_ms", 0)) + 10  # Simulate small playback drift
        actual_visemes.append(vv)
    eval_body = {
        "expected_visemes": expected_visemes,
        "actual_visemes": actual_visemes,
        "utterance_start_ms": 0,
        "speech_started_ms": 120,
        "speech_ended_ms": (expected_visemes[-1]["time_ms"] + expected_visemes[-1]["duration_ms"]) if expected_visemes else 0,
        "audio_end_ms": (expected_visemes[-1]["time_ms"] + expected_visemes[-1]["duration_ms"] + 20) if expected_visemes else 0,
        "transport_stats": {
            "out_of_order_packets": 0,
            "recovered_within_utterance": True
        }
    }
    r = request_with_retry(client, "POST", f"{BASE_URL}/avatar/lipsync/evaluate", json=eval_body)
    print_response("POST /avatar/lipsync/evaluate", r)

    # 19. POST /avatar/lipsync/qa/run
    print("\n[19] Testing POST /avatar/lipsync/qa/run")
    qa_body = {
        "utterance_count": 20,
        "jitter_ms": 25,
        "out_of_order_chance": 0.0,
    }
    r = request_with_retry(client, "POST", f"{BASE_URL}/avatar/lipsync/qa/run", json=qa_body)
    print_response("POST /avatar/lipsync/qa/run", r)
    
    print("\n" + "="*60)
    print("All endpoint tests completed!")
    print("="*60)
    print("\nFor detailed testing instructions, see the backend README.")

if __name__ == "__main__":
    try:
        main()
    except httpx.ConnectError:
        print("ERROR: Could not connect to server. Is Uvicorn running on http://127.0.0.1:8000?")
    except Exception as e:
        print(f"ERROR: {e}")

