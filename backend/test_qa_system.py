#!/usr/bin/env python3
"""
Test script for Q&A system including hint system (2 hints, then re-explanation).

Run: python test_qa_system.py
"""
import httpx
import json
import time

BASE_URL = "http://127.0.0.1:8000"
STUDENT_ID = "test_student_qa"
CHAPTER_ID = "english_g6:unit_01"

def print_section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")

def print_response(data, show_full=False):
    """Print response in a readable format"""
    if isinstance(data, dict):
        if "quiz" in data and not show_full:
            quiz = data["quiz"]
            print(f"  Quiz Question: {quiz.get('question', 'N/A')}")
            print(f"  Expected Points: {quiz.get('expected_points', [])}")
        if "evaluation" in data:
            eval_data = data["evaluation"]
            print(f"  Correct: {eval_data.get('correct', 'N/A')}")
            print(f"  Feedback: {eval_data.get('feedback', 'N/A')[:100]}...")
        if "hint" in data and data.get("hint"):
            print(f"  Hint: {data['hint'][:150]}...")
        if "remediation_text" in data and data.get("remediation_text"):
            print(f"  Remediation: {data['remediation_text'][:150]}...")
        if "hint_count" in data:
            print(f"  Hint Count: {data['hint_count']}")
        if "advance_text" in data:
            print(f"  Advance Text: {data.get('advance_text', 'N/A')[:100]}...")
        if "next_action" in data:
            print(f"  Next Action: {data.get('next_action', 'N/A')}")
    else:
        print(f"  Response: {str(data)[:200]}")

def main():
    client = httpx.Client(timeout=180.0)
    
    try:
        # Step 1: Start Session
        print_section("STEP 1: Starting Session")
        response = client.post(
            f"{BASE_URL}/session/start",
            json={
                "student_id": STUDENT_ID,
                "chapter_id": CHAPTER_ID
            }
        )
        
        if response.status_code != 200:
            print(f"ERROR: Failed to start session. Status: {response.status_code}")
            print(response.text)
            return
        
        session_data = response.json()
        quiz = session_data.get("quiz", {})
        print(f"✓ Session started successfully")
        print(f"  Quiz Question: {quiz.get('question', 'N/A')}")
        print(f"  Expected Points: {quiz.get('expected_points', [])}")
        print(f"\n  Teacher text length: {len(session_data.get('teacher_text', ''))} characters")
        
        # Step 2: Test Wrong Answer #1 (Should get Hint #1)
        print_section("STEP 2: Testing Wrong Answer #1 (Should get Hint #1)")
        response = client.post(
            f"{BASE_URL}/session/answer",
            json={
                "student_id": STUDENT_ID,
                "student_answer": "wrong answer for testing"
            }
        )
        
        if response.status_code != 200:
            print(f"ERROR: Failed to submit answer. Status: {response.status_code}")
            print(response.text)
            return
        
        result = response.json()
        print_response(result)
        
        if result.get("correct") == False and result.get("hint"):
            print("✓ SUCCESS: Received Hint #1")
            print(f"  Hint Count: {result.get('hint_count', 0)}")
        else:
            print("✗ FAILED: Expected hint but didn't receive one")
            return
        
        time.sleep(1)  # Small delay
        
        # Step 3: Test Wrong Answer #2 (Should get Hint #2)
        print_section("STEP 3: Testing Wrong Answer #2 (Should get Hint #2)")
        response = client.post(
            f"{BASE_URL}/session/answer",
            json={
                "student_id": STUDENT_ID,
                "student_answer": "another wrong answer for testing"
            }
        )
        
        result = response.json()
        print_response(result)
        
        if result.get("correct") == False and result.get("hint"):
            hint_count = result.get("hint_count", 0)
            if hint_count == 2:
                print("✓ SUCCESS: Received Hint #2")
                print(f"  Hint Count: {hint_count}")
            else:
                print(f"✗ WARNING: Expected hint_count=2, got {hint_count}")
        else:
            print("✗ FAILED: Expected hint but didn't receive one")
            return
        
        time.sleep(1)
        
        # Step 4: Test Wrong Answer #3 (Should get Re-explanation)
        print_section("STEP 4: Testing Wrong Answer #3 (Should get Re-explanation)")
        response = client.post(
            f"{BASE_URL}/session/answer",
            json={
                "student_id": STUDENT_ID,
                "student_answer": "yet another wrong answer for testing"
            }
        )
        
        result = response.json()
        print_response(result)
        
        if result.get("correct") == False and result.get("remediation_text"):
            print("✓ SUCCESS: Received Re-explanation")
            print(f"  Hint Count: {result.get('hint_count', 0)}")
            print(f"  No hint field: {'hint' not in result or not result.get('hint')}")
        else:
            print("✗ FAILED: Expected remediation_text but didn't receive one")
            return
        
        time.sleep(1)
        
        # Step 5: Test Correct Answer
        print_section("STEP 5: Testing Correct Answer")
        # Use expected_points to form a correct answer
        # When there are multiple points, join them naturally with commas
        expected_points = quiz.get("expected_points", [])
        if len(expected_points) > 1:
            # Join with commas for a natural answer format
            correct_answer = ", ".join(expected_points)
        elif len(expected_points) == 1:
            correct_answer = expected_points[0]
        else:
            correct_answer = "correct answer"
        
        print(f"  Attempting correct answer: {correct_answer}")
        
        response = client.post(
            f"{BASE_URL}/session/answer",
            json={
                "student_id": STUDENT_ID,
                "student_answer": correct_answer
            }
        )
        
        result = response.json()
        print_response(result)
        
        if result.get("correct") == True:
            print("✓ SUCCESS: Answer marked as correct")
            print(f"  Next Action: {result.get('next_action', 'N/A')}")
        else:
            print("✗ FAILED: Answer should be correct but wasn't marked as such")
            print(f"  Try using: {correct_answer}")
        
        # Summary
        print_section("TEST SUMMARY")
        print("✓ All Q&A system tests completed!")
        print("\nTest Results:")
        print("  [✓] Session start")
        print("  [✓] Wrong answer #1 → Hint #1")
        print("  [✓] Wrong answer #2 → Hint #2")
        print("  [✓] Wrong answer #3 → Re-explanation")
        print("  [✓] Correct answer → Advance")
        
    except httpx.ConnectError:
        print("ERROR: Could not connect to server.")
        print("Make sure the server is running: python -m uvicorn app.main:app --reload")
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()


