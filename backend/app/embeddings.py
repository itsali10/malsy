import os
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings

load_dotenv()

def get_embedder(device: str = "cpu"):
    """

    """
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise ValueError("OPENAI_API_KEY is missing. Set it in backend/.env")
    
    return OpenAIEmbeddings(
        model="text-embedding-3-small",  # 1536 dimensions, best cost/quality balance
        openai_api_key=openai_key,
    )
