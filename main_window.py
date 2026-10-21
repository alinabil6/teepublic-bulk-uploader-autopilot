import os
import sys

# Configure Chromium engine flags
os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--no-sandbox --disable-gpu")

from PyQt6.QtWidgets import QMainWindow
from PyQt6.QtCore import QUrl, Qt
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings
from PyQt6.QtWebChannel import QWebChannel

from bridge import WebBridge


class TeePublicUploaderWindow(QMainWindow):
    """Main window displaying the MerchGhost-style Web UI via QWebEngineView."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("TeePublic Bulk Uploader")
        self.resize(1200, 840)
        self.setMinimumSize(980, 680)

        # Set dark window background matching theme
        self.setStyleSheet("QMainWindow { background-color: #0f1117; }")

        # Create QWebEngineView as central widget
        self.web_view = QWebEngineView(self)
        self.setCentralWidget(self.web_view)

        # Configure WebEngine Settings for local file & JS bridge access
        settings = self.web_view.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, True)

        # Initialize QWebChannel and Python Bridge
        self.bridge = WebBridge(self)
        self.channel = QWebChannel(self.web_view.page())
        self.channel.registerObject("bridge", self.bridge)
        self.web_view.page().setWebChannel(self.channel)

        # Load local UI HTML
        ui_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "ui"))
        index_file = os.path.join(ui_dir, "index.html")

        if not os.path.exists(index_file):
            raise FileNotFoundError(f"UI file not found: {index_file}")

        self.web_view.load(QUrl.fromLocalFile(index_file))

    def load_initial_csv(self, csv_path: str, folder_path: str = ""):
        """Helper to preload CSV from CLI arguments."""
        if os.path.exists(csv_path):
            self.bridge.csv_path = os.path.abspath(csv_path)
            if folder_path and os.path.isdir(folder_path):
                self.bridge.folder_path = os.path.abspath(folder_path)
            self.bridge._load_csv_internal(
                self.bridge.csv_path,
                self.bridge.folder_path or os.getcwd(),
                source="CLI Arguments"
            )
