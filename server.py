"""Flask server backend for TeePublic Bulk Uploader."""
import os
import sys
import json
import time
import queue
import datetime
import threading
from typing import List, Dict, Any, Optional

from flask import Flask, request, jsonify, Response, send_file
from werkzeug.utils import secure_filename

from models import DesignItem, ValidationSummary
from csv_parser import parse_csv_file
from file_matcher import match_designs_with_folder, IMAGE_EXTENSIONS
from automation import TeePublicAutomation, TEEPUBLIC_COLORS

# Define all 12 apparel & primary products + 14 other products
PRODUCTS = [
    "T-Shirt", "Hoodie", "Tank", "Crewneck", "Long Sleeve T-Shirt",
    "Baseball Tee", "Kids", "Kids Hoodie", "Kids Long Sleeve T-Shirt",
    "Hats", "Shorts", "Bags", "Socks", "Stickers", "Cases", "Mugs",
    "Wall Art", "Pillows", "Totes", "Tapestries", "Pins", "Magnets"
]

DARK_COLORS_PRESET = {
    "T-Shirt": "Black", "Hoodie": "Navy", "Tank": "Black", "Crewneck": "Black",
    "Long Sleeve T-Shirt": "Navy", "Baseball Tee": "Black", "Kids": "Black",
    "Kids Hoodie": "Navy", "Kids Long Sleeve T-Shirt": "Black",
    "Hats": "Black", "Shorts": "Black", "Bags": "Black"
}

LIGHT_COLORS_PRESET = {
    "T-Shirt": "White", "Hoodie": "Natural Heather", "Tank": "White", "Crewneck": "White",
    "Long Sleeve T-Shirt": "White", "Baseball Tee": "White", "Kids": "White",
    "Kids Hoodie": "Natural Heather", "Kids Long Sleeve T-Shirt": "White",
    "Hats": "Creme", "Shorts": "White", "Bags": "Natural Heather"
}

DEFAULT_COLORS_PRESET = {p: "Black" for p in PRODUCTS}

app = Flask(
    __name__,
    static_folder="ui",
    template_folder="ui",
    static_url_path=""
)
app.config["JSON_AS_ASCII"] = False

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


def clean_csv_directory():
    """Remove any previously uploaded CSV files from UPLOAD_DIR."""
    if os.path.exists(UPLOAD_DIR):
        for entry in os.listdir(UPLOAD_DIR):
            full_path = os.path.join(UPLOAD_DIR, entry)
            if os.path.isfile(full_path) and entry.lower().endswith(".csv"):
                try:
                    os.remove(full_path)
                except Exception:
                    pass


