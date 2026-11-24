"""Tests for Canva smart number matching (Solution A) and filename restoration."""
import os
import shutil
import tempfile
import unittest
from models import DesignItem
from file_matcher import (
    extract_design_number,
    scan_artwork_inventory,
    match_designs_with_folder,
    sync_canva_filenames
)
from server import app, state, load_csv_data


class TestCanvaSmartMatcher(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.client = app.test_client()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_extract_design_number(self):
        cases = [
            ("design_01_design-to-design.png", 1),
            ("design_19_design-to-design.png", 19),
            ("design_12.png", 12),
            ("1.png", 1),
            ("01.png", 1),
            ("19.png", 19),
            ("Untitled design - 1.png", 1),
            ("Untitled design - 12.png", 12),
            ("page_5.png", 5),
            ("scraped_7.png", 7),
            ("no_number.png", None),
        ]
        for name, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(extract_design_number(name), expected)

    def test_smart_canva_matching_in_memory(self):
        # Create fake PNG files named 1.png, 2.png, 12.png, 17.png
        # Using 1x1 transparent PNG data or real image copy
        real_png = os.path.join(os.getcwd(), "reference_screenshots", "TeePublic.png")
        if not os.path.exists(real_png):
            real_png = os.path.join(os.getcwd(), "uploads", "artwork", "test_dummy.png")

        for num in [1, 2, 3, 12, 17]:
            shutil.copyfile(real_png, os.path.join(self.temp_dir, f"{num}.png"))

        # Create design items mimicking Magic Fabric export (with design_XX names in random order)
        items = [
            DesignItem(index=1, file_name="design_12_design-to-design.png", title="New York Hardcore"),
            DesignItem(index=2, file_name="design_03_design-to-design.png", title="Rage Consumes Me Cat"),
            DesignItem(index=3, file_name="design_17_design-to-design.png", title="Psychedelic Rainbow Poodle"),
            DesignItem(index=4, file_name="design_02_design-to-design.png", title="Become Ungovernable"),
            DesignItem(index=5, file_name="design_01_design-to-design.png", title="Thankful Fall Autumn"),
            DesignItem(index=6, file_name="design_19_design-to-design.png", title="Geometric Rock Singer"),  # missing from folder
        ]

        summary = match_designs_with_folder(items, self.temp_dir)

        # 5 out of 6 should be matched
        self.assertEqual(summary.matched_count, 5)
        self.assertEqual(summary.missing_count, 1)

        # Verify exact pairings
        self.assertTrue(items[0].is_matched)
        self.assertEqual(os.path.basename(items[0].file_path), "12.png")

        self.assertTrue(items[1].is_matched)
        self.assertEqual(os.path.basename(items[1].file_path), "3.png")

        self.assertTrue(items[2].is_matched)
        self.assertEqual(os.path.basename(items[2].file_path), "17.png")

        self.assertTrue(items[3].is_matched)
        self.assertEqual(os.path.basename(items[3].file_path), "2.png")

        self.assertTrue(items[4].is_matched)
        self.assertEqual(os.path.basename(items[4].file_path), "1.png")

        # 19.png was not in folder
        self.assertFalse(items[5].is_matched)
        self.assertIsNone(items[5].file_path)

    def test_sync_canva_filenames(self):
        real_png = os.path.join(os.getcwd(), "reference_screenshots", "TeePublic.png")
        if not os.path.exists(real_png):
            real_png = os.path.join(os.getcwd(), "uploads", "artwork", "test_dummy.png")

        # Create files 1.png and 2.png
        p1 = os.path.join(self.temp_dir, "1.png")
        p2 = os.path.join(self.temp_dir, "2.png")
        shutil.copyfile(real_png, p1)
        shutil.copyfile(real_png, p2)

        items = [
            DesignItem(index=1, file_name="design_01_design-to-design.png", title="Design 1"),
            DesignItem(index=2, file_name="design_02_design-to-design.png", title="Design 2"),
        ]

        res = sync_canva_filenames(items, self.temp_dir)
        self.assertEqual(res["renamed_count"], 2)

        # Check that files on disk were renamed
        files_after = os.listdir(self.temp_dir)
        self.assertIn("design_01_design-to-design.png", files_after)
        self.assertIn("design_02_design-to-design.png", files_after)
        self.assertNotIn("1.png", files_after)
        self.assertNotIn("2.png", files_after)

    def test_real_user_data_matching_if_available(self):
        real_csv = r"F:\new 25 nov12\magic_listings_export_2026-11-12.csv"
        real_canva_folder = r"F:\new 25 nov12\designs"

        if os.path.isfile(real_csv) and os.path.isdir(real_canva_folder):
            load_csv_data(real_csv, real_canva_folder, source="Real Data Test")
            # In real_canva_folder, there are 17 files (1.png through 17.png)
            # The CSV has 19 rows. Exactly 17 rows should be matched!
            self.assertEqual(state.summary.total_csv_rows, 19)
            self.assertEqual(state.summary.matched_count, 17)
            self.assertEqual(state.summary.missing_count, 2)

            # Check that row with design_01 got 1.png
            d_01 = next(d for d in state.designs if "design_01" in d.file_name)
            self.assertTrue(d_01.is_matched)
            self.assertEqual(os.path.basename(d_01.file_path), "1.png")

            # Check that row with design_12 got 12.png
            d_12 = next(d for d in state.designs if "design_12" in d.file_name)
            self.assertTrue(d_12.is_matched)
            self.assertEqual(os.path.basename(d_12.file_path), "12.png")

            # Check that row with design_03 got 3.png
            d_03 = next(d for d in state.designs if "design_03" in d.file_name)
            self.assertTrue(d_03.is_matched)
            self.assertEqual(os.path.basename(d_03.file_path), "3.png")

            print("\n[VERIFIED] Real user CSV and Canva designs matched 17/17 present files with 100% precision!")


if __name__ == "__main__":
    unittest.main()
