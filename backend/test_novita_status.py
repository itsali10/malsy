#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script to check Novita AI account status and API key validity.
Run: python test_novita_status.py
"""
import os
import sys
from dotenv import load_dotenv
from openai import OpenAI

# Fix Windows console encoding
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

load_dotenv()

def check_novita_status():
    """Check Novita account status, balance, and API key validity."""
    
    api_key = os.getenv("NOVITA_API_KEY")
    model = os.getenv("NOVITA_MODEL", "kat-coder")
    
    if not api_key:
        print("[ERROR] NOVITA_API_KEY not found in .env file")
        print("   Make sure you have set NOVITA_API_KEY in your .env file")
        return False
    
    print("=" * 60)
    print("Checking Novita AI Account Status")
    print("=" * 60)
    print(f"API Key: {api_key[:20]}...{api_key[-10:]}")
    print(f"Model: {model}")
    print(f"Base URL: https://api.novita.ai/openai")
    print()
    
    try:
        # Initialize OpenAI client with Novita endpoint
        client = OpenAI(
            api_key=api_key,
            base_url="https://api.novita.ai/openai"
        )
        
        print("[INFO] Testing API connection...")
        
        # Make a simple test request
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Say 'Hello' if you can read this."}
            ],
            max_tokens=50,
            temperature=0.4
        )
        
        print("[SUCCESS] API Key is VALID!")
        print(f"[SUCCESS] Model '{model}' is accessible!")
        print(f"[SUCCESS] Response received: {response.choices[0].message.content[:100]}")
        print()
        print("[SUCCESS] Your Novita account is working correctly!")
        return True
        
    except Exception as e:
        error_str = str(e)
        print("[ERROR] API request failed")
        print()
        
        # Check for specific error types
        if "403" in error_str or "NOT_ENOUGH_BALANCE" in error_str or "not enough balance" in error_str:
            print("[WARNING] ISSUE: Insufficient Balance")
            print("   Your API key is valid, but your account has no balance/quota.")
            print("   Solution:")
            print("   1. Go to https://novita.ai/")
            print("   2. Log in to your account")
            print("   3. Check your balance/quota in the dashboard")
            print("   4. Add credits if needed")
        elif "401" in error_str or "Unauthorized" in error_str or "Invalid API key" in error_str:
            print("[WARNING] ISSUE: Invalid API Key")
            print("   Your API key is not valid or has been revoked.")
            print("   Solution:")
            print("   1. Go to https://novita.ai/")
            print("   2. Log in to your account")
            print("   3. Generate a new API key")
            print("   4. Update NOVITA_API_KEY in your .env file")
        elif "404" in error_str or "model not found" in error_str:
            print("[WARNING] ISSUE: Model Not Found")
            print(f"   The model '{model}' is not available or not accessible with your account.")
            print("   Solution:")
            print("   1. Check if the model name is correct")
            print("   2. Verify the model is available in your account tier")
            print("   3. Try a different model in your .env: NOVITA_MODEL=...")
        else:
            print(f"⚠️  Error Details: {error_str}")
            print()
            print("   General troubleshooting:")
            print("   1. Verify your API key at https://novita.ai/")
            print("   2. Check your account balance/quota")
            print("   3. Ensure the model is available for your account")
        
        print()
        print("Full error message:")
        print(f"   {error_str}")
        return False

def check_novita_dashboard_info():
    """Provide instructions for checking account status in dashboard."""
    print()
    print("=" * 60)
    print("How to Check Your Novita Account Status")
    print("=" * 60)
    print()
    print("1. Go to: https://novita.ai/")
    print("2. Log in to your account")
    print("3. Navigate to your dashboard/console")
    print("4. Check the following:")
    print("   - Account Balance/Quota")
    print("   - API Key status")
    print("   - Available models")
    print("   - Usage history")
    print()
    print("5. If balance is low or zero:")
    print("   - Add credits to your account")
    print("   - Check if there are any free tier credits available")
    print()

if __name__ == "__main__":
    print()
    success = check_novita_status()
    check_novita_dashboard_info()
    
    if not success:
        sys.exit(1)
    else:
        sys.exit(0)
