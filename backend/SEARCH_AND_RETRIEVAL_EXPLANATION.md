# How the AI Teacher Searches and Retrieves Book Content

## Overview
The AI teacher uses **semantic search** (vector embeddings) to find relevant content from the book. Instead of keyword matching, it understands the *meaning* of what you're looking for.

---

## Step-by-Step Process

### 1. **Book Ingestion (One-time setup)**
When a book is first added to the system:

```
PDF Book → Extract Text → Split into Chunks → Create Embeddings → Store in ChromaDB
```

**Details:**
- **File**: `ingest_books.py`
- PDF pages are extracted as text
- Text is split into small chunks (sections of pages)
- Each chunk is converted to a **vector embedding** (a numerical representation of meaning)
- Chunks are stored in ChromaDB with metadata:
  - `unit_id`: Which unit the chunk belongs to (e.g., "english_g6:unit_01")
  - `book_id`: Which book (e.g., "english_g6")
  - `pdf_page`: Page number
  - `unit_title`: Title of the unit

**Example:**
```python
# From ingest_books.py
chunk = "The bridge connects two sides of the river..."
embedding = embedder.embed_query(chunk)  # Creates vector [0.123, -0.456, ...]
chunks_col.add(
    documents=[chunk],
    embeddings=[embedding],
    metadatas=[{"unit_id": "english_g6:unit_01", "pdf_page": 6}]
)
```

---

### 2. **When Teaching a Lesson**

When the AI teacher needs to teach something, here's what happens:

#### Step 2.1: Build a Search Query
**File**: `lesson_graph.py` (lines 224-255)

The system builds a smart query based on what needs to be taught:

```python
# Example: Teaching "visual elements"
item_type = "visual"
base_query = "Word Study"  # From the unit plan

# Enhanced query for visual elements:
query = "Word Study picture illustration diagram chart image visual drawing photo figure"
```

**Query Enhancement by Item Type:**
- **Visual Elements**: Adds "picture illustration diagram chart image visual..."
- **Discussion Questions**: Adds "discuss discussion question class activity..."
- **Exercises**: Adds "exercise practice task fill blank write complete..."
- **Unit Opening**: Adds "opening introduction title page overview..."

#### Step 2.2: Convert Query to Embedding
**File**: `lesson_graph.py` (line 65 in `retrieve_for_item`)

```python
query = "Word Study picture illustration diagram chart..."
query_embedding = embedder.embed_query(query)
# Result: [0.234, -0.567, 0.891, ...] (1536 numbers)
```

#### Step 2.3: Search ChromaDB
**File**: `lesson_graph.py` (lines 72-76)

```python
# Search for similar chunks
results = chroma_collection.query(
    query_embeddings=[query_embedding],
    n_results=20,  # Get top 20 most similar chunks
    where={"unit_id": "english_g6:unit_01"}  # Only search in this unit
)
```

**How it works:**
- ChromaDB compares the query embedding with all chunk embeddings
- Uses **cosine similarity** to find chunks with similar meaning
- Returns the top 20 most relevant chunks
- Only searches within the specified `unit_id`

#### Step 2.4: Retrieve and Combine Chunks
**File**: `lesson_graph.py` (lines 295-316)

```python
# Get initial chunks
chunks = retrieve_for_item(unit_id, query, k=20)

# For visual/exercises/discussion, get additional broader context
if item_type == "visual":
    broader_query = f"{unit_title} {base_query}"
    additional_chunks = retrieve_for_item(unit_id, broader_query, k=10)
    # Merge without duplicates
    chunks.extend(additional_chunks)
```

#### Step 2.5: Pass to AI Teacher
**File**: `lesson_graph.py` (lines 327-332)

```python
# Combine all chunks into context
context = "\n\n".join([chunk["text"] for chunk in chunks])

# Send to AI with prompt
user_message = f"""
Unit Title: {unit_title}
Item to teach: {item}
Context from book:
{context}
"""
```

---

## Key Technologies

### 1. **Embeddings** (`embeddings.py`)
- Uses OpenAI's `text-embedding-3-small` model
- Converts text → 1536-dimensional vector
- Similar meanings = similar vectors

### 2. **ChromaDB** (Vector Database)
- Stores all book chunks with their embeddings
- Fast similarity search
- Filters by `unit_id` to keep content organized

### 3. **Semantic Search**
- Not keyword matching ("picture" vs "image")
- Understands meaning ("picture" ≈ "illustration" ≈ "diagram")
- Finds relevant content even if exact words don't match

---

## Example Flow

**Scenario**: Teaching "Visual Elements" from Unit 1

1. **Query Built**: 
   ```
   "Why do we build bridges and tunnels? picture illustration diagram chart image visual"
   ```

2. **Embedding Created**: 
   ```
   [0.123, -0.456, 0.789, ...] (1536 numbers)
   ```

3. **ChromaDB Searches**:
   - Compares query embedding with all chunk embeddings in `english_g6:unit_01`
   - Finds chunks that mention pictures, illustrations, diagrams
   - Returns top 20 most similar chunks

4. **Chunks Retrieved**:
   ```
   Chunk 1: "Look at the picture on page 6. It shows a bridge..."
   Chunk 2: "The diagram illustrates how tunnels are built..."
   Chunk 3: "In the illustration, you can see..."
   ...
   ```

5. **Context Sent to AI**:
   ```
   Context from book:
   Look at the picture on page 6. It shows a bridge...
   
   The diagram illustrates how tunnels are built...
   
   In the illustration, you can see...
   ...
   ```

6. **AI Teacher Generates Lesson**:
   - Uses the retrieved context
   - Describes the pictures mentioned
   - Teaches based on actual book content

---

## Why This Works Better Than Keyword Search

### Traditional Keyword Search:
```
Query: "picture"
Results: Only chunks containing the exact word "picture"
Misses: "illustration", "diagram", "image", "visual"
```

### Semantic Search (Embeddings):
```
Query: "picture"
Results: Chunks about pictures, illustrations, diagrams, images, visuals
Finds: All visual content, even if word "picture" isn't used
```

---

## Current Enhancements

### 1. **Smart Query Building** (lines 236-251)
- Different queries for different content types
- Visual elements → searches for visual-related terms
- Exercises → searches for exercise-related terms

### 2. **Broader Context Retrieval** (lines 304-316)
- For visual/exercises/discussion, gets additional chunks
- Ensures nothing is missed
- Merges results without duplicates

### 3. **Unit-Specific Search**
- Always filters by `unit_id`
- Prevents mixing content from different units
- Ensures accurate teaching

---

## Files Involved

1. **`embeddings.py`**: Creates embeddings using OpenAI
2. **`ingest_books.py`**: Ingests PDFs and stores in ChromaDB
3. **`lesson_graph.py`**: Retrieves chunks and passes to AI teacher
4. **`prompts.py`**: Instructions for AI teacher on how to use the context

---

## Debugging

To see what's being retrieved, check the debug logs:
```
[DEBUG] teach_item: Retrieving chunks for unit_id=english_g6:unit_01, query=...
[DEBUG] teach_item: Retrieved 20 chunks
[DEBUG] teach_item: First chunk preview: "Look at the picture..."
```

This shows:
- Which unit is being searched
- What query is used
- How many chunks were found
- Preview of the content