class AppState:
    def __init__(self):
        self.csv_paths: List[str] = []
        self.folder_path: str = ""
        self.designs: List[DesignItem] = []
        self.summary: Optional[ValidationSummary] = None
        self.design_settings: Dict[int, Dict[str, Any]] = {}
        self.logs: List[Dict[str, str]] = []
        self.log_subscribers: List[queue.Queue] = []
        self.progress: Dict[str, Any] = {
            "current": 0,
            "total": 0,
            "stage": "idle",
            "step": 0,
            "pct": 0,
            "message": "Ready"
        }
        self.autopilot_enabled: bool = True
        self.autopilot_running: bool = False
        self.batch_completed: bool = False
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
            if len(self.logs) > 500:
                self.logs = self.logs[-500:]

            dead_subs = []
            for q in self.log_subscribers:
                try:
                    q.put_nowait({"type": "log", "data": entry})
                except Exception:
                    dead_subs.append(q)
            for d in dead_subs:
                if d in self.log_subscribers:
                    self.log_subscribers.remove(d)

    def set_progress(
        self,
        current: int,
        total: int,
        stage: str = "running",
        step: int = 0,
        pct: Optional[int] = None,
        message: str = ""
    ):
        with self.lock:
            if pct is None:
                pct = int(round((current / total) * 100)) if total > 0 else 0
            self.progress = {
                "current": current,
                "total": total,
                "stage": stage,
                "step": step,
                "pct": max(0, min(100, pct)),
                "message": message or f"{current} / {total} designs processed"
            }
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
            self.autopilot_running = False
            self.batch_completed = False
            self.set_progress(0, 0, stage="idle", step=0, pct=0, message="Ready")
            self.folder_path = ""
        if wipe_disk:
            clean_uploads_directory()

    def delete_design_at(self, idx: int) -> bool:
        with self.lock:
            if 0 <= idx < len(self.designs):
                self.designs.pop(idx)
                for new_idx, item in enumerate(self.designs):
                    item.index = new_idx + 1
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
            matched = sum(
                1 for d in self.designs
                if (d.is_matched and d.file_path and os.path.isfile(d.file_path))
            )
            published = sum(1 for d in self.designs if getattr(d, "is_published", False))
            missing = total - matched

            designs_data = []
            default_toggles = {p: True for p in PRODUCTS}

            for i, item in enumerate(self.designs):
                settings = self.design_settings.get(i, {})
                has_thumb = bool(item.file_path and os.path.isfile(item.file_path))
                is_ready = bool(item.is_matched and has_thumb)
                is_pub = bool(getattr(item, "is_published", False))

                status_str = "Published" if is_pub else (
                    "Confirmed" if is_ready else (
                        "Warning" if getattr(item, "validation_warning", None) else "Missing"
                    )
                )

                designs_data.append({
                    "index": i + 1,
                    "zero_index": i,
                    "id": i,
                    "tracker_id": f"#{i + 1:02d}",
                    "file_name": item.file_name,
                    "original_filename": getattr(item, "original_filename", item.file_name) or item.file_name,
                    "title": item.title,
                    "main_tag": item.main_tag,
                    "supporting_tags": item.supporting_tags,
                    "description": item.description,
                    "file_path": item.file_path or "",
                    "is_matched": is_ready,
                    "is_published": is_pub,
                    "status": status_str,
                    "validation_warning": getattr(item, "validation_warning", None),
                    "has_thumbnail": has_thumb,
                    "default_color": (
                        settings.get("product_colors", {}).get("T-Shirt")
                        or settings.get("apparel_settings", {}).get("T-Shirt", {}).get("defaultColor")
                        or "Black"
                    ),
                    "color_preference": settings.get("color_preference", "all"),
                    "product_colors": settings.get("product_colors", dict(DEFAULT_COLORS_PRESET)),
                    "product_toggles": settings.get("product_toggles", dict(default_toggles)),
                    "mature_content": settings.get("mature_content", "no"),
                    "print_placement": settings.get("print_placement", "front"),
                    "scale": settings.get("scale", 100),
                    "album": settings.get("album", ""),
                    "apparel_settings": settings.get("apparel_settings", {}),
                    "available_colors": settings.get("available_colors", []),
                })

            if self.csv_paths:
                names = [os.path.basename(p) for p in self.csv_paths]
                csv_filename = names[0] if len(names) == 1 else f"{len(names)} CSVs ({', '.join(names[-2:])})"
            else:
                csv_filename = "No CSV loaded"

            return {
                "designs": designs_data,
                "summary": {
                    "total": total,
                    "matched": matched,
                    "missing": missing,
                    "published": published,
                    "csv_path": self.csv_path,
                    "csv_filename": csv_filename,
                    "folder_path": self.folder_path,
                },
                "progress": self.progress,
                "autopilot_enabled": self.autopilot_enabled,
                "autopilot_running": self.autopilot_running,
                "batch_completed": self.batch_completed,
                "is_running_automation": bool(
                    self.autopilot_running or (self.active_automation and self.active_automation.is_running)
                ),
                "logs": self.logs[-100:]
            }


state = AppState()


