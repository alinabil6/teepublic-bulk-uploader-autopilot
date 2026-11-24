"""File matching logic: compares CSV entries with artwork files (PNG, JPG, JPEG, WEBP) in folder.

Supports:
1. Literal exact filename match (e.g. 'design_01_design-to-design.png' == 'design_01_design-to-design.png')
2. Stem matching with extension variations
3. Smart Canva / Embedded Number Matching (Solution A):
   Matches 'design_19_design-to-design.png' <-> '19.png' from Canva page exports automatically
   without needing manual renaming in Canva or Excel.
4. Batch Canva filename restoration tool to sync on-disk filenames.
"""
import os
import re
from typing import List, Dict, Tuple, Optional, Any
from models import DesignItem, ValidationSummary

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def validate_image_file(file_path: str) -> Tuple[bool, Optional[str]]:
    """
    Validates image file readability, format, and pixel dimensions for TeePublic.
    TeePublic strictly requires transparent PNGs, recommended minimum 1500x1995px.
    """
    if not os.path.isfile(file_path):
        return False, "File does not exist on disk"

    ext = os.path.splitext(file_path)[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        return False, f"Unsupported format '{ext}'. TeePublic requires .png, .jpg, or .webp."

    if not PIL_AVAILABLE:
        return True, None

    try:
        with Image.open(file_path) as img:
            w, h = img.size
            fmt = (img.format or "").upper()
            if fmt != "PNG":
                return True, f"Non-PNG format ({fmt}). TeePublic recommends high-resolution transparent PNG."
            if w < 1500 or h < 1995:
                return True, f"Low resolution ({w}x{h}px). Recommended minimum is 1500x1995px."
            return True, None
    except Exception as e:
        return False, f"Corrupted or unreadable image file: {e}"


def extract_design_number(name: str) -> Optional[int]:
    """
    Extracts the numerical identifier from a design filename, stem, or label.
    Handles:
      - 'design_01_design-to-design.png' -> 1
      - 'design_19_vintage.png' -> 19
      - 'design_12.png' -> 12
      - '1.png', '01.png' -> 1
      - 'Untitled design - 1.png' -> 1
      - 'Page 5.png', 'page_5.png' -> 5
      - 'scraped_7.png' -> 7
    """
    if not name:
        return None
    stem = os.path.splitext(os.path.basename(name))[0].strip()

    # 1. Match explicit design prefix: design_01, design-01, design 12
    m = re.search(r'design[_\-\s]*0*(\d+)', stem, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass

    # 2. Match page, scraped, or item prefix: page_1, page 1, scraped_7
    m = re.search(r'(?:page|scraped|item)[_\-\s]*0*(\d+)', stem, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass

    # 3. Match pure standalone integer or integer surrounded by separators: "1", "01", "Untitled design - 1"
    m = re.search(r'(?:^|[\s_\-#\(\)\[\]\-])0*(\d+)(?:[\s_\-#\(\)\[\]\-]|$)', stem)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass

    # 4. Any standalone sequence of digits
    m = re.search(r'\b0*(\d+)\b', stem)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass

    return None


def scan_artwork_inventory(folder_path: str) -> Tuple[Dict[str, str], Dict[int, str]]:
    """
    Scans a folder for artwork images and returns:
    1. file_map: case-insensitive filename and stem -> absolute path
    2. number_map: design integer index -> absolute path (prioritizing pure numeric files like 1.png)
    """
    if not folder_path or not os.path.isdir(folder_path):
        return {}, {}

    file_map: Dict[str, str] = {}
    num_scored: Dict[int, Tuple[int, str]] = {}

    try:
        entries = os.listdir(folder_path)
    except Exception:
        return {}, {}

    for entry in entries:
        full_path = os.path.join(folder_path, entry)
        if not os.path.isfile(full_path):
            continue

        ext = os.path.splitext(entry)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            clean_name = entry.strip()
            # Ignore auto-generated screenshots
            if clean_name.lower().startswith(("app_screenshot", "screenshot", "flask_ui")):
                continue

            lower_name = clean_name.lower()
            stem = os.path.splitext(clean_name)[0].lower()

            file_map[lower_name] = full_path
            if stem not in file_map:
                file_map[stem] = full_path

            # Index by extracted number
            num = extract_design_number(clean_name)
            if num is not None:
                # Prioritize pure numbers (e.g. 1.png, 01.png) over complex strings
                if stem.isdigit():
                    score = 100
                elif stem.startswith("design_") or stem.startswith("page_"):
                    score = 70
                elif "untitled" in stem:
                    score = 50
                else:
                    score = 20

                if num not in num_scored or score > num_scored[num][0]:
                    num_scored[num] = (score, full_path)

    number_map = {num: path for num, (score, path) in num_scored.items()}
    return file_map, number_map


def scan_artwork_folder(folder_path: str) -> Dict[str, str]:
    """
    Scans a folder for artwork images and returns a case-insensitive map.
    Keys: lower-cased filename and lower-cased stem (without extension)
    Value: absolute path to the file.
    Maintains full backwards compatibility.
    """
    file_map, _ = scan_artwork_inventory(folder_path)
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

    Matching Hierarchy:
    1. Preserves existing valid paths on disk.
    2. Exact filename match (case-insensitive): cand_lower in file_map.
    3. Stem match with/without extension variations.
    4. Smart Canva / Embedded Number Match (Solution A):
       Extracts design number from CSV file_name ('design_19_...') and pairs with '19.png'.
    5. Fallback for blank/generic file_name using item.index.

    Updates each item's is_matched, file_path, status, and validation_warning in place.
    Returns a ValidationSummary.
    """
    file_map, number_map = scan_artwork_inventory(folder_path) if folder_path and os.path.isdir(folder_path) else ({}, {})

    # Also include any artwork files saved in the default uploads/artwork directory
    default_art_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "uploads", "artwork"))
    if os.path.isdir(default_art_dir) and (not folder_path or os.path.abspath(folder_path) != default_art_dir):
        extra_map, extra_num = scan_artwork_inventory(default_art_dir)
        for k, v in extra_map.items():
            if k not in file_map:
                file_map[k] = v
        for num, v in extra_num.items():
            if num not in number_map:
                number_map[num] = v

    # Count unique artwork files in folder and uploads
    artwork_files_count = sum(1 for k in file_map.keys() if any(k.endswith(ext) for ext in IMAGE_EXTENSIONS))

    matched_count = 0
    missing_count = 0

    for item in items:
        # 1. If item already has a verified attached artwork file on disk, preserve it!
        if item.file_path and os.path.isfile(item.file_path):
            is_valid, warn = validate_image_file(item.file_path)
            item.validation_warning = warn
            if is_valid:
                item.is_matched = True
                item.status = "Matched"
                item.has_thumbnail = True
                matched_count += 1
            else:
                item.is_matched = False
                item.status = "Invalid Image"
                item.has_thumbnail = False
                missing_count += 1
            continue

        cand_name = (item.file_name or "").strip()
        cand_lower = cand_name.lower()
        matched_path = None

        # 2. Exact match on filename (e.g. design_19_design-to-design.png)
        if cand_lower and cand_lower in file_map:
            matched_path = file_map[cand_lower]

        # 3. Stem match with extensions (e.g. design_19_design-to-design)
        if not matched_path and cand_lower:
            stem = os.path.splitext(cand_lower)[0]
            if stem in file_map:
                matched_path = file_map[stem]
            else:
                for ext in IMAGE_EXTENSIONS:
                    with_ext = stem + ext
                    if with_ext in file_map:
                        matched_path = file_map[with_ext]
                        break

        # 4. Smart Canva / Embedded Number Match (Solution A)
        # E.g. CSV has "design_19_design-to-design.png" -> extracts 19 -> pairs with Canva's "19.png"
        if not matched_path and cand_lower:
            num = extract_design_number(cand_lower)
            if num is not None and num in number_map:
                matched_path = number_map[num]

        # 5. Fallback for blank/generic filename using 1-based item.index
        if not matched_path:
            if not cand_lower or cand_lower in ("image.png", "artwork.png", "design.png", "untitled.png"):
                if item.index in number_map:
                    matched_path = number_map[item.index]

        if matched_path and os.path.isfile(matched_path):
            is_valid, warn = validate_image_file(matched_path)
            item.validation_warning = warn
            if is_valid:
                item.is_matched = True
                item.file_path = os.path.abspath(matched_path)
                item.status = "Matched"
                item.has_thumbnail = True
                matched_count += 1
            else:
                item.is_matched = False
                item.file_path = None
                item.status = "Invalid Image"
                item.has_thumbnail = False
                missing_count += 1
        else:
            item.is_matched = False
            item.file_path = None
            item.status = "Missing"
            item.has_thumbnail = False
            missing_count += 1

    return ValidationSummary(
        total_csv_rows=len(items),
        matched_count=matched_count,
        missing_count=missing_count,
        folder_png_count=artwork_files_count,
        folder_path=folder_path,
        csv_path=csv_path,
    )


def sync_canva_filenames(items: List[DesignItem], folder_path: str) -> Dict[str, Any]:
    """
    Utility tool to rename Canva exported files (e.g. 1.png, 2.png, 12.png)
    in the specified folder to their full original filenames from the CSV listings
    (e.g. design_01_design-to-design.png).

    Returns a summary dict with renamed files list and counts.
    """
    if not folder_path or not os.path.isdir(folder_path):
        return {"error": "Invalid folder path", "renamed_count": 0, "renamed_files": []}

    renamed_files: List[Tuple[str, str]] = []
    errors: List[str] = []

    for item in items:
        if not item.file_name:
            continue

        num = extract_design_number(item.file_name)
        if num is None:
            continue

        target_name = item.file_name.strip()
        target_path = os.path.join(folder_path, target_name)

        # Check for candidates like 1.png, 01.png in folder_path
        candidates = [
            f"{num}.png",
            f"{num:02d}.png",
            f"{num}.jpg",
            f"{num:02d}.jpg",
            f"Untitled design - {num}.png",
            f"Page {num}.png"
        ]

        found_src = None
        for cand in candidates:
            cand_p = os.path.join(folder_path, cand)
            if os.path.isfile(cand_p):
                found_src = cand_p
                break

        if found_src and found_src != target_path:
            try:
                # If target already exists, do not overwrite unless identical
                if not os.path.exists(target_path):
                    os.rename(found_src, target_path)
                    renamed_files.append((os.path.basename(found_src), target_name))
            except Exception as e:
                errors.append(f"Failed to rename {os.path.basename(found_src)} to {target_name}: {e}")

    return {
        "renamed_count": len(renamed_files),
        "renamed_files": renamed_files,
        "errors": errors
    }
