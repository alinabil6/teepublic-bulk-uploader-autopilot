"""CSV parsing logic for TeePublic listings."""
import os
import re
from typing import List, Tuple, Optional
import pandas as pd
from models import DesignItem


def clean_text(value: any) -> str:
    """Normalize and clean string content from CSV."""
    if value is None or pd.isna(value):
        return ""
    text = str(value).strip()
    # Unquote if enclosed in extra quotes
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1].strip()
    return text


def parse_tags(tags_raw: str) -> Tuple[str, str, List[str]]:
    """
    Split comma-separated tags.
    Returns (main_tag, supporting_tags, all_tags_list).
    Rule: First tag -> Main Tag, all/remaining tags -> Supporting Tags.
    """
    if not tags_raw:
        return "", "", []

    # Split by comma or semicolon
    raw_list = [t.strip() for t in re.split(r"[,;]+", tags_raw) if t.strip()]
    if not raw_list:
        return "", "", []

    main_tag = raw_list[0]
    # Supporting tags can be either remaining or all; keeping remaining + all clean
    remaining = raw_list[1:] if len(raw_list) > 1 else [raw_list[0]]
    supporting_tags = ", ".join(remaining)
    return main_tag, supporting_tags, raw_list


def find_column(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    """Find a column in DataFrame matching candidate names (case-insensitive, punctuation-insensitive)."""
    normalized_cols = {
        re.sub(r"[^a-z0-9]", "", col.lower()): col for col in df.columns
    }
    for candidate in candidates:
        norm_cand = re.sub(r"[^a-z0-9]", "", candidate.lower())
        if norm_cand in normalized_cols:
            return normalized_cols[norm_cand]
    return None


def parse_csv_file(file_path: str) -> Tuple[List[DesignItem], List[str]]:
    """
    Parses a CSV file containing TeePublic listing metadata.
    Returns (list of DesignItem, list of warning messages).
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"CSV file not found: {file_path}")

    warnings: List[str] = []

    # Attempt reading with multiple encodings
    encodings = ["utf-8-sig", "utf-8", "cp1252", "latin1"]
    df = None
    for enc in encodings:
        try:
            df = pd.read_csv(file_path, encoding=enc, dtype=str)
            break
        except (UnicodeDecodeError, Exception):
            continue

    if df is None:
        raise ValueError(f"Unable to read CSV file with supported encodings ({', '.join(encodings)})")

    if df.empty:
        raise ValueError("The provided CSV file contains no data rows.")

    # Locate required and optional columns
    col_filename = find_column(df, ["File Name", "FileName", "file_name", "Filename", "File", "Image", "Design File"])
    col_title = find_column(df, ["Title", "Design Title", "Listing Title", "Name", "Headline"])
    col_tags = find_column(df, ["Tags / Keywords", "Tags", "Keywords", "Tags/Keywords", "Supporting Tags", "Tag"])
    col_desc = find_column(df, ["Description", "Desc", "Details", "Bullet 1", "Body"])

    if not col_filename:
        available_cols = ", ".join(f"'{c}'" for c in df.columns)
        raise ValueError(
            f"Missing required 'File Name' column in CSV.\n"
            f"Available columns: {available_cols}\n"
            f"Please ensure your CSV has a column named 'File Name'."
        )

    if not col_title:
        warnings.append("No 'Title' column detected. Titles will be blank or inferred from filename.")
    if not col_tags:
        warnings.append("No 'Tags / Keywords' column detected. Tags will be empty.")
    if not col_desc:
        warnings.append("No 'Description' column detected. Descriptions will be empty.")

    items: List[DesignItem] = []

    for index, (_, row) in enumerate(df.iterrows(), start=1):
        raw_filename = clean_text(row.get(col_filename, ""))
        raw_title = clean_text(row.get(col_title, "")) if col_title else ""
        raw_tags = clean_text(row.get(col_tags, "")) if col_tags else ""
        raw_desc = clean_text(row.get(col_desc, "")) if col_desc else ""

        # Fallback title if empty: basename without extension
        if not raw_title and raw_filename:
            raw_title = os.path.splitext(os.path.basename(raw_filename))[0].replace("-", " ").replace("_", " ").title()

        main_tag, supporting_tags, all_tags = parse_tags(raw_tags)

        # Build raw dict for safe reference
        row_dict = {str(k): clean_text(v) for k, v in row.items()}

        item = DesignItem(
            index=index,
            file_name=raw_filename,
            title=raw_title,
            main_tag=main_tag,
            supporting_tags=supporting_tags,
            all_tags=all_tags,
            description=raw_desc,
            file_path=None,
            is_matched=False,
            status="Missing",
            raw_data=row_dict,
        )
        items.append(item)

    return items, warnings