def execute_matching():
    with state.lock:
        if not state.designs:
            return

        os.makedirs(ARTWORK_DIR, exist_ok=True)
        if not state.folder_path or not os.path.isdir(state.folder_path):
            state.folder_path = os.path.abspath(ARTWORK_DIR)

        summary = match_designs_with_folder(state.designs, state.folder_path, state.csv_path)
        state.summary = summary
        state.batch_completed = False
        # Do not falsely set automation progress to 100% before upload runs; keep current=0 until autopilot starts
        if not state.autopilot_running:
            state.set_progress(
                0,
                summary.matched_count,
                stage="ready",
                step=0,
                pct=0,
                message=f"Ready: {summary.matched_count} matched / {summary.total_csv_rows} total"
            )
        state.add_log("INFO", f"Matching: {summary.matched_count} Confirmed ✓ | {summary.missing_count} Awaiting Image")


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
                state.batch_completed = False
                start_index = 0
            else:
                if abs_csv not in state.csv_paths:
                    state.csv_paths.append(abs_csv)
                start_index = len(state.designs)

            for idx, item in enumerate(items):
                item.index = start_index + idx + 1
                state.designs.append(item)

            state.add_log("SUCCESS", f"Loaded {len(items)} listing(s) from {csv_name}. Total: {len(state.designs)}.")

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
                state.set_progress(0, len(state.designs), stage="awaiting_images", pct=0)

    except Exception as e:
        state.add_log("ERROR", f"Failed to parse CSV {csv_name}: {str(e)}")


# ================= CORS & PREFLIGHT =================

def is_allowed_origin(origin: Optional[str]) -> bool:
    if not origin:
        return True
    origin_lower = origin.lower()
    return any(
        origin_lower.startswith(prefix)
        for prefix in ("http://127.0.0.1", "http://localhost", "chrome-extension://", "moz-extension://", "https://www.teepublic.com")
    )


@app.before_request
def handle_options_preflight():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        origin = request.headers.get("Origin")
        if is_allowed_origin(origin) and origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, X-API-Key"
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if is_allowed_origin(origin) and origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, X-API-Key"
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


# ================= FLASK ROUTES =================

@app.route("/")
def index():
    return send_file(os.path.join("ui", "index.html"))


@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(state.to_dict())


@app.route("/api/autopilot/progress", methods=["POST"])
def update_autopilot_progress():
    """Live progress reporting from the Chrome Extension so Studio & Extension stay in sync."""
    data = request.json or {}
    current = int(data.get("current", 0))
    total = int(data.get("total", 0))
    step = int(data.get("step", 0))
    pct = data.get("pct")
    stage = str(data.get("stage", "running"))
    message = str(data.get("message", ""))
    running = data.get("running")

    with state.lock:
        if running is not None:
            state.autopilot_running = bool(running)
        if stage == "completed":
            state.autopilot_running = False
            state.batch_completed = True
            for d in state.designs:
                if d.is_matched:
                    d.is_published = True
                    d.status = "Published"
        elif stage in ("stopped", "paused", "aborted"):
            state.autopilot_running = False

        state.set_progress(current, total, stage=stage, step=step, pct=pct, message=message)
        if message:
            lvl = "SUCCESS" if stage == "completed" else ("WARNING" if stage in ("stopped", "paused") else "INFO")
            state.add_log(lvl, f"[Autopilot] {message}")

    return jsonify({"success": True, "progress": state.progress, "autopilot_running": state.autopilot_running})


@app.route("/api/autopilot/toggle", methods=["POST"])
def toggle_autopilot_master():
    """Master kill-switch from either Extension or Studio."""
    data = request.json or {}
    enabled = bool(data.get("enabled", False))
    with state.lock:
        state.autopilot_enabled = enabled
        if not enabled:
            state.autopilot_running = False
            if state.active_automation and state.active_automation.is_running:
                state.active_automation.request_stop()
            state.set_progress(
                state.progress.get("current", 0),
                state.progress.get("total", 0),
                stage="stopped",
                message="Autopilot deactivated by user"
            )
            state.add_log("WARNING", "Autopilot kill-switch engaged (OFF). All automation halted.")
        else:
            state.add_log("INFO", "Autopilot enabled (ON).")
    return jsonify({"success": True, "autopilot_enabled": state.autopilot_enabled, "autopilot_running": state.autopilot_running})


