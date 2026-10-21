"""Flask server backend for TeePublic Bulk Uploader."""
import os
import sys
import json
import time
import queue
import datetime
import threading
from typing import List, Dict, Any, Optional

from flask import Flask, request, jsonify, Response, send_file, render_template
from werkzeug.utils import secure_filename

from models import DesignItem, ValidationSummary, ColorPreference
from csv_parser import parse_csv_file
from file_matcher import match_designs_with_folder, IMAGE_EXTENSIONS
from automation import TeePublicAutomation, TEEPUBLIC_COLORS

# Define 12 TeePublic products
PRODUCTS = [
    "T-Shirt", "Hoodie", "Tank", "Crewneck", "Long Sleeve",
    "Baseball Tee", "Kids", "Kids Hoodie", "Kids Long Sleeve T-Shirt",
    "Hats", "Shorts", "Bags"
]

DARK_COLORS_PRESET = {
    "T-Shirt": "Black", "Hoodie": "Navy", "Tank": "Black", "Crewneck": "Black",
    "Long Sleeve": "Navy", "Baseball Tee": "Black", "Kids": "Black",
    "Kids Hoodie": "Navy", "Kids Long Sleeve T-Shirt": "Black",
    "Hats": "Black", "Shorts": "Black", "Bags": "Black"
}

LIGHT_COLORS_PRESET = {
    "T-Shirt": "White", "Hoodie": "Natural Heather", "Tank": "White", "Crewneck": "White",
    "Long Sleeve": "White", "Baseball Tee": "White", "Kids": "White",
    "Kids Hoodie": "Natural Heather", "Kids Long Sleeve T-Shirt": "White",
    "Hats": "Creme", "Shorts": "White", "Bags": "Natural Heather"
}

DEFAULT_COLORS_PRESET = {p: "Black" for p in PRODUCTS}

# Set up Flask app
app = Flask(
    __name__,
    static_folder="ui",
    template_folder="ui",
    static_url_path=""
)
app.config["JSON_AS_ASCII"] = False

# Ensure upload directories exist
UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
ARTWORK_DIR = os.path.join(UPLOAD_DIR, "artwork")
os.makedirs(ARTWORK_DIR, exist_ok=True)

def clean_uploads_directory():
    """Remove all uploaded CSV and artwork files from the uploads directory."""
    for root_dir in [ARTWORK_DIR, UPLOAD_DIR]:
        if os.path.exists(root_dir):
            for entry in os.listdir(root_dir):
                full_path = os.path.join(root_dir, entry)
                if os.path.isfile(full_path):
                    try:
                        os.remove(full_path)
                    except Exception:
                        pass

