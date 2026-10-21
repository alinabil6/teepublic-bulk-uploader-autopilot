"""File matching logic: compares CSV entries with artwork files (PNG, JPG, JPEG, WEBP, etc.) in folder."""
import os
from typing import List, Dict, Tuple
from models import DesignItem, ValidationSummary

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".svg", ".gif", ".tif", ".tiff", ".jfif"}


def scan_artwork_folder(folder_path: str) -> Dict[str, str]:
    """
    Scans a folder for artwork images (PNG, JPG, JPEG, WEBP, etc.) and returns a case-insensitive map.
    Keys: lower-cased filename and lower-cased stem (without extension)
    Value: absolute path to the file.
    """
    if not folder_path or not os.path.isdir(folder_path):
        return {}

    file_map: Dict[str, str] = {}

    try:
        entries = os.listdir(folder_path)
    except Exception:
        return {}

    for entry in entries:
        full_path = os.path.join(folder_path, entry)
        if not os.path.isfile(full_path):
            continue

        ext = os.path.splitext(entry)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            clean_name = entry.strip()
            # Ignore auto-generated screenshots
            if clean_name.lower().startswith("app_screenshot") or clean_name.lower().startswith("screenshot") or clean_name.lower().startswith("flask_ui"):
                continue

            # Store exact lowercase filename
            file_map[clean_name.lower()] = full_path
            # Also store stem (name without extension)
            stem = os.path.splitext(clean_name)[0].lower()
            if stem not in file_map:
                file_map[stem] = full_path

    return file_map


# Backwards compatibility alias
scan_png_folder = scan_artwork_folder


def match_designs_with_folder(
    items: List[DesignItem],
    folder_path: str,
    csv_path: str = ""
) -> ValidationSummary:
    """
    Matches CSV DesignItem entries against artwork files in the specified folder.
    Preserves any design item that already has an attached valid artwork file on disk.
    Updates each item's is_matched, file_path, and status in place.
    Returns a ValidationSummary.
    """
    file_map = scan_artwork_folder(folder_path) if folder_path and os.path.isdir(folder_path) else {}

    # Also include any artwork files saved in the default uploads/artwork directory
    default_art_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "uploads", "artwork"))
    if os.path.isdir(default_art_dir) and (not folder_path or os.path.abspath(folder_path) != default_art_dir):
        extra_map = scan_artwork_folder(default_art_dir)
        for k, v in extra_map.items():
            if k not in file_map:
                file_map[k] = v

    # Count unique artwork files in folder and uploads
    artwork_files_count = sum(1 for k in file_map.keys() if any(k.endswith(ext) for ext in IMAGE_EXTENSIONS))

    matched_count = 0
    missing_count = 0

    for item in items:
        # 1. If item already has a verified attached artwork file on disk, preserve it!
        if item.file_path and os.path.isfile(item.file_path):
            item.is_matched = True
            item.status = "Matched"
            matched_count += 1
            continue

        cand_name = (item.file_name or "").strip()
        cand_lower = cand_name.lower()

        matched_path = None

        if cand_lower and cand_lower in file_map:
            matched_path = file_map[cand_lower]
        elif cand_lower:
            # 2. Try with extensions if omitted in CSV
            stem = os.path.splitext(cand_lower)[0]
            if stem in file_map:
                matched_path = file_map[stem]
            else:
                for ext in IMAGE_EXTENSIONS:
                    with_ext = stem + ext
                    if with_ext in file_map:
                        matched_path = file_map[with_ext]
                        break

        if matched_path and os.path.isfile(matched_path):
            item.is_matched = True
            item.file_path = os.path.abspath(matched_path)
            item.status = "Matched"
            matched_count += 1
        else:
            item.is_matched = False
            item.file_path = None
            item.status = "Missing"
            missing_count += 1

    return ValidationSummary(
        total_csv_rows=len(items),
        matched_count=matched_count,
        missing_count=missing_count,
        folder_png_count=artwork_files_count,
        folder_path=folder_path,
        csv_path=csv_path,
    )
