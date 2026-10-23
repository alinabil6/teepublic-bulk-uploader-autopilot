"""
Playwright Automation Engine for TeePublic Bulk Uploader.
Automates batch uploading and metadata entry on https://www.teepublic.com/upload-art
"""
import os
import sys
import time
import logging
from typing import List, Dict, Any, Optional, Callable

try:
    from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext, TimeoutError as PlaywrightTimeoutError
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    sync_playwright = None
    Page = Any
    Browser = Any
    BrowserContext = Any
    PlaywrightTimeoutError = Exception
    PLAYWRIGHT_AVAILABLE = False

# TeePublic official 42 apparel colors hex map for reference and automation
TEEPUBLIC_COLORS = {
    "Black": "#111111",
    "White": "#ffffff",
    "Heather Grey": "#94a3b8",
    "Charcoal": "#334155",
    "Dark Heather": "#1f2937",
    "Asphalt": "#1e293b",
    "Slate": "#64748b",
    "Silver": "#cbd5e1",
    "Natural Heather": "#e2e8f0",
    "Creme": "#fef3c7",
    "Tan": "#d6d3d1",
    "Brown": "#78350f",
    "Navy": "#1e293b",
    "Dark Navy": "#0f172a",
    "Classic Blue": "#1d4ed8",
    "Royal Blue": "#2563eb",
    "Sky Blue": "#38bdf8",
    "Baby Blue": "#bae6fd",
    "Aqua": "#06b6d4",
    "Turquoise": "#2dd4bf",
    "Forest Green": "#166534",
    "Olive": "#3f6212",
    "Army Green": "#4d7c0f",
    "Kelly Green": "#16a34a",
    "Lime": "#84cc16",
    "Mint": "#a7f3d0",
    "Red": "#dc2626",
    "Cardinal": "#b91c1c",
    "Maroon": "#800020",
    "Coral": "#fb7185",
    "Light Pink": "#fbcfe8",
    "Pink": "#f472b6",
    "Magenta": "#d946ef",
    "Mauve": "#c084fc",
    "Lavender": "#ddd6fe",
    "Purple": "#9333ea",
    "Deep Purple": "#6b21a8",
    "Plum": "#581c87",
    "Lemon": "#fef08a",
    "Yellow": "#facc15",
    "Gold": "#eab308",
    "Orange": "#f97316",
    # Compatibility aliases
    "Vintage Royal": "#3b82f6",
    "Kelly": "#16a34a",
    "Mauvealous": "#f472b6"
}