# Application in-memory state
class AppState:
    def __init__(self):
        self.csv_paths: List[str] = []
        self.folder_path: str = ""
        self.designs: List[DesignItem] = []
        self.summary: Optional[ValidationSummary] = None
        self.design_settings: Dict[int, Dict[str, Any]] = {}
        self.logs: List[Dict[str, str]] = []
        self.log_subscribers: List[queue.Queue] = []
        self.progress: Dict[str, int] = {"current": 0, "total": 0}
        self.lock = threading.RLock()
        self.active_automation: Optional[TeePublicAutomation] = None

    @property
    def csv_path(self) -> str:
        return self.csv_paths[-1] if self.csv_paths else ""

    @csv_path.setter
    def csv_path(self, val: str):
        if val and val not in self.csv_paths:
            self.csv_paths.append(val)

    def add_log(self, level: str, message: str):
        with self.lock:
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            entry = {"ts": ts, "level": level.upper(), "message": message}
            self.logs.append(entry)
            
            # Broadcast to SSE clients
            dead_subs = []
            for q in self.log_subscribers:
                try:
                    q.put_nowait({"type": "log", "data": entry})
                except Exception:
                    dead_subs.append(q)
            for d in dead_subs:
                if d in self.log_subscribers:
                    self.log_subscribers.remove(d)

    def set_progress(self, current: int, total: int):
        with self.lock:
            self.progress = {"current": current, "total": total}
            dead_subs = []
            for q in self.log_subscribers:
                try:
                    q.put_nowait({"type": "progress", "data": self.progress})
                except Exception:
                    dead_subs.append(q)
            for d in dead_subs:
                if d in self.log_subscribers:
                    self.log_subscribers.remove(d)

    def clear_all(self, wipe_disk: bool = True):
        with self.lock:
            self.designs = []
            self.summary = None
            self.csv_paths = []
            self.design_settings = {}
            self.progress = {"current": 0, "total": 0}
            self.folder_path = ""
        if wipe_disk:
            clean_uploads_directory()

    def delete_design_at(self, idx: int) -> bool:
        with self.lock:
            if 0 <= idx < len(self.designs):
                self.designs.pop(idx)
                # Re-index remaining designs
                for new_idx, item in enumerate(self.designs):
                    item.index = new_idx + 1
                # Re-map settings
                new_settings = {}
                for k, v in self.design_settings.items():
                    if k < idx:
                        new_settings[k] = v
                    elif k > idx:
                        new_settings[k - 1] = v
                self.design_settings = new_settings
                return True
            return False

    def to_dict(self) -> Dict[str, Any]:
        with self.lock:
            total = len(self.designs)
            matched = sum(1 for d in self.designs if (d.is_matched and d.file_path and os.path.isfile(d.file_path)))
            missing = total - matched

            designs_data = []
            default_toggles = {p: True for p in PRODUCTS}

            for i, item in enumerate(self.designs):
                settings = self.design_settings.get(i, {})
                has_thumb = bool(item.file_path and os.path.isfile(item.file_path))
                is_ready = bool(item.is_matched and has_thumb)
                designs_data.append({
                    "index": i + 1,
                    "tracker_id": f"#{i + 1:02d}",
                    "file_name": item.file_name,
                    "title": item.title,
                    "main_tag": item.main_tag,
                    "supporting_tags": item.supporting_tags,
                    "description": item.description,
                    "file_path": item.file_path or "",
                    "is_matched": is_ready,
                    "status": "Confirmed" if is_ready else "Missing",
                    "has_thumbnail": has_thumb,
                    "default_color": settings.get("product_colors", {}).get("T-Shirt") or settings.get("apparel_settings", {}).get("T-Shirt", {}).get("defaultColor") or "Black",
                    "color_preference": settings.get("color_preference", "all"),
                    "product_colors": settings.get("product_colors", dict(DEFAULT_COLORS_PRESET)),
                    "product_toggles": settings.get("product_toggles", default_toggles),
                    "mature_content": settings.get("mature_content", "no"),
                    "print_placement": settings.get("print_placement", "front"),
                    "scale": settings.get("scale", 100),
                    "album": settings.get("album", ""),
                    "apparel_settings": settings.get("apparel_settings", {}),
                    "available_colors": settings.get("available_colors", []),
                })

            if self.csv_paths:
                names = [os.path.basename(p) for p in self.csv_paths]
                if len(names) == 1:
                    csv_filename = names[0]
                else:
                    csv_filename = f"{len(names)} CSVs ({', '.join(names[-2:])})"
            else:
                csv_filename = "No CSV loaded"

            return {
                "designs": designs_data,
                "summary": {
                    "total": total,
                    "matched": matched,
                    "missing": missing,
                    "csv_path": self.csv_path,
                    "csv_filename": csv_filename,
                    "folder_path": self.folder_path,
                },
                "progress": self.progress,
                "is_running_automation": bool(self.active_automation and self.active_automation.is_running),
                "logs": self.logs[-100:]
            }

state = AppState()

def execute_matching():
    if not state.designs:
        return

    os.makedirs(ARTWORK_DIR, exist_ok=True)
    if not state.folder_path or not os.path.isdir(state.folder_path):
        state.folder_path = os.path.abspath(ARTWORK_DIR)

    summary = match_designs_with_folder(state.designs, state.folder_path, state.csv_path)
    state.summary = summary
    state.set_progress(summary.matched_count, summary.total_csv_rows)
    state.add_log("INFO", f"Matching: {summary.matched_count} Confirmed ✓ | {summary.missing_count} Awaiting Image")
    if summary.matched_count > 0:
        state.add_log("SUCCESS", f"{summary.matched_count} design(s) confirmed with artwork!")
    if summary.missing_count > 0:
        state.add_log("INFO", f"{summary.missing_count} listing(s) awaiting artwork image.")

