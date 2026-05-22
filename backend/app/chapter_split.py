import re

# Regex pattern to identify chapter headings (e.g., "Chapter 1", "Chapter I")
CHAPTER_PATTERN = re.compile(r"^(chapter\s+\d+|chapter\s+[IVXLC]+)", re.IGNORECASE)

def split_into_units(pages):
    units = []
    current = {
        "unit_id": "unit_000",
        "title": "Front Matter",
        "start_page": 1,
        "end_page": None,
        "text": ""
    }
    unit_count = 0

    for p in pages:
        page_num, page_text = p["page_num"], p["text"]
        lines = page_text.splitlines()

        for line in lines[:20]:  # Only check the first 20 lines of each page
            if CHAPTER_PATTERN.match(line.strip()):  # Detect unit header
                if current["unit_id"] != "unit_000" and current["text"].strip():
                    current["end_page"] = page_num - 1  # End the current unit
                    units.append(current)

                # Start new unit
                unit_count += 1
                current = {
                    "unit_id": f"unit_{unit_count:03d}",
                    "title": line.strip(),
                    "start_page": page_num,  # Set start_page for the new unit
                    "end_page": None,
                    "text": ""
                }
                break  # No need to process further lines on this page

        current["text"] += f"\n\n[Page {page_num}]\n{page_text}"

    # Handle the last unit and set its end page
    if unit_count == 0:
        # If no units were detected, assign the entire document to a single unit
        current["unit_id"] = "unit_001"
        current["title"] = "Full Document"
    current["end_page"] = pages[-1]["page_num"]  # Set the last unit's end_page
    units.append(current)

    # Return all the units with assigned start and end pages
    return units