@app.route("/api/autopilot/reset-batch", methods=["POST"])
def reset_autopilot_batch():
    """Reset published flags so the user can intentionally re-run a batch if desired."""
    with state.lock:
        state.batch_completed = False
        state.autopilot_running = False
        for d in state.designs:
            d.is_published = False
            if d.is_matched:
                d.status = "Confirmed"
        matched = sum(1 for d in state.designs if d.is_matched)
        state.set_progress(0, matched, stage="ready", step=0, pct=0, message="Batch reset and ready")
        state.add_log("INFO", "Batch completion state reset. Ready for a new Autopilot run.")
    return jsonify(state.to_dict())


@app.route("/api/sync", methods=["POST", "GET"])
def sync_studio():
    with state.lock:
        os.makedirs(ARTWORK_DIR, exist_ok=True)
        if not state.folder_path or not os.path.isdir(state.folder_path):
            state.folder_path = os.path.abspath(ARTWORK_DIR)

        for d in state.designs:
            if d.file_path and os.path.exists(d.file_path):
                d.is_matched = True
                d.has_thumbnail = True
            else:
                d.file_path = None
                d.is_matched = False
                d.has_thumbnail = False

        if state.designs:
            execute_matching()

        total = len(state.designs)
        matched = sum(1 for d in state.designs if d.is_matched)
        missing = total - matched

        state.add_log("SUCCESS", f"Studio Synchronized: {matched}/{total} confirmed, {missing} awaiting image.")
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
    state.clear_all(wipe_disk=True)
    state.add_log("SUCCESS", "Workspace and artwork cache cleared.")
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
    append_param = request.args.get("append") or request.form.get("append")
    if append_param is not None:
        append_mode = str(append_param).lower() in ("true", "1", "yes")
    elif request.is_json:
        append_mode = bool((request.json or {}).get("append", False))
    else:
        append_mode = False

    files = request.files.getlist("files") or request.files.getlist("file")
    if not files:
        for k in request.files:
            files.extend(request.files.getlist(k))

    if not files:
        return jsonify({"error": "No file uploaded"}), 400

    if not append_mode:
        state.clear_all(wipe_disk=False)
        clean_csv_directory()

    loaded_any = False
    upload_dir_abs = os.path.abspath(UPLOAD_DIR)
    for idx, f in enumerate(files):
        if f and f.filename:
            safe_name = secure_filename(os.path.basename(f.filename))
            if not safe_name.lower().endswith(".csv"):
                continue
            save_path = os.path.abspath(os.path.join(UPLOAD_DIR, safe_name))
            if not save_path.startswith(upload_dir_abs + os.sep) and save_path != upload_dir_abs:
                continue
            f.save(save_path)
            load_csv_data(save_path, state.folder_path, source="CSV Upload", append=(append_mode or idx > 0))
            loaded_any = True

    if not loaded_any:
        return jsonify({"error": "Empty or invalid CSV file(s)"}), 400

    return jsonify(state.to_dict())