def load_csv_data(csv_file: str, folder: str = "", source: str = "", append: bool = False):
    csv_name = os.path.basename(csv_file)
    state.add_log("INFO", f"Loading CSV: {csv_name} [{source}]")
    try:
        items, warnings = parse_csv_file(csv_file)
        for w in warnings:
            state.add_log("WARNING", w)

        with state.lock:
            abs_csv = os.path.abspath(csv_file)
            if not append or not state.designs:
                state.designs = []
                state.csv_paths = [abs_csv]
                state.design_settings = {}
                start_index = 0
            else:
                if abs_csv not in state.csv_paths:
                    state.csv_paths.append(abs_csv)
                start_index = len(state.designs)

            for idx, item in enumerate(items):
                item.index = start_index + idx + 1
                state.designs.append(item)

        state.add_log("SUCCESS", f"Loaded {len(items)} listing(s) from {csv_name}. Total listings: {len(state.designs)}.")

        target_folder = folder or state.folder_path
        if target_folder and os.path.isdir(target_folder):
            state.folder_path = os.path.abspath(target_folder)
            execute_matching()
        else:
            state.summary = ValidationSummary(
                total_csv_rows=len(state.designs),
                matched_count=0,
                missing_count=len(state.designs),
                csv_path=state.csv_path
            )
            state.set_progress(0, len(state.designs))

    except Exception as e:
        state.add_log("ERROR", f"Failed to parse CSV {csv_name}: {str(e)}")

# ================= CORS & PREFLIGHT =================

@app.before_request
def handle_options_preflight():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        return response

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
    return response

# ================= FLASK ROUTES =================

@app.route("/")
def index():
    return send_file(os.path.join("ui", "index.html"))

@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(state.to_dict())

@app.route("/api/sync", methods=["POST", "GET"])
def sync_studio():
    """
    Comprehensive Studio Synchronization:
    1. Re-scans artwork directory on disk for existing and new files.
    2. Validates existing artwork file paths on disk.
    3. Re-runs intelligent matching between designs and artwork.
    4. Updates summaries, status badges, and thumbnail caches.
    5. Returns the synchronized state with detailed metrics.
    """
    with state.lock:
        os.makedirs(ARTWORK_DIR, exist_ok=True)
        if not state.folder_path or not os.path.isdir(state.folder_path):
            state.folder_path = os.path.abspath(ARTWORK_DIR)

        # Validate that any previously assigned files still exist on disk
        for d in state.designs:
            if d.file_path:
                if os.path.exists(d.file_path):
                    d.is_matched = True
                    d.has_thumbnail = True
                else:
                    d.file_path = None
                    d.is_matched = False
                    d.has_thumbnail = False

        # Execute matching against the artwork directory
        if state.designs:
            execute_matching()

        total = len(state.designs)
        matched = sum(1 for d in state.designs if d.is_matched)
        missing = total - matched

        state.add_log("SUCCESS", f"Studio Synchronized: {matched}/{total} confirmed with artwork, {missing} awaiting image.")

        res = state.to_dict()
        res["sync_result"] = {
            "success": True,
            "message": "Studio synchronized successfully",
            "total": total,
            "matched": matched,
            "missing": missing,
            "timestamp": time.time()
        }
        return jsonify(res)

@app.route("/api/delete-all", methods=["POST"])
@app.route("/api/clear", methods=["POST"])
def delete_all():
    """Clear all listings, designs, and artwork cache."""
    state.clear_all(wipe_disk=True)
    state.add_log("SUCCESS", "Workspace and artwork cache cleared. Ready for fresh import.")
    return jsonify(state.to_dict())

@app.route("/api/quick-test", methods=["POST", "GET"])
def quick_test():
    curr_dir = os.path.abspath(os.getcwd())
    test_csv = os.path.join(curr_dir, "magic_listings_export_2026-10-18.csv")
    folder = os.path.join(curr_dir, "uploads", "artwork")
    if os.path.exists(test_csv):
        load_csv_data(test_csv, folder, source="Quick Test", append=True)
        return jsonify(state.to_dict())
    return jsonify({"error": "No test CSV found"}), 404

@app.route("/api/delete-design", methods=["POST"])
def delete_design():
    """Delete a single design by 0-based index."""
    data = request.json or {}
    idx = data.get("index", -1)
    if state.delete_design_at(idx):
        execute_matching()
        state.add_log("SUCCESS", f"Removed design item #{idx + 1}")
        return jsonify(state.to_dict())
    return jsonify({"error": "Invalid design index"}), 400

