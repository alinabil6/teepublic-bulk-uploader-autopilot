# TeePublic Autopilot Agent — Autonomous Browser Extension

A private, locally-installed Manifest V3 browser extension built for **Brave**, **Google Chrome**, and **Edge**. It acts as an autonomous autopilot agent directly in your authenticated browser tab.

---

## 🚀 What the Autopilot Agent Does (1-Click Workflow)

1. **Autonomous Navigation**:
   - From anywhere on TeePublic (`/user/wizartbee`, `/designer-signup`, etc.), clicking **`🚀 START AUTOPILOT`** navigates directly to TeePublic's Bulk Uploader (`https://www.teepublic.com/designs/bulk_uploader`).
2. **Artwork Injection & Get Started**:
   - Attaches the artwork PNG from your local queue studio (`http://127.0.0.1:5050/api/thumbnail/<index>`).
   - Waits for TeePublic to process the image and clicks **Get Started** (`.jsS3BulkUploaderSubmit`).
3. **Exact Listing Form Auto-Fill**:
   - **Design Title**: Enters title cleanly (`#design_design_title`).
   - **Main Tag**: Enters primary tag (`#design_primary_tag`).
   - **Supporting Tags Autocomplete**: Types tags one by one, triggers TeePublic's suggestion dropdown, and selects the matching suggestions (`#secondary_tags`).
   - **Description**: Enters formatted description (`#design_design_description`).
   - **Mature Content**: Checks "No" (`#design_content_flag_false`).
   - **Print Placement**: Sets "Front" (`#apparel_side_front`).
4. **All 14 Product Background Colors (Zero Alerts!)**:
   - Solves the TeePublic validation alert: *"You must choose a color for phone cases, both mug styles, pillows, pins, socks, totes, hats, shorts, bags, tapestries."*
   - Sets `#dropperInput` and executes `.jsColorDropperApplyToAll`.
   - Directly configures all 14 background color inputs to 7-character hex codes (`#111111` or `#ffffff`).
   - Sets primary color defaults for Hats (`#primary_colors_55`), Shorts (`#primary_colors_56`), Bags (`#primary_colors_58`), and all apparel options.
   - Accepts terms and conditions (`#terms`).
5. **Publish & Move to Next**:
   - Displays completion notice and executes **Publish** (`button.publish-and-promote-button` or `input[value="Publish All"]`).
   - Seamlessly advances to the next design in queue.

---

## 🛠️ Step-by-Step Installation (30 Seconds)

1. Open your browser's extension manager:
   - **Brave**: `brave://extensions`
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
2. In the top-right corner, switch **Developer mode** to **ON**.
3. Click the **Load unpacked** button (top-left).
4. Select the folder:
   ```
   F:\script automation teepublic\extension
   ```
5. Click **Select Folder**. The extension **TeePublic Autopilot Agent** will load immediately.
6. (Optional) Pin it to your toolbar using the puzzle icon for 1-click access.

---

## ⚡ How to Run Autopilot

1. Ensure your local studio is running at `http://127.0.0.1:5050` with your queued designs.
2. Open TeePublic in your browser: `https://www.teepublic.com` (or your profile `https://www.teepublic.com/user/wizartbee`).
3. Click the extension toolbar icon and click:
   **`[ 🚀 START AUTOPILOT (1-CLICK) ]`**
   *(Or press `Alt+F` on any TeePublic page).*
4. Sit back and watch the Autopilot agent navigate, upload, tag, color, and publish smoothly!