@app.route("/api/upload-images", methods=["POST"])
def upload_images():
    files = request.files.getlist("files") or request.files.getlist("file")
    if not files:
        for k in request.files:
            files.extend(request.files.getlist(k))

    if not files:
        return jsonify({"error": "No files uploaded"}), 400

    os.makedirs(ARTWORK_DIR, exist_ok=True)
    state.folder_path = os.path.abspath(ARTWORK_DIR)

    saved_files = []
    for f in files:
        if f and f.filename:
            raw_base = os.path.basename(f.filename)
            safe_base = secure_filename(raw_base) or f"artwork_{int(time.time()*1000)}.png"
            ext = os.path.splitext(safe_base)[1].lower()
            if ext in IMAGE_EXTENSIONS:
                dest = os.path.join(ARTWORK_DIR, safe_base)
                f.save(dest)
                saved_files.append((raw_base, os.path.abspath(dest)))

    with state.lock:
        match_designs_with_folder(state.designs, state.folder_path, state.csv_path)
        sequential = str(request.form.get("sequential") or request.args.get("sequential", "")).lower() in ("true", "1", "yes")
        if sequential:
            unmatched_files = [
                path for _, path in saved_files
                if not any(d.file_path == path for d in state.designs)
            ]
            file_ptr = 0
            for d in state.designs:
                if not d.is_matched or not d.file_path or not os.path.isfile(d.file_path):
                    if file_ptr < len(unmatched_files):
                        d.file_path = unmatched_files[file_ptr]
                        d.file_name = os.path.basename(unmatched_files[file_ptr])
                        d.is_matched = True
                        d.has_thumbnail = True
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
        state.batch_completed = False
        state.set_progress(0, matched, stage="ready", pct=0, message=f"{matched} designs ready for upload")
        state.add_log("SUCCESS", f"Imported {len(saved_files)} image(s). {matched} Confirmed ✓ | {missing} Awaiting Image")
        return jsonify(state.to_dict())


@app.route("/api/upload-single-image", methods=["POST"])
def upload_single_image():
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

    with state.lock:
        if 0 <= idx < len(state.designs):
            for offset, f in enumerate(files):
                target_idx = idx + offset
                if target_idx >= len(state.designs) or not f or not f.filename:
                    break
                orig_filename = os.path.basename(f.filename)
                ext = os.path.splitext(orig_filename)[1].lower() or ".png"
                if ext not in IMAGE_EXTENSIONS:
                    continue
                safe_basename = secure_filename(orig_filename) or f"artwork_{target_idx + 1}{ext}"
                unique_name = f"row_{target_idx + 1}_{int(time.time()*1000)}_{safe_basename}"
                dest = os.path.join(ARTWORK_DIR, unique_name)
                f.save(dest)

                design = state.designs[target_idx]
                design.file_path = os.path.abspath(dest)
                design.file_name = orig_filename
                design.is_matched = True
                design.is_published = False
                design.has_thumbnail = True
                design.status = "Confirmed"

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
            state.batch_completed = False
            state.set_progress(0, matched, stage="ready", pct=0)
            state.add_log("SUCCESS", f"Attached artwork to Design #{idx + 1} - Confirmed ✓")
        else:
            for f in files:
                if f and f.filename:
                    base_name = secure_filename(os.path.basename(f.filename))
                    ext = os.path.splitext(base_name)[1].lower()
                    if ext in IMAGE_EXTENSIONS:
                        f.save(os.path.join(ARTWORK_DIR, base_name))
            execute_matching()

        return jsonify(state.to_dict())


@app.route("/api/apply-color-preset", methods=["POST"])
def apply_color_preset():
    data = request.json or {}
    preset = data.get("preset", "all").lower()
    idx = data.get("index", -1)
    apply_all = data.get("apply_all", True)

    chosen_colors = DARK_COLORS_PRESET if preset == "dark" else (
        LIGHT_COLORS_PRESET if preset == "light" else DEFAULT_COLORS_PRESET
    )

    with state.lock:
        indices = range(len(state.designs)) if apply_all else ([idx] if 0 <= idx < len(state.designs) else [])
        for i in indices:
            if i not in state.design_settings:
                state.design_settings[i] = {}
            state.design_settings[i]["color_preference"] = preset
            state.design_settings[i]["product_colors"] = dict(chosen_colors)

        state.add_log("SUCCESS", f"Applied '{preset.upper()}' preset to {'all designs' if apply_all else f'Design #{idx + 1}'}.")
        return jsonify(state.to_dict())