@app.route("/api/upload-csv", methods=["POST"])
@app.route("/api/import-csv", methods=["POST"])
def upload_csv():
    """Global endpoint to import CSV listings files. Supports append=true or fresh start (default: fresh start)."""
    append_param = request.args.get("append") or request.form.get("append")
    if append_param is not None:
        append_mode = str(append_param).lower() in ("true", "1", "yes")
    elif request.is_json:
        append_mode = bool((request.json or {}).get("append", True))
    else:
        append_mode = True

    if request.is_json:
        paths = (request.json or {}).get("paths", [])
        single_path = (request.json or {}).get("path", "")
        if single_path:
            paths.append(single_path)
        if paths:
            if not append_mode:
                state.clear_all(wipe_disk=False)
            for idx, p in enumerate(paths):
                if os.path.isfile(p):
                    load_csv_data(p, state.folder_path, source="Path Input", append=(append_mode or idx > 0))
            return jsonify(state.to_dict())

    files = request.files.getlist("files") or request.files.getlist("file")
    if not files:
        for k in request.files:
            files.extend(request.files.getlist(k))

    if not files:
        state.add_log("ERROR", "No CSV file selected.")
        return jsonify({"error": "No file uploaded"}), 400

    if not append_mode:
        state.clear_all(wipe_disk=False)

    loaded_any = False
    for idx, f in enumerate(files):
        if f and f.filename:
            save_path = os.path.join(UPLOAD_DIR, f.filename)
            f.save(save_path)
            state.add_log("SUCCESS", f"Received listings CSV: {f.filename}")
            load_csv_data(save_path, state.folder_path, source="CSV Upload", append=(append_mode or idx > 0))
            loaded_any = True

    if not loaded_any:
        return jsonify({"error": "Empty file(s)"}), 400

    return jsonify(state.to_dict())

@app.route("/api/upload-images", methods=["POST"])
def upload_images():
    """Global endpoint to upload multiple artwork image files."""
    files = request.files.getlist("files") or request.files.getlist("file")
    if not files:
        for k in request.files:
            files.extend(request.files.getlist(k))

    if not files:
        state.add_log("ERROR", "No image files selected.")
        return jsonify({"error": "No files uploaded"}), 400

    os.makedirs(ARTWORK_DIR, exist_ok=True)
    state.folder_path = os.path.abspath(ARTWORK_DIR)

    saved_files = []
    for f in files:
        if f and f.filename:
            base_name = os.path.basename(f.filename)
            ext = os.path.splitext(base_name)[1].lower()
            if ext in IMAGE_EXTENSIONS or not ext:
                dest = os.path.join(ARTWORK_DIR, base_name)
                f.save(dest)
                saved_files.append((base_name, os.path.abspath(dest)))

    # Step 1: Match by filename or stem using match_designs_with_folder
    match_designs_with_folder(state.designs, state.folder_path, state.csv_path)

    # Step 2: For any designs still missing artwork, assign remaining saved files sequentially
    # This solves the workflow where magic listing export CSVs have arbitrary filenames that don't match image names
    unmatched_files = [
        path for name, path in saved_files
        if not any(d.file_path == path for d in state.designs)
    ]

    file_ptr = 0
    for d in state.designs:
        if not d.is_matched or not d.file_path or not os.path.isfile(d.file_path):
            if file_ptr < len(unmatched_files):
                d.file_path = unmatched_files[file_ptr]
                d.file_name = os.path.basename(unmatched_files[file_ptr])
                d.is_matched = True
                d.status = "Confirmed"
                file_ptr += 1

    matched = sum(1 for d in state.designs if d.file_path and os.path.isfile(d.file_path))
    missing = len(state.designs) - matched
    state.summary = ValidationSummary(
        total_csv_rows=len(state.designs),
        matched_count=matched,
        missing_count=missing,
        folder_png_count=len(os.listdir(ARTWORK_DIR)),
        folder_path=state.folder_path,
        csv_path=state.csv_path
    )
    state.set_progress(matched, len(state.designs))
    state.add_log("SUCCESS", f"Imported {len(saved_files)} artwork image(s). Matching: {matched} Confirmed ✓ | {missing} Awaiting Image")
    return jsonify(state.to_dict())

