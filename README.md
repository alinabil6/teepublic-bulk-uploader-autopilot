# Magic Fabrica — TeePublic Bulk Uploader & Autopilot System

An autonomous bulk uploading and listing system for **TeePublic**, featuring a **local Desktop Studio (Flask Web UI)** paired with a **live Chrome Extension Autopilot (Manifest V3)**.

---

## 🌟 Overview

The system consists of two tightly coupled components:

1. **Magic Fabrica Studio (Desktop Queue Server)**:
   - Modern dark-themed dashboard running locally on `http://127.0.0.1:5050`.
   - Loads CSV listing metadata and matches artwork PNGs automatically.
   - Interactive garment mockups with live color swatches and garment background previews.
   - Product toggle management with quick `Copy Settings to All Designs`.
   - Real-time JSON API (`/api/state`, `/api/thumbnail/<id>`) that feeds the Chrome extension.

2. **Magic Fabrica Autopilot (Chrome Extension — Manifest V3)**:
   - Live human-paced navigator directly within TeePublic in your browser.
   - **True Bulk Uploader Integration**: Automatically injects batches of artwork (from 3 up to 50 designs) simultaneously into TeePublic's dropzone.
   - **Smooth Auto-Trigger**: Monitors S3 upload progress and clicks "Get Started" without erratic scrolling or UI displacement.
   - **Rock-Solid Floating HUD**: Fixed firmly at `bottom: 24px; right: 24px` with a 6-stage real-time progress tracker (`Nav` → `Drop` → `Start` → `Meta` → `Colors` → `Pub`).
   - **Sequential Bulk Listing**: Autonomously steps through each design in the batch (`Currently Editing Design X of Y`), filling title, main tag, supporting tags (from TeePublic autocomplete suggestions), description, and mature content flags.
   - **Independent Garment & Product Colors**: Respects per-design garment choices (e.g., Creme, Black, Heather) via TeePublic's native ddSlick selectors and sets color values across all 14 product canvases with zero validation alerts.
   - **Automatic Batch Finalization**: Seamlessly advances through each design and triggers the final "Publish All".

---

## 📂 Project Architecture

```
├── extension/                       # Chrome Extension (Manifest V3)
│   ├── manifest.json                # Extension manifest configuration
│   ├── background.js                # Service worker
│   ├── content.js                   # Live autopilot DOM navigator & form automation
│   ├── content.css                  # Floating HUD & notification styles
│   ├── popup.html                   # Extension action popup
│   ├── popup.js                     # Popup controller & state sync
│   ├── popup.css                    # Popup dark-mode styles
│   └── icons/                       # Magic Fabrica brand icons (16, 48, 128)
├── ui/                              # Studio Dashboard Frontend
│   ├── index.html                   # Studio UI template
│   ├── styles.css                   # MerchGhost dark theme styles
│   ├── app.js                       # Frontend state & interaction controller
│   ├── favicon.png                  # App icon
│   ├── logo.png                     # Magic Fabrica header logo
│   ├── tshirt_white.png             # Base garment mockup
│   ├── tshirt_mask.png              # Garment color mask
│   └── tshirt_shading.png           # Garment shadow overlay
├── main.py                          # Studio entry point (CLI & server starter)
├── server.py                        # Flask server & REST API endpoints
├── csv_parser.py                    # CSV loading, validation & column normalizer
├── file_matcher.py                  # Artwork file-to-listing matcher
├── automation.py                    # Server-side automation runner & fallback
├── bridge.py                        # Desktop/Web communication bridge
├── dialog_helper.py                 # File picker fallbacks
├── models.py                        # Data structures and schemas
├── requirements.txt                 # Python dependencies
└── README.md                        # Documentation
```

---

## 🚀 Quick Start Guide

### 1. Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/alinabil6/teepublic-bulk-uploader-autopilot.git
   cd teepublic-bulk-uploader-autopilot
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

### 2. Launching the Studio

Start the local Desktop Studio on port 5050:
```bash
python main.py
```
*(Or use `py main.py` on Windows)*. The browser will open `http://127.0.0.1:5050` automatically.

- Click **Upload CSV** to load your listings.
- Click **Upload Artworks Folder** to select your design PNGs.
- Inspect and adjust titles, tags, garment colors (Black, Creme, Heather, etc.), and product toggles.

### 3. Loading the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `extension/` folder inside this repository.
5. Pin the **Magic Fabrica** icon to your toolbar.

### 4. Running Autopilot

1. Log into your TeePublic artist account.
2. Open the extension popup or click **START AUTOPILOT (1-CLICK)**.
3. The extension navigates to `https://www.teepublic.com/designs/bulk_uploader`, injects all matched designs, triggers "Get Started", populates metadata and colors design-by-design, and submits the batch!

---

## 🎨 Supported Garment & Product Colors

The autopilot handles TeePublic ddSlick dropdowns and all 14 product canvas backgrounds:
- **Black / Dark**: `#111111`
- **Creme / Cream / Creamy**: `#faf4e8`
- **White / Light**: `#ffffff`
- **Heather Gray**: `#8c9096`
- **Navy**: `#1c2841`
- **Royal Blue**: `#1b4388`
- **Forest Green**: `#1a3d24`
- **Red**: `#9e1b24`
- **Charcoal**: `#333333`

---

## 📄 License

MIT License. Built for independent creators and POD automation workflows.