@app.route("/api/update-design-field", methods=["POST"])
def update_design_field():
    data = request.json or {}
    index = data.get("index", -1)
    field = data.get("field", "")
    value = data.get("value", "")

    with state.lock:
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
                state.design_settings[i] = json.loads(json.dumps(src))

        state.add_log("SUCCESS", f"Settings from Design #{index + 1} copied to all {len(state.designs)} designs.")
        res = state.to_dict()
        res["success"] = True
        res["copied_count"] = len(state.designs)
        return jsonify(res)


@app.route("/api/run-automation", methods=["POST"])
def run_automation():
    data = request.json or {}
    color_pref = data.get("color_preference", "all").lower()

    with state.lock:
        if not state.designs:
            return jsonify({"error": "No designs loaded"}), 400
        matched = [d for d in state.designs if d.is_matched]
        if not matched:
            return jsonify({"error": "No confirmed artwork files"}), 400
        if state.active_automation and state.active_automation.is_running:
            return jsonify({"error": "Automation already running"}), 400

        state.batch_completed = False
        state.autopilot_enabled = True
        state.autopilot_running = True
        state.set_progress(0, len(matched), stage="starting", step=1, pct=2, message=f"Starting batch of {len(matched)} designs...")

        designs_payload = state.to_dict()["designs"]
        automation_engine = TeePublicAutomation(
            designs=designs_payload,
            color_preference=color_pref,
            log_callback=state.add_log,
            progress_callback=lambda cur, tot: state.set_progress(
                cur, tot, stage="running", step=4, message=f"Configuring design {cur} of {tot}"
            ),
            headless=False
        )
        state.active_automation = automation_engine

        def run_worker():
            try:
                ok = automation_engine.run()
                with state.lock:
                    state.autopilot_running = False
                    if ok:
                        state.batch_completed = True
                        for d in state.designs:
                            if d.is_matched:
                                d.is_published = True
                                d.status = "Published"
                        state.set_progress(len(matched), len(matched), stage="completed", step=6, pct=100, message="All designs published!")
            finally:
                with state.lock:
                    state.active_automation = None
                    state.autopilot_running = False

        threading.Thread(target=run_worker, daemon=True).start()
        return jsonify({"success": True, "matched_count": len(matched), "status": "running"})


@app.route("/api/stop-automation", methods=["POST"])
def stop_automation():
    with state.lock:
        state.autopilot_running = False
        if state.active_automation and state.active_automation.is_running:
            state.active_automation.request_stop()
            state.add_log("WARNING", "Aborting automation run...")
            return jsonify({"success": True, "status": "stopping"})
        return jsonify({"success": True, "status": "not_running"})


@app.route("/api/thumbnail/<int:index>")
def get_thumbnail(index):
    with state.lock:
        total = len(state.designs)
        if total == 0:
            return ("Not found", 404)

        base = request.args.get("base")
        target_idx = None
        if base == "1":
            if 1 <= index <= total:
                target_idx = index - 1
        elif base == "0":
            if 0 <= index < total:
                target_idx = index
        else:
            if 0 <= index < total:
                target_idx = index
            elif index == total and total > 0:
                target_idx = index - 1

        if target_idx is not None and 0 <= target_idx < total:
            item = state.designs[target_idx]
            if item.file_path and os.path.isfile(item.file_path):
                ext = os.path.splitext(item.file_path)[1].lower()
                mime = "image/jpeg" if ext in (".jpg", ".jpeg") else ("image/webp" if ext == ".webp" else "image/png")
                resp = send_file(item.file_path, mimetype=mime)
                resp.headers["X-Content-Type-Options"] = "nosniff"
                resp.headers["Content-Security-Policy"] = "sandbox; default-src 'none'"
                resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                return resp

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