@app.route("/api/upload-single-image", methods=["POST"])
def upload_single_image():
    """Upload or attach artwork image(s) directly to a design row or workspace."""
    idx = int(request.form.get("index", -1))
    files = request.files.getlist("files") or request.files.getlist("file")
    if not files:
        for k in request.files:
            files.extend(request.files.getlist(k))

    if not files:
        return jsonify({"error": "No file provided"}), 400

    os.makedirs(ARTWORK_DIR, exist_ok=True)
    if not state.folder_path or not os.path.isdir(state.folder_path):
        state.folder_path = os.path.abspath(ARTWORK_DIR)

    if 0 <= idx < len(state.designs):
        attached_count = 0
        for offset, f in enumerate(files):
            target_idx = idx + offset
            if target_idx >= len(state.designs):
                break
            if not f or not f.filename:
                continue

            orig_filename = os.path.basename(f.filename)
            ext = os.path.splitext(orig_filename)[1]
            if not ext:
                ext = ".png"

            # Use a safe, unique file path on disk to avoid collisions
            safe_basename = secure_filename(orig_filename) or f"artwork_{target_idx + 1}{ext}"
            unique_name = f"row_{target_idx + 1}_{safe_basename}"
            dest = os.path.join(ARTWORK_DIR, unique_name)
            f.save(dest)
            abs_dest = os.path.abspath(dest)

            design = state.designs[target_idx]
            design.file_path = abs_dest
            design.file_name = orig_filename
            design.is_matched = True
            design.status = "Confirmed"
            attached_count += 1

        matched = sum(1 for d in state.designs if d.file_path and os.path.isfile(d.file_path))
        missing = len(state.designs) - matched
        state.summary = ValidationSummary(
            total_csv_rows=len(state.designs),
            matched_count=matched,
            missing_count=missing,
            folder_png_count=len(os.listdir(ARTWORK_DIR)),
            folder_path=state.folder_path,
            csv_path=state.csv_path
        )
        state.set_progress(matched, len(state.designs))
        design = state.designs[idx]
        state.add_log("SUCCESS", f"Attached artwork image to Design #{idx + 1} ({design.file_name}) - Confirmed ✓")
    else:
        saved_count = 0
        for f in files:
            if f and f.filename:
                base_name = os.path.basename(f.filename)
                dest = os.path.join(ARTWORK_DIR, base_name)
                f.save(dest)
                saved_count += 1
        execute_matching()
        state.add_log("SUCCESS", f"Imported {saved_count} artwork images.")

    return jsonify(state.to_dict())

@app.route("/api/apply-color-preset", methods=["POST"])
def apply_color_preset():
    """Apply global Dark Colors / Light Colors / All Colors preset."""
    data = request.json or {}
    preset = data.get("preset", "all").lower()
    idx = data.get("index", -1)
    apply_all = data.get("apply_all", True)

    chosen_colors = DEFAULT_COLORS_PRESET
    if preset == "dark":
        chosen_colors = DARK_COLORS_PRESET
    elif preset == "light":
        chosen_colors = LIGHT_COLORS_PRESET

    indices_to_update = range(len(state.designs)) if apply_all else ([idx] if 0 <= idx < len(state.designs) else [])

    for i in indices_to_update:
        if i not in state.design_settings:
            state.design_settings[i] = {}
        state.design_settings[i]["color_preference"] = preset
        state.design_settings[i]["product_colors"] = dict(chosen_colors)

    state.add_log("SUCCESS", f"Applied '{preset.upper()} COLORS' preset to {'all designs' if apply_all else f'Design #{idx + 1}'}.")
    return jsonify(state.to_dict())

@app.route("/api/update-design-field", methods=["POST"])
def update_design_field():
    data = request.json or {}
    index = data.get("index", -1)
    field = data.get("field", "")
    value = data.get("value", "")

    if index < 0 or index >= len(state.designs):
        return jsonify({"error": "Invalid index"}), 400

    design = state.designs[index]
    if index not in state.design_settings:
        state.design_settings[index] = {}

    if field == "title":
        design.title = value
    elif field == "main_tag":
        design.main_tag = value
    elif field == "supporting_tags":
        design.supporting_tags = value
    elif field == "description":
        design.description = value
    else:
        # Save any field (mature_content, print_placement, scale, album, available_colors, apparel_settings, product_colors, product_toggles, etc.)
        parsed_val = value
        if isinstance(value, str) and (value.startswith("{") or value.startswith("[")):
            try:
                parsed_val = json.loads(value)
            except Exception:
                parsed_val = value
        state.design_settings[index][field] = parsed_val

    return jsonify({"success": True})