class TeePublicAutomation:
    def __init__(
        self,
        designs: List[Dict[str, Any]],
        color_preference: str = "all",
        log_callback: Optional[Callable[[str, str], None]] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None,
        headless: bool = False
    ):
        self.designs = designs
        self.color_preference = color_preference.lower()
        self.log_cb = log_callback or (lambda lvl, msg: print(f"[{lvl}] {msg}"))
        self.progress_cb = progress_callback or (lambda cur, tot: None)
        self.headless = headless
        self.is_running = False
        self.stop_requested = False

    def log(self, level: str, message: str):
        self.log_cb(level.upper(), message)

    def request_stop(self):
        self.stop_requested = True
        self.log("WARNING", "Stop requested by user. Aborting automation...")

    def run(self):
        """Execute the multi-file TeePublic upload flow."""
        self.is_running = True
        self.stop_requested = False

        if not PLAYWRIGHT_AVAILABLE or sync_playwright is None:
            self.log("INFO", "💡 Live automation is powered by the Magic Fabrica Chrome Extension.")
            self.log("WARNING", "Playwright python package is not installed. To use the Python engine, run: pip install playwright")
            self.is_running = False
            return False

        matched_designs = [d for d in self.designs if d.get("is_matched") and d.get("file_path")]
        if not matched_designs:
            self.log("ERROR", "No matched artwork designs found to upload! Please match CSV with images first.")
            self.is_running = False
            return False

        # TeePublic supports up to 50 files in one batch
        batch_designs = matched_designs[:50]
        png_files = [d["file_path"] for d in batch_designs if os.path.isfile(d["file_path"])]

        if not png_files:
            self.log("ERROR", "No valid image files found on disk for matched designs.")
            self.is_running = False
            return False

        self.log("INFO", f"Starting Playwright browser (headed={not self.headless})...")
        self.log("INFO", f"Batch size: {len(png_files)} PNG artwork files ready for upload.")

        playwright_instance = None
        browser: Optional[Browser] = None
        context: Optional[BrowserContext] = None

        try:
            playwright_instance = sync_playwright().start()
            user_data_dir = os.path.join(os.getcwd(), "browser_data")
            os.makedirs(user_data_dir, exist_ok=True)
            # Use persistent context to retain login session & Cloudflare clearance across runs
            context = playwright_instance.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=self.headless,
                viewport={"width": 1366, "height": 768},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                args=["--start-maximized", "--disable-blink-features=AutomationControlled"]
            )
            page: Page = context.pages[0] if context.pages else context.new_page()

            # Step 1: Navigate to /upload-art
            self.log("INFO", "Step 1: Navigating to https://www.teepublic.com/upload-art ...")
            try:
                page.goto("https://www.teepublic.com/upload-art", timeout=30000, wait_until="domcontentloaded")
            except Exception as e:
                self.log("WARNING", f"Initial page load warning: {e}. Checking current URL...")

            time.sleep(2)

            # Check if redirected to login or Cloudflare challenge
            curr_url = page.url.lower()
            page_title = (page.title() or "").lower()
            if "login" in curr_url or "sign_in" in curr_url or "challenge" in curr_url or "just a moment" in page_title:
                self.log("WARNING", "TeePublic requires login or Cloudflare verification in this browser.")
                self.log("INFO", "Waiting up to 60s for you to complete verification / login...")
                self.log("TIP", "Or use the 1-Click Browser Extension directly in your logged-in browser (Brave/Chrome/Tor)!")
                try:
                    page.wait_for_selector('input[type="file"], button:has-text("Multi-File Upload")', timeout=60000)
                    self.log("SUCCESS", "Upload page ready! Continuing with upload...")
                except Exception:
                    self.log("ERROR", "Verification wait timed out and upload form is not accessible. Aborting cleanly.")
                    return False

            if self.stop_requested:
                return False

            # Step 2: Click "Multi-File Upload" if available
            self.log("INFO", "Step 2: Checking for 'Multi-File Upload' button...")
            multi_file_selectors = [
                'button:has-text("Multi-File Upload")',
                'a:has-text("Multi-File Upload")',
                'text="Multi-File Upload"',
                'button:has-text("Multi-File")',
                'a[href*="multi"]',
                '.multi-file-button',
                '[data-test="multi-file-upload"]'
            ]
            clicked_multi = False
            for sel in multi_file_selectors:
                try:
                    elem = page.query_selector(sel)
                    if elem and elem.is_visible():
                        elem.click()
                        clicked_multi = True
                        self.log("SUCCESS", f"Clicked Multi-File Upload button ({sel})")
                        time.sleep(1.5)
                        break
                except Exception:
                    continue

            if not clicked_multi:
                self.log("INFO", "Multi-file button not explicitly found or already on multi-upload view. Looking for file input...")

            if self.stop_requested:
                return False

            # Step 3: Upload all PNG files in one batch using file input element
            self.log("INFO", f"Step 3: Uploading {len(png_files)} PNG files in batch via file input...")
            file_input_selectors = [
                'input[type="file"][multiple]',
                'input[type="file"]',
                '#file-uploader input[type="file"]',
                '.file-upload-input'
            ]

            file_input = None
            for sel in file_input_selectors:
                try:
                    elem = page.query_selector(sel)
                    if elem:
                        file_input = elem
                        break
                except Exception:
                    continue

            if not file_input:
                self.log("WARNING", "Direct file input not visible, waiting for selector 'input[type=\"file\"]'...")
                try:
                    page.wait_for_selector('input[type="file"]', timeout=10000)
                    file_input = page.query_selector('input[type="file"]')
                except Exception as e:
                    self.log("ERROR", f"File input element not found: {e}")

            if file_input:
                self.log("INFO", f"Setting {len(png_files)} files to upload input...")
                page.set_input_files('input[type="file"]', png_files)
                self.log("SUCCESS", "Files submitted to uploader successfully!")
            else:
                self.log("ERROR", "Could not locate file input to attach artwork images.")

            if self.stop_requested:
                return False

            # Step 4: Wait for "UPLOADS COMPLETE! CLICK 'GET STARTED' TO CONTINUE" message
            self.log("INFO", "Step 4: Waiting for file processing / uploads to complete...")
            get_started_btn = None
            get_started_selectors = [
                'button:has-text("GET STARTED")',
                'button:has-text("Get Started")',
                'a:has-text("GET STARTED")',
                'input[value*="GET STARTED" i]',
                '.get-started-button',
                '[data-test="get-started"]',
                'button.btn-primary:has-text("Start")'
            ]

            # Poll for complete message or GET STARTED button (up to 45 seconds for multiple files)
            for _ in range(45):
                if self.stop_requested:
                    return False

                # Check for upload complete message
                try:
                    page_text = page.inner_text("body")
                    if "UPLOADS COMPLETE" in page_text.upper():
                        self.log("SUCCESS", "Detected 'UPLOADS COMPLETE! CLICK GET STARTED TO CONTINUE'")
                        break
                except Exception:
                    pass

                # Check if GET STARTED button is ready
                for sel in get_started_selectors:
                    try:
                        btn = page.query_selector(sel)
                        if btn and btn.is_visible() and btn.is_enabled():
                            get_started_btn = btn
                            break
                    except Exception:
                        continue
                if get_started_btn:
                    break

                time.sleep(1)

            # Step 5: Click "GET STARTED"
            self.log("INFO", "Step 5: Clicking 'GET STARTED' button...")
            if not get_started_btn:
                for sel in get_started_selectors:
                    try:
                        btn = page.query_selector(sel)
                        if btn and btn.is_visible():
                            get_started_btn = btn
                            break
                    except Exception:
                        continue

            if get_started_btn:
                get_started_btn.click()
                self.log("SUCCESS", "Clicked 'GET STARTED'!")
                time.sleep(2)
            else:
                self.log("WARNING", "'GET STARTED' button not found or already proceeded.")

            # Step 6: For each design (loop)
            self.log("INFO", "Step 6: Processing design listings loop...")
            total_designs = len(batch_designs)

            for i, design in enumerate(batch_designs):
                if self.stop_requested:
                    self.log("WARNING", "Automation aborted by user.")
                    break

                self.progress_cb(i + 1, total_designs)
                filename = design.get("file_name", f"Design #{i+1}")
                title = design.get("title", "")
                main_tag = design.get("main_tag", "")
                supporting_tags = design.get("supporting_tags", "")
                description = design.get("description", "")
                color_pref = design.get("color_preference", self.color_preference).lower()

                self.log("INFO", f"--- [{i+1}/{total_designs}] Configuring: {filename} ---")
                self.log("INFO", f"Title: {title[:40]}... | Main Tag: {main_tag} | Pref: {color_pref}")

                try:
                    # a. Wait for the bulk uploader form to load (timeout 10s)
                    self._fill_design_form(
                        page,
                        design,
                        title,
                        main_tag,
                        supporting_tags,
                        description,
                        color_pref
                    )

                    # i. Click "NEXT DESIGN" button
                    if i < total_designs - 1:
                        self.log("INFO", "Clicking 'NEXT DESIGN' button...")
                        next_selectors = [
                            'button:has-text("NEXT DESIGN")',
                            'button:has-text("Next Design")',
                            'button:has-text("Next")',
                            'a:has-text("NEXT DESIGN")',
                            'a:has-text("Next Design")',
                            '.next-design-button',
                            '[data-action="next-design"]'
                        ]
                        clicked_next = False
                        for sel in next_selectors:
                            try:
                                btn = page.query_selector(sel)
                                if btn and btn.is_visible():
                                    btn.click()
                                    clicked_next = True
                                    self.log("SUCCESS", "Clicked NEXT DESIGN")
                                    time.sleep(1.5)
                                    break
                            except Exception:
                                continue

                        if not clicked_next:
                            self.log("WARNING", "Could not find NEXT DESIGN button; attempting to continue.")
                    else:
                        self.log("SUCCESS", f"All {total_designs} designs configured in TeePublic!")

                except PlaywrightTimeoutError:
                    self.log("WARNING", f"Timeout (10s) on design '{filename}'. Skipping to next design...")
                    continue
                except Exception as e:
                    self.log("WARNING", f"Error on design '{filename}': {e}. Skipping to next design...")
                    continue

            # Step 7: When all designs done, log "COMPLETE"
            self.log("SUCCESS", "=== AUTOMATION COMPLETE ===")
            self.log("SUCCESS", f"Finished batch processing {len(batch_designs)} designs on TeePublic.")
            self.progress_cb(total_designs, total_designs)
            return True

        except Exception as e:
            self.log("ERROR", f"Automation execution error: {str(e)}")
            return False

        finally:
            self.is_running = False
            # Safely close context, browser, and stop playwright instance to prevent process/memory leaks
            if context:
                try:
                    context.close()
                except Exception:
                    pass
            if browser:
                try:
                    browser.close()
                except Exception:
                    pass
            if playwright_instance:
                try:
                    playwright_instance.stop()
                except Exception:
                    pass

    def _fill_design_form(
        self,
        page: Page,
        design: Dict[str, Any],
        title: str,
        main_tag: str,
        supporting_tags: str,
        description: str,
        color_pref: str
    ):
        """Fill metadata inputs for the currently active design form with 10s timeouts."""
        # Wait for form title field (up to 10s)
        title_selectors = [
            'input[name="design[title]"]',
            'input[name*="title" i]',
            '#design_title',
            'input[placeholder*="Title" i]',
            'label:has-text("Title") + input',
            'label:has-text("Title") input'
        ]

        # c. Fill "Design Title" input
        filled_title = False
        for sel in title_selectors:
            try:
                page.wait_for_selector(sel, timeout=3000, state="visible")
                page.fill(sel, title)
                filled_title = True
                break
            except Exception:
                continue

        if not filled_title:
            self.log("WARNING", f"Title input not found with standard selectors; skipping title field.")

        # d. Fill "Main Tag" input
        main_tag_selectors = [
            'input[name="design[primary_tag]"]',
            'input[name*="main_tag" i]',
            'input[name*="primary_tag" i]',
            '#design_primary_tag',
            '#primary_tag',
            '#main_tag',
            'input[placeholder*="Main Tag" i]',
            'label:has-text("Main Tag") + input'
        ]
        for sel in main_tag_selectors:
            try:
                if page.is_visible(sel):
                    page.fill(sel, main_tag)
                    break
            except Exception:
                continue

        # e. Fill "Description" textarea
        desc_selectors = [
            'textarea[name="design[description]"]',
            'textarea[name*="desc" i]',
            '#design_description',
            'textarea[placeholder*="Description" i]',
            'textarea'
        ]
        for sel in desc_selectors:
            try:
                if page.is_visible(sel):
                    page.fill(sel, description)
                    break
            except Exception:
                continue

        # f. Fill Supporting Tags by tokenizing and dispatching tag events
        if supporting_tags:
            tag_list = [t.strip().lstrip('#') for t in supporting_tags.split(",") if t.strip()]
            sec_input_selectors = [
                '#secondary_tags input.taggle_input',
                '#secondary_tags input',
                'input[name="design[secondary_tags]"]',
                'textarea[name="design[secondary_tags]"]',
                '#design_secondary_tags',
                '#supporting_tags'
            ]
            sec_sel = None
            for sel in sec_input_selectors:
                try:
                    if page.is_visible(sel):
                        sec_sel = sel
                        break
                except Exception:
                    continue

            if sec_sel:
                for tag in tag_list:
                    try:
                        page.focus(sec_sel)
                        page.type(sec_sel, tag, delay=35)
                        page.keyboard.press("Comma")
                        time.sleep(0.08)
                    except Exception:
                        pass

        # g. Set Mature Content (Yes / No)
        mature = str(design.get("mature_content", "no")).strip().lower()
        mature_selectors = [
            f'input[type="radio"][name*="mature" i][value="{1 if mature in ("yes", "true", "1") else 0}"]',
            f'input[name*="mature" i][value*="{mature}" i]',
            f'label:has-text("{mature.capitalize()}") input[type="radio"]'
        ]
        for sel in mature_selectors:
            try:
                elem = page.query_selector(sel)
                if elem and elem.is_visible():
                    elem.click()
                    break
            except Exception:
                continue

        # h. Set print placement if specified (e.g. front, back, both)
        placement = str(design.get("print_placement", "front")).strip().lower()
        if placement in ("back", "both", "front & back", "front and back"):
            placement_label = "Front & Back" if "both" in placement or "and" in placement or "&" in placement else "Back"
            placement_selectors = [
                f'label:has-text("{placement_label}") input[type="radio"]',
                f'input[type="radio"][value*="{placement}" i]'
            ]
            for sel in placement_selectors:
                try:
                    elem = page.query_selector(sel)
                    if elem and elem.is_visible():
                        elem.click()
                        break
                except Exception:
                    continue

        # i. Set color preference (click All/Light/Dark/None pill button)
        pref_selectors = {
            "all": [
                'button:has-text("All")',
                'input[type="radio"][value*="all" i]',
                'label:has-text("All Colors")',
                'text="All Colors"'
            ],
            "light": [
                'button:has-text("Light")',
                'input[type="radio"][value*="light" i]',
                'label:has-text("Light Colors")',
                'text="Light Colors"'
            ],
            "dark": [
                'button:has-text("Dark")',
                'input[type="radio"][value*="dark" i]',
                'label:has-text("Dark Colors")',
                'text="Dark Colors"'
            ],
            "none": [
                'button:has-text("None")',
                'text="None"'
            ]
        }

        chosen_selectors = pref_selectors.get(color_pref, pref_selectors["all"])
        for sel in chosen_selectors:
            try:
                elem = page.query_selector(sel)
                if elem and elem.is_visible():
                    elem.click()
                    break
            except Exception:
                continue

        # j. Accurately synchronize product toggles based on user studio settings
        product_toggles = design.get("product_toggles", {})
        apparel_settings = design.get("apparel_settings", {})

        # 1. Apparel table rows (.apparel-options tr, tr[data-canvas])
        try:
            apparel_rows = page.query_selector_all('.apparel-options tr, tr[data-canvas]')
            for row in apparel_rows:
                raw_name = row.get_attribute('data-name') or ''
                if not raw_name:
                    continue
                is_enabled = True
                for key, val in apparel_settings.items():
                    if key.lower() == raw_name.lower() and isinstance(val, dict) and "enabled" in val:
                        is_enabled = val["enabled"] is not False
                        break
                if is_enabled and raw_name in product_toggles:
                    is_enabled = product_toggles[raw_name] is not False

                toggle_container = row.query_selector('.on-off')
                toggle_span = row.query_selector('.on-off span')
                hidden_inp = row.query_selector('.on-off input')
                if toggle_span:
                    classes = toggle_span.get_attribute('class') or ''
                    val = hidden_inp.get_attribute('value') if hidden_inp else ''
                    currently_enabled = ('enabled' in classes) or (val == 'true')
                    if is_enabled != currently_enabled:
                        target = toggle_container or toggle_span
                        target.click()
                        time.sleep(0.05)
        except Exception:
            pass

        # 2. Additional canvas product cards (.additional-canvases-container .canvas)
        try:
            canvases = page.query_selector_all('.additional-canvases-container .canvas')
            for card in canvases:
                canvas_name = card.get_attribute('data-canvas-name') or card.get_attribute('data-canvas') or ''
                if not canvas_name:
                    continue
                lower = canvas_name.lower()
                name_map = {
                    'print': 'Wall Art', 'bag': 'Bags', 'hat': 'Hats',
                    'sticker': 'Stickers', 'case': 'Cases', 'mug': 'Mugs',
                    'pillow': 'Pillows', 'tote': 'Totes', 'tapestry': 'Tapestries',
                    'pin': 'Pins', 'magnet': 'Magnets', 'shorts': 'Shorts'
                }
                target_key = name_map.get(lower, canvas_name)
                should_enable = True
                if target_key in product_toggles:
                    should_enable = product_toggles[target_key] is not False
                elif canvas_name in product_toggles:
                    should_enable = product_toggles[canvas_name] is not False

                toggle_container = card.query_selector('.on-off')
                toggle_span = card.query_selector('.on-off span')
                hidden_inp = card.query_selector('.on-off input')
                if toggle_span:
                    classes = toggle_span.get_attribute('class') or ''
                    val = hidden_inp.get_attribute('value') if hidden_inp else ''
                    currently_enabled = ('enabled' in classes) or (val == 'true')
                    if should_enable != currently_enabled:
                        target = toggle_container or toggle_span
                        target.click()
                        time.sleep(0.05)
        except Exception:
            pass

        # 3. Fallback generic product checkboxes
        try:
            toggle_checkboxes = page.query_selector_all('input[type="checkbox"][name*="product" i], .product-toggle input[type="checkbox"]')
            for cb in toggle_checkboxes:
                try:
                    cb_name = cb.get_attribute("name") or cb.get_attribute("id") or ""
                    should_be_on = True
                    for p_name, p_state in product_toggles.items():
                        if p_name.lower() in cb_name.lower():
                            should_be_on = bool(p_state)
                            break
                    if should_be_on and not cb.is_checked():
                        cb.check()
                    elif not should_be_on and cb.is_checked():
                        cb.uncheck()
                except Exception:
                    pass
        except Exception:
            pass

        # k. Set garment colors and all 14 background colors
        default_color_name = design.get("default_color") or "Black"
        norm_color = default_color_name.strip()
        hex_color = TEEPUBLIC_COLORS.get(norm_color, "#111111")
        if color_pref == "light" and hex_color == "#111111":
            hex_color = "#ffffff"

        try:
            page.evaluate(f"""() => {{
                const dropper = document.getElementById('dropperInput');
                if (dropper) {{
                    dropper.value = '{hex_color}';
                    dropper.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    dropper.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
                const applyAll = document.querySelector('.jsColorDropperApplyToAll');
                if (applyAll) applyAll.click();

                const bgSels = [
                    '#design_mockup_config_print_attributes_bg_color',
                    '#design_mockup_config_case_attributes_bg_color',
                    '#design_mockup_config_socks_attributes_bg_color',
                    '#design_mockup_config_coffee_mug_attributes_bg_color',
                    '#design_mockup_config_travel_mug_attributes_bg_color',
                    '#design_mockup_config_sticker_attributes_bg_color',
                    '#design_mockup_config_pillow_attributes_bg_color',
                    '#design_mockup_config_tote_attributes_bg_color',
                    '#design_mockup_config_tapestry_attributes_bg_color',
                    '#design_mockup_config_small_tapestry_attributes_bg_color',
                    '#design_mockup_config_pin_attributes_bg_color',
                    '#magnet_pin_bg_color',
                    '#design_mockup_config_magnet_attributes_bg_color',
                    '#design_mockup_config_card_attributes_bg_color',
                    '.jsUploaderColor'
                ];
                document.querySelectorAll(bgSels.join(', ')).forEach(el => {{
                    el.value = '{hex_color}';
                    el.setAttribute('value', '{hex_color}');
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }});
            }}""")
        except Exception:
            pass

