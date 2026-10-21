"""Bridge between PyQt6 Python backend and HTML/JS frontend via QWebChannel."""
import os
import json
import base64
from typing import List, Dict, Any, Optional

from PyQt6.QtCore import QObject, pyqtSlot, pyqtSignal
from PyQt6.QtWidgets import QFileDialog

from models import DesignItem, ValidationSummary, ColorPreference
from csv_parser import parse_csv_file
from file_matcher import match_designs_with_folder

# Default list of 12 products
PRODUCTS = [
    "T-Shirt", "Hoodie", "Tank", "Crewneck", "Long Sleeve",
    "Baseball Tee", "Kids", "Kids Hoodie", "Kids Long Sleeve T-Shirt",
    "Hats", "Shorts", "Bags"
]


def image_to_base64_data_uri(file_path: Optional[str]) -> str:
    """Reads a local PNG image and converts it to a base64 data URI for instant web display."""
    if not file_path or not os.path.isfile(file_path):
        return ""
    try:
        with open(file_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
            return f"data:image/png;base64,{encoded}"
    except Exception:
        return ""


class WebBridge(QObject):
    """QObject exposed to JavaScript through QWebChannel."""

    # Signals emitted to JavaScript
    designsLoaded = pyqtSignal(str)       # JSON payload with designs list & summary
    matchingComplete = pyqtSignal(str)    # JSON payload with updated match status & summary
    logMessage = pyqtSignal(str, str)     # level ('INFO', 'SUCCESS', 'WARNING', 'ERROR'), message
    progressUpdate = pyqtSignal(int, int) # current, total

    def __init__(self, parent=None):
        super().__init__(parent)
        self.parent_window = parent
        self.csv_path: str = ""
        self.folder_path: str = ""
        self.designs: List[DesignItem] = []
        self.summary: Optional[ValidationSummary] = None
        self.log_buffer: List[Dict[str, str]] = []

        # Internal design-specific settings storage (index -> { 'color_pref', 'colors', 'toggles' })
        self.design_settings: Dict[int, Dict[str, Any]] = {}

    def log(self, level: str, message: str):
        """Internal logger that appends to buffer and emits signal to JS terminal."""
        entry = {"level": level.upper(), "message": message}
        self.log_buffer.append(entry)
        self.logMessage.emit(level.upper(), message)

    def _get_design_dict(self, index: int, item: DesignItem) -> Dict[str, Any]:
        """Converts DesignItem into a complete JSON-serializable dictionary."""
        settings = self.design_settings.get(index, {})

        # Default all product toggles to True if not set
        default_toggles = {p: True for p in PRODUCTS}
        default_colors = {p: "Black" for p in PRODUCTS}

        thumb_data = image_to_base64_data_uri(item.file_path)

        return {
            "index": index + 1,  # 1-based index
            "file_name": item.file_name,
            "title": item.title,
            "main_tag": item.main_tag,
            "supporting_tags": item.supporting_tags,
            "description": item.description,
            "file_path": item.file_path or "",
            "is_matched": item.is_matched,
            "status": item.status,
            "thumbnail_url": thumb_data,
            "color_preference": settings.get("color_preference", "all"),
            "product_colors": settings.get("product_colors", default_colors),
            "product_toggles": settings.get("product_toggles", default_toggles),
        }

    def _build_payload(self) -> str:
        """Serializes current designs and summary to JSON string."""
        designs_data = [self._get_design_dict(i, item) for i, item in enumerate(self.designs)]
        total = len(self.designs)
        matched = sum(1 for d in self.designs if d.is_matched)
        missing = total - matched

        summary_data = {
            "total": total,
            "matched": matched,
            "missing": missing,
            "csv_path": self.csv_path,
            "folder_path": self.folder_path,
        }

        return json.dumps({
            "designs": designs_data,
            "summary": summary_data
        })

    # ================= Methods Callable from JS =================

    @pyqtSlot()
    def initFrontend(self):
        """Called automatically when JS frontend loads."""
        self.log("INFO", "TeePublic Bulk Uploader initialized.")
        # If designs were pre-loaded, send them to the freshly initialized JS frontend
        if self.designs:
            payload = self._build_payload()
            self.designsLoaded.emit(payload)
            matched = sum(1 for d in self.designs if d.is_matched)
            self.progressUpdate.emit(matched, len(self.designs))
            return

        # Auto-detect default test files if available
        curr_dir = os.path.abspath(os.getcwd())
        test_csv = os.path.join(curr_dir, "test_sample_listings.csv")
        if os.path.exists(test_csv):
            self.csv_path = test_csv
            self.folder_path = curr_dir
            self._load_csv_internal(test_csv, curr_dir, source="Auto-Detected Test Files")

    @pyqtSlot()
    def quickTest(self):
        """Quick 1-click test using local project test CSV and current PNG folder."""
        curr_dir = os.path.abspath(os.getcwd())
        test_csv = os.path.join(curr_dir, "test_sample_listings.csv")
        if not os.path.exists(test_csv):
            test_csv = os.path.join(curr_dir, "magic_listings_export_2026-10-18.csv")

        if os.path.exists(test_csv):
            self.csv_path = test_csv
            self.folder_path = curr_dir
            self._load_csv_internal(test_csv, curr_dir, source="Quick Test")
        else:
            self.log("ERROR", "No sample CSV found in workspace.")

    @pyqtSlot()
    def importCSV(self):
        """Opens native file dialog for user to select listings CSV."""
        file_path, _ = QFileDialog.getOpenFileName(
            self.parent_window,
            "Import Listings CSV File",
            os.getcwd(),
            "CSV Files (*.csv);;All Files (*)"
        )
        if file_path:
            self.csv_path = os.path.abspath(file_path)
            folder = self.folder_path or os.path.dirname(self.csv_path) or os.getcwd()
            self._load_csv_internal(self.csv_path, folder, source=f"Imported CSV ({os.path.basename(file_path)})")

    @pyqtSlot()
    def importFolder(self):
        """Opens native directory dialog for user to select PNG artwork folder."""
        folder = QFileDialog.getExistingDirectory(
            self.parent_window,
            "Select Artwork Images Folder",
            self.folder_path or os.getcwd()
        )
        if folder:
            self.folder_path = os.path.abspath(folder)
            self.log("INFO", f"Artwork folder selected: {self.folder_path}")
            if self.designs:
                self._run_matching_internal()
            else:
                self.log("INFO", "CSV not loaded yet. Click 'Import CSV' to match against folder.")

    def _load_csv_internal(self, csv_file: str, folder: str, source: str = ""):
        """Parses CSV and runs folder matching."""
        self.log("INFO", f"Parsing listings from CSV: {os.path.basename(csv_file)} [{source}]")
        try:
            items, warnings = parse_csv_file(csv_file)
            self.designs = items
            for w in warnings:
                self.log("WARNING", w)

            self.log("SUCCESS", f"CSV parsed: {len(items)} listing(s) loaded.")

            if folder and os.path.isdir(folder):
                self.folder_path = folder
                self._run_matching_internal()
            else:
                payload = self._build_payload()
                self.designsLoaded.emit(payload)

        except Exception as e:
            self.log("ERROR", f"Failed to parse CSV: {str(e)}")

    def _run_matching_internal(self):
        """Runs case-insensitive file matching against folder."""
        folder = self.folder_path or os.getcwd()
        self.summary = match_designs_with_folder(self.designs, folder, self.csv_path)

        total = len(self.designs)
        matched = self.summary.matched_count
        missing = self.summary.missing_count
        folder_pngs = self.summary.folder_png_count

        self.log("INFO", f"Matching: {matched} Matched ✓ | {missing} Missing ✗ | {folder_pngs} PNGs in folder")
        if matched > 0:
            self.log("SUCCESS", f"{matched} design(s) matched and ready!")
        if missing > 0:
            self.log("WARNING", f"{missing} design(s) missing from folder: '{os.path.basename(folder)}'")

        payload = self._build_payload()
        self.matchingComplete.emit(payload)
        self.designsLoaded.emit(payload)
        self.progressUpdate.emit(matched, total)

    @pyqtSlot(int, str, str)
    def updateDesignField(self, index: int, field: str, value: str):
        """Updates a design field or setting in memory when edited by the user."""
        if index < 0 or index >= len(self.designs):
            return

        design = self.designs[index]
        if index not in self.design_settings:
            self.design_settings[index] = {}

        if field == "title":
            design.title = value
        elif field == "main_tag":
            design.main_tag = value
        elif field == "supporting_tags":
            design.supporting_tags = value
        elif field == "description":
            design.description = value
        elif field == "color_preference":
            self.design_settings[index]["color_preference"] = value
        elif field == "product_colors":
            try:
                self.design_settings[index]["product_colors"] = json.loads(value)
            except Exception:
                pass
        elif field == "product_toggles":
            try:
                self.design_settings[index]["product_toggles"] = json.loads(value)
            except Exception:
                pass

    @pyqtSlot(int)
    def copySettingsToAll(self, index: int):
        """Copies Colors and Products settings from design[index] to all other designs."""
        if index < 0 or index >= len(self.designs):
            return

        src_settings = self.design_settings.get(index, {})
        src_pref = src_settings.get("color_preference", "all")
        src_colors = src_settings.get("product_colors", {p: "Black" for p in PRODUCTS})
        src_toggles = src_settings.get("product_toggles", {p: True for p in PRODUCTS})

        for i in range(len(self.designs)):
            if i != index:
                if i not in self.design_settings:
                    self.design_settings[i] = {}
                self.design_settings[i]["color_preference"] = src_pref
                self.design_settings[i]["product_colors"] = dict(src_colors)
                self.design_settings[i]["product_toggles"] = dict(src_toggles)

        self.log("SUCCESS", f"Settings from Design #{index + 1} copied to all {len(self.designs)} designs.")

    @pyqtSlot(str)
    def runAutomation(self, color_preference: str):
        """Starts automation run or reports readiness for Playwright."""
        if not self.designs:
            self.log("ERROR", "No designs loaded! Import a CSV file first.")
            return

        matched_designs = [d for d in self.designs if d.is_matched]
        if not matched_designs:
            self.log("ERROR", "No matched PNG artwork found in folder! Please check filenames.")
            return

        self.log("INFO", f"=== STARTING AUTOMATION RUN ===")
        self.log("INFO", f"Total Designs: {len(self.designs)} ({len(matched_designs)} Matched)")
        self.log("INFO", f"Color Preference: {color_preference.upper()}")
        self.log("INFO", f"Target: https://www.teepublic.com/upload-art")
        self.log("SUCCESS", f"Ready for Playwright batch engine! {len(matched_designs)} artwork PNG(s) queued.")

    @pyqtSlot(result=str)
    def getLogs(self) -> str:
        """Returns JSON string of the log buffer."""
        return json.dumps(self.log_buffer)