@app.route("/api/copy-settings-all", methods=["POST"])
def copy_settings_all():
    data = request.json or {}
    index = data.get("index", -1)
    if index < 0 or index >= len(state.designs):
        return jsonify({"error": "Invalid index"}), 400

    with state.lock:
        src = state.design_settings.get(index, {})

        for i in range(len(state.designs)):
            if i != index:
                if i not in state.design_settings:
                    state.design_settings[i] = {}
                for k, v in src.items():
                    if isinstance(v, dict):
                        state.design_settings[i][k] = dict(v)
                    elif isinstance(v, list):
                        state.design_settings[i][k] = list(v)
                    else:
                        state.design_settings[i][k] = v

    state.add_log("SUCCESS", f"Settings from Design #{index + 1} copied to all {len(state.designs)} designs.")
    res = state.to_dict()
    res["success"] = True
    res["copied_count"] = len(state.designs)
    return jsonify(res)

@app.route("/api/run-automation", methods=["POST"])
def run_automation():
    data = request.json or {}
    color_pref = data.get("color_preference", "all").upper()

    if not state.designs:
        state.add_log("ERROR", "No designs loaded! Import a CSV file first.")
        return jsonify({"error": "No designs"}), 400

    matched = [d for d in state.designs if d.is_matched]
    if not matched:
        state.add_log("ERROR", "No confirmed artwork found! Please add artwork images.")
        return jsonify({"error": "No confirmed files"}), 400

    if state.active_automation and state.active_automation.is_running:
        state.add_log("WARNING", "Automation is already running in background.")
        return jsonify({"error": "Automation already running"}), 400

    state.add_log("INFO", "=== INITIATING TEEPUBLIC AUTOMATION ===")
    state.add_log("INFO", f"Designs: {len(state.designs)} total ({len(matched)} confirmed)")
    state.add_log("INFO", f"Color Preference: {color_pref}")
    state.add_log("INFO", "Target: https://www.teepublic.com/upload-art")

    designs_payload = state.to_dict()["designs"]

    automation_engine = TeePublicAutomation(
        designs=designs_payload,
        color_preference=color_pref,
        log_callback=state.add_log,
        progress_callback=state.set_progress,
        headless=False
    )
    state.active_automation = automation_engine

    thread = threading.Thread(target=automation_engine.run, daemon=True)
    thread.start()

    return jsonify({"success": True, "matched_count": len(matched), "status": "running"})

@app.route("/api/stop-automation", methods=["POST"])
def stop_automation():
    if state.active_automation and state.active_automation.is_running:
        state.active_automation.request_stop()
        state.add_log("WARNING", "Aborting automation run...")
        return jsonify({"success": True, "status": "stopping"})
    return jsonify({"success": True, "status": "not_running"})

@app.route("/api/thumbnail/<int:index>")
def get_thumbnail(index):
    if 0 <= index < len(state.designs):
        item = state.designs[index]
        if item.file_path and os.path.isfile(item.file_path):
            ext = os.path.splitext(item.file_path)[1].lower()
            mime = "image/png"
            if ext in [".jpg", ".jpeg"]:
                mime = "image/jpeg"
            elif ext == ".webp":
                mime = "image/webp"
            elif ext == ".svg":
                mime = "image/svg+xml"
            return send_file(item.file_path, mimetype=mime)
    return ("Not found", 404)

@app.route("/api/logs", methods=["GET"])
def get_logs():
    return jsonify({"logs": state.logs, "progress": state.progress})

@app.route("/api/stream-logs")
def stream_logs():
    q = queue.Queue()
    state.log_subscribers.append(q)

    def event_stream():
        try:
            for l in state.logs[-50:]:
                yield f"data: {json.dumps({'type': 'log', 'data': l})}\n\n"
            yield f"data: {json.dumps({'type': 'progress', 'data': state.progress})}\n\n"

            while True:
                try:
                    msg = q.get(timeout=20)
                    yield f"data: {json.dumps(msg)}\n\n"
                except queue.Empty:
                    yield ": keep-alive\n\n"
        except GeneratorExit:
            if q in state.log_subscribers:
                state.log_subscribers.remove(q)

    return Response(event_stream(), mimetype="text/event-stream")


def create_app():
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    state.add_log("INFO", f"TeePublic Bulk Uploader started cleanly on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=False)
