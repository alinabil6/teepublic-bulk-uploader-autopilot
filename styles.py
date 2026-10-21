"""Modern dark studio design system for TeePublic Bulk Uploader."""
from PyQt6.QtWidgets import QStyledItemDelegate, QStyleOptionViewItem, QStyle
from PyQt6.QtCore import Qt, QRectF
from PyQt6.QtGui import QPainter, QColor, QFont, QPen, QBrush

# Color Palette (Dark Studio - Zinc / Slate / Indigo)
BG_MAIN = "#0B0F19"
BG_CARD = "#131B2E"
BG_CARD_ALT = "#182238"
BG_HEADER = "#1E2A45"
BORDER_COLOR = "#233352"
BORDER_FOCUS = "#3B82F6"

TEXT_PRIMARY = "#F8FAFC"
TEXT_SECONDARY = "#94A3B8"
TEXT_MUTED = "#64748B"

COLOR_MATCHED_BG = "#064E3B"
COLOR_MATCHED_BORDER = "#059669"
COLOR_MATCHED_TEXT = "#34D399"

COLOR_MISSING_BG = "#4C0519"
COLOR_MISSING_BORDER = "#9F1239"
COLOR_MISSING_TEXT = "#FB7185"

COLOR_ACCENT = "#3B82F6"
COLOR_ACCENT_HOVER = "#2563EB"
COLOR_ACCENT_ACTIVE = "#1D4ED8"

COLOR_RUN_BTN = "#10B981"
COLOR_RUN_BTN_HOVER = "#059669"
COLOR_RUN_BTN_DISABLED = "#1E293B"

