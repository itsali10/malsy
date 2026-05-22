import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

def get_teacher_llm(streaming: bool = False):
    """

    """
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise ValueError("OPENAI_API_KEY is missing. Set it in backend/.env")
    
    # Default to GPT-3.5-turbo (good balance of cost and quality)
    # Options: gpt-3.5-turbo, gpt-4, gpt-4o-mini, gpt-4o
    model = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
    
    print(f"[LLM] Using OpenAI with model: {model}")
    print(f"[LLM] Available models: gpt-3.5-turbo, gpt-4, gpt-4o-mini, gpt-4o")
    print(f"[LLM] Change model via OPENAI_MODEL in .env")
    
    return ChatOpenAI(
        model=model,
        api_key=openai_key,
        temperature=0.4,
        max_tokens=4096,  # Allow longer, more detailed explanations
        streaming=streaming,
    )
