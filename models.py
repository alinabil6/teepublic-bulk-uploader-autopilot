"""Data models for TeePublic Bulk Uploader."""
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any


class ColorPreference(str, Enum):
    ALL = "all"
    LIGHT = "light"
    DARK = "dark"

    @classmethod
    def from_string(cls, value: str) -> "ColorPreference":
        val = (value or "").strip().lower()
        if "light" in val:
            return cls.LIGHT
        if "dark" in val:
            return cls.DARK
        return cls.ALL


@dataclass
class DesignItem:
    index: int
    file_name: str
    original_filename: str = ""
    title: str = ""
    main_tag: str = ""
    supporting_tags: str = ""
    all_tags: List[str] = field(default_factory=list)
    description: str = ""
    file_path: Optional[str] = None
    is_matched: bool = False
    status: str = "Pending Validation"
    validation_warning: Optional[str] = None
    raw_data: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not self.original_filename and self.file_name:
            self.original_filename = self.file_name

    @property
    def status_label(self) -> str:
        return "✓ Matched" if self.is_matched else "✗ Missing"


@dataclass
class ValidationSummary:
    total_csv_rows: int = 0
    matched_count: int = 0
    missing_count: int = 0
    folder_png_count: int = 0
    folder_path: str = ""
    csv_path: str = ""