APP_STYLESHEET = f"""
/* Global Reset and Base */
QWidget {{
    background-color: {BG_MAIN};
    color: {TEXT_PRIMARY};
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif;
    font-size: 13px;
}}

/* Main Window */
QMainWindow {{
    background-color: {BG_MAIN};
}}

/* Cards & Containers */
QFrame#cardFrame {{
    background-color: {BG_CARD};
    border: 1px solid {BORDER_COLOR};
    border-radius: 10px;
    padding: 12px;
}}

QFrame#statCard {{
    background-color: {BG_CARD};
    border: 1px solid {BORDER_COLOR};
    border-radius: 8px;
    padding: 10px 14px;
}}

/* Typography */
QLabel#headerTitle {{
    font-size: 20px;
    font-weight: 700;
    color: {TEXT_PRIMARY};
    letter-spacing: 0.3px;
}}

QLabel#headerSubtitle {{
    font-size: 12px;
    color: {TEXT_SECONDARY};
}}

QLabel#sectionTitle {{
    font-size: 13px;
    font-weight: 600;
    color: #CBD5E1;
    text-transform: uppercase;
    letter-spacing: 0.8px;
}}

QLabel#statValue {{
    font-size: 22px;
    font-weight: 700;
    color: {TEXT_PRIMARY};
}}

QLabel#statLabel {{
    font-size: 11px;
    font-weight: 600;
    color: {TEXT_SECONDARY};
    text-transform: uppercase;
    letter-spacing: 0.5px;
}}

/* Input Fields */
QLineEdit {{
    background-color: #0E1524;
    border: 1px solid {BORDER_COLOR};
    border-radius: 6px;
    padding: 7px 12px;
    color: {TEXT_PRIMARY};
    font-size: 13px;
    selection-background-color: {COLOR_ACCENT};
}}

QLineEdit:focus {{
    border: 1px solid {BORDER_FOCUS};
    background-color: #111A2C;
}}

QLineEdit:read-only {{
    background-color: #0A0F1D;
    color: {TEXT_SECONDARY};
}}

/* Push Buttons */
QPushButton {{
    background-color: #1E293B;
    border: 1px solid {BORDER_COLOR};
    border-radius: 6px;
    color: {TEXT_PRIMARY};
    padding: 7px 16px;
    font-weight: 600;
    font-size: 12px;
}}

QPushButton:hover {{
    background-color: #27354E;
    border-color: #384C6F;
}}

QPushButton:pressed {{
    background-color: #1A2436;
}}

QPushButton#primaryBtn {{
    background-color: {COLOR_ACCENT};
    border: 1px solid #60A5FA;
    color: #FFFFFF;
    font-weight: 600;
}}

QPushButton#primaryBtn:hover {{
    background-color: {COLOR_ACCENT_HOVER};
}}

QPushButton#secondaryBtn {{
    background-color: #1A2438;
    border: 1px solid {BORDER_COLOR};
    color: #CBD5E1;
}}

QPushButton#secondaryBtn:hover {{
    background-color: #23314B;
    border-color: #3B82F6;
    color: #FFFFFF;
}}

QPushButton#runAutomationBtn {{
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #10B981, stop:1 #059669);
    border: 1px solid #34D399;
    border-radius: 7px;
    color: #FFFFFF;
    font-size: 14px;
    font-weight: 700;
    padding: 10px 24px;
    letter-spacing: 0.5px;
}}

QPushButton#runAutomationBtn:hover {{
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #059669, stop:1 #047857);
    border-color: #6EE7B7;
}}

QPushButton#runAutomationBtn:pressed {{
    background-color: #047857;
}}

QPushButton#runAutomationBtn:disabled {{
    background-color: #1E293B;
    border: 1px solid #334155;
    color: #64748B;
}}

/* Radio Buttons */
QRadioButton {{
    color: {TEXT_PRIMARY};
    spacing: 8px;
    font-size: 13px;
    font-weight: 500;
}}

QRadioButton::indicator {{
    width: 16px;
    height: 16px;
    border-radius: 8px;
    border: 2px solid {BORDER_COLOR};
    background-color: #0E1524;
}}

QRadioButton::indicator:hover {{
    border-color: {BORDER_FOCUS};
}}

QRadioButton::indicator:checked {{
    border: 2px solid {BORDER_FOCUS};
    background-color: {BORDER_FOCUS};
}}

/* Table Widget */
QTableWidget {{
    background-color: {BG_CARD};
    border: 1px solid {BORDER_COLOR};
    border-radius: 8px;
    gridline-color: #1E2B45;
    color: {TEXT_PRIMARY};
    selection-background-color: #1E2E4E;
    selection-color: #FFFFFF;
    outline: none;
}}

QTableWidget::item {{
    padding: 8px 10px;
    border-bottom: 1px solid #162035;
}}

QTableWidget::item:selected {{
    background-color: #1E2F52;
    color: #FFFFFF;
}}

QHeaderView::section {{
    background-color: {BG_HEADER};
    color: #CBD5E1;
    font-weight: 700;
    font-size: 11px;
    padding: 7px 8px;
    border: none;
    border-right: 1px solid {BORDER_COLOR};
    border-bottom: 2px solid {BORDER_COLOR};
}}

QHeaderView::section:last {{
    border-right: none;
}}

/* Progress Bar */
QProgressBar {{
    background-color: #0E1524;
    border: 1px solid {BORDER_COLOR};
    border-radius: 6px;
    text-align: center;
    color: #FFFFFF;
    font-weight: 600;
    font-size: 11px;
    height: 18px;
}}

QProgressBar::chunk {{
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #3B82F6, stop:1 #10B981);
    border-radius: 5px;
}}

/* Log Terminal Output */
QTextEdit#logConsole {{
    background-color: #070A11;
    border: 1px solid {BORDER_COLOR};
    border-radius: 8px;
    color: #E2E8F0;
    font-family: 'Consolas', 'Cascadia Code', 'Courier New', monospace;
    font-size: 12px;
    padding: 10px;
    line-height: 1.4;
}}

/* Scrollbars */
QScrollBar:vertical {{
    background-color: #0B0F19;
    width: 10px;
    margin: 0;
}}

QScrollBar::handle:vertical {{
    background-color: #223049;
    border-radius: 5px;
    min-height: 24px;
}}

QScrollBar::handle:vertical:hover {{
    background-color: #314466;
}}

QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
    height: 0px;
}}

QScrollBar:horizontal {{
    background-color: #0B0F19;
    height: 10px;
    margin: 0;
}}

QScrollBar::handle:horizontal {{
    background-color: #223049;
    border-radius: 5px;
    min-width: 24px;
}}

QScrollBar::handle:horizontal:hover {{
    background-color: #314466;
}}

QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {{
    width: 0px;
}}

/* Tooltip */
QToolTip {{
    background-color: #1E293B;
    border: 1px solid #475569;
    border-radius: 4px;
    color: #F8FAFC;
    padding: 6px 10px;
    font-size: 12px;
}}
"""


