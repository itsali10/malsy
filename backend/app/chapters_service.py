from typing import List, Dict, Optional
from .db import get_chroma_client



def list_units(chroma_path="chroma_db") -> List[Dict]:
    client = get_chroma_client(chroma_path)
    col = client.get_or_create_collection("units")  


    data = col.get(include=["metadatas", "documents"])

    ids = data.get("ids", [])              # still available here
    metas = data.get("metadatas", [])
    docs = data.get("documents", [])

    units = []
    for i in range(len(ids)):
        m = metas[i] or {}
        title = (docs[i] if i < len(docs) else None)
        
        # Get book pages (from manifest)
        start_book_page = m.get("start_book_page") or m.get("start_page", 0)
        end_book_page = m.get("end_book_page") or m.get("end_page")
        
        # Get PDF pages (0-based indices from ingestion)
        start_pdf = m.get("start_pdf", 0)
        end_pdf = m.get("end_pdf")
        pdf_offset = m.get("pdf_page_offset", 0)
        
        # Convert to 1-based PDF page numbers (human-friendly)
        start_pdf_page = start_pdf + 1 if start_pdf is not None else None
        end_pdf_page = end_pdf + 1 if end_pdf is not None else None

        units.append({
            "unit_id": m.get("unit_id", ids[i]),
            "book_id": m.get("book_id"),
            "title": m.get("title", title or ids[i]),
            "start_page": start_book_page,  # Book pages from manifest
            "end_page": end_book_page,
            "start_pdf_page": start_pdf_page,  # PDF pages (1-based)
            "end_pdf_page": end_pdf_page,
        })

    # Sort by numeric unit number (unit_01, unit_02, ... unit_18) not string sort
    def extract_unit_num(unit_id: str) -> int:
        try:
            # Extract number from "english_g6:unit_01" -> 1
            parts = unit_id.split("_")
            if len(parts) > 1:
                return int(parts[-1])
        except:
            pass
        return 0
    
    units.sort(key=lambda x: (x.get("book_id", ""), extract_unit_num(x.get("unit_id", ""))))
    return units


def next_unit_id(current_id: str, chroma_path="chroma_db") -> Optional[str]:
    units = list_units(chroma_path)  
    ids = [u["unit_id"] for u in units]
    if not ids:
        return None
    if current_id not in ids:
        return ids[0]
    idx = ids.index(current_id)
    return ids[idx + 1] if idx + 1 < len(ids) else None


def get_unit_content(unit_id: str, chroma_path="chroma_db") -> Dict:
    client = get_chroma_client(chroma_path)
    col = client.get_or_create_collection("units")  # Use "units" collection
    
    # Get unit by ID (not query - query requires embeddings/text)
    data = col.get(ids=[unit_id], include=["metadatas", "documents"])

    if not data["ids"]:
        return {"error": "Unit not found"}

    # Get the metadata and document associated with the unit_id
    unit_metadata = data["metadatas"][0]
    unit_document = data["documents"][0]

    # Get book pages (from manifest)
    start_book_page = unit_metadata.get("start_book_page") or unit_metadata.get("start_page", 0)
    end_book_page = unit_metadata.get("end_book_page") or unit_metadata.get("end_page")
    
    # Get PDF pages (0-based indices from ingestion)
    start_pdf = unit_metadata.get("start_pdf", 0)
    end_pdf = unit_metadata.get("end_pdf")
    
    # Convert to 1-based PDF page numbers (human-friendly)
    start_pdf_page = start_pdf + 1 if start_pdf is not None else None
    end_pdf_page = end_pdf + 1 if end_pdf is not None else None

    return {
        "unit_id": unit_metadata["unit_id"],
        "title": unit_metadata.get("title", ""),
        "start_page": start_book_page,  # Book pages from manifest
        "end_page": end_book_page,
        "start_pdf_page": start_pdf_page,  # PDF pages (1-based)
        "end_pdf_page": end_pdf_page,
        "content": unit_document
    }
