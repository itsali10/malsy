"""
Ingest uploaded textbooks into Chroma.

Usage (from backend/):
    python run_ingest_books.py                  # all books
    python run_ingest_books.py --book english   # english_g6 only
    python run_ingest_books.py --book history   # history_g6 only
    python run_ingest_books.py --book english_g6 --book history_g6

Re-ingestion purges only the target book's vectors. Lesson plans, progress,
quizzes, and generated content under data/ are never modified.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from app.ingest_books import BOOK_ALIASES, ingest_books, list_ingestible_books

DEFAULT_BOOKS_ROOT = os.path.join("data", "books")
DEFAULT_CHROMA_PATH = "chroma_db"


def _build_parser() -> argparse.ArgumentParser:
    aliases = ", ".join(f"{k}->{v}" for k, v in sorted(BOOK_ALIASES.items()))
    known = ", ".join(sorted(set(BOOK_ALIASES.values()) | set(BOOK_ALIASES.keys()) | {"all"}))
    parser = argparse.ArgumentParser(description="Ingest uploaded PDF books into Chroma.")
    parser.add_argument(
        "--book",
        action="append",
        dest="books",
        metavar="BOOK",
        help=f"Book to ingest (repeatable). Known: {known}. Aliases: {aliases}. Default: all.",
    )
    parser.add_argument(
        "--books-root",
        default=DEFAULT_BOOKS_ROOT,
        help=f"Root folder containing book directories (default: {DEFAULT_BOOKS_ROOT})",
    )
    parser.add_argument(
        "--chroma-path",
        default=DEFAULT_CHROMA_PATH,
        help=f"Chroma persistence path (default: {DEFAULT_CHROMA_PATH})",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    books_root = args.books_root
    if not os.path.isdir(books_root):
        print(f"ERROR: books root not found: {books_root}", file=sys.stderr)
        return 1

    book_keys = args.books or ["all"]
    if book_keys != ["all"]:
        available = list_ingestible_books(books_root)
        for key in book_keys:
            from app.ingest_books import resolve_book_id

            resolved = resolve_book_id(key)
            if resolved not in available:
                print(
                    f"ERROR: book {key!r} (-> {resolved!r}) not found under {books_root}. "
                    f"Available: {', '.join(available) or '(none)'}",
                    file=sys.stderr,
                )
                return 1

    print(f"Ingesting: {', '.join(book_keys)}")
    print(f"  books_root : {books_root}")
    print(f"  chroma_path: {args.chroma_path}")
    print()

    try:
        results = ingest_books(book_keys, books_root=books_root, chroma_path=args.chroma_path)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    for result in results:
        print(json.dumps(result, indent=2))
        print()

    print(f"Done — ingested {len(results)} book(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