class StatusBadgeDelegate(QStyledItemDelegate):
    """Custom delegate that renders modern pill badges for Matched and Missing with vector icons."""

    def paint(self, painter: QPainter, option: QStyleOptionViewItem, index):
        text = str(index.data() or "")
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Draw cell background if selected
        if option.state & QStyle.StateFlag.State_Selected:
            painter.fillRect(option.rect, QColor("#1E2F52"))

        # Determine badge styling
        is_matched = "Matched" in text or "✓" in text
        if is_matched:
            bg_color = QColor(COLOR_MATCHED_BG)
            border_color = QColor(COLOR_MATCHED_BORDER)
            text_color = QColor(COLOR_MATCHED_TEXT)
            display_text = "MATCHED"
        else:
            bg_color = QColor(COLOR_MISSING_BG)
            border_color = QColor(COLOR_MISSING_BORDER)
            text_color = QColor(COLOR_MISSING_TEXT)
            display_text = "MISSING"

        # Calculate badge pill dimensions
        rect = option.rect
        badge_w = 98
        badge_h = 24
        x = rect.x() + max(4, (rect.width() - badge_w) // 2)
        y = rect.y() + max(3, (rect.height() - badge_h) // 2)

        badge_rect = QRectF(float(x), float(y), float(badge_w), float(badge_h))

        # Draw pill background & border
        painter.setBrush(QBrush(bg_color))
        painter.setPen(QPen(border_color, 1))
        painter.drawRoundedRect(badge_rect, 12, 12)

        # Draw vector icon (check mark or cross)
        painter.setPen(QPen(text_color, 2))
        if is_matched:
            # Draw vector checkmark
            cx = x + 12
            cy = y + 12
            painter.drawLine(int(cx - 3), int(cy), int(cx - 1), int(cy + 3))
            painter.drawLine(int(cx - 1), int(cy + 3), int(cx + 4), int(cy - 3))
        else:
            # Draw vector cross (X)
            cx = x + 12
            cy = y + 12
            painter.drawLine(int(cx - 3), int(cy - 3), int(cx + 3), int(cy + 3))
            painter.drawLine(int(cx + 3), int(cy - 3), int(cx - 3), int(cy + 3))

        # Draw text label next to vector icon
        font = QFont("Segoe UI", 9, QFont.Weight.Bold)
        font.setLetterSpacing(QFont.SpacingType.AbsoluteSpacing, 0.5)
        painter.setFont(font)
        text_rect = QRectF(float(x + 22), float(y), float(badge_w - 24), float(badge_h))
        painter.setPen(QPen(text_color))
        painter.drawText(text_rect, Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft, display_text)

        painter.restore()


class TagBadgeDelegate(QStyledItemDelegate):
    """Custom delegate that formats the Main Tag as a clean pill badge."""

    def paint(self, painter: QPainter, option: QStyleOptionViewItem, index):
        tag_text = str(index.data() or "").strip()
        if not tag_text:
            super().paint(painter, option, index)
            return

        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        if option.state & QStyle.StateFlag.State_Selected:
            painter.fillRect(option.rect, QColor("#1E2F52"))

        rect = option.rect
        font = QFont("Segoe UI", 9)
        painter.setFont(font)

        # Calculate text width
        metrics = painter.fontMetrics()
        text_w = metrics.horizontalAdvance(tag_text)
        badge_w = min(rect.width() - 8, text_w + 16)
        badge_h = 22
        x = rect.x() + 4
        y = rect.y() + max(2, (rect.height() - badge_h) // 2)

        badge_rect = QRectF(x, y, badge_w, badge_h)

        # Draw soft pill
        painter.setBrush(QBrush(QColor("#1E2D4A")))
        painter.setPen(QPen(QColor("#2B3E66"), 1))
        painter.drawRoundedRect(badge_rect, 6, 6)

        # Draw text
        painter.setPen(QPen(QColor("#93C5FD")))
        elided = metrics.elidedText(tag_text, Qt.TextElideMode.ElideRight, int(badge_w - 8))
        painter.drawText(badge_rect, Qt.AlignmentFlag.AlignCenter, elided)

        painter.restore()
