/**
 * Magic Fabrica — TeePublic Bulk Uploader Autopilot & Competitor Tag Scraper
 * Universal Content Script (MV3)
 * Handles:
 * 1. Sequential, memory-safe multi-file injection into TeePublic S3 Dropzone (handles 25-50 designs smoothly).
 * 2. Real-time DOM synchronization with "Currently Editing Design X of Y".
 * 3. Robust Taggle supporting tags injection with live keyboard emulation and fallback.
 * 4. Multi-color & 14-product matrix configuration.
 * 5. Elimination of zombie loops via batchCompleted flags & one-time navigation tokens.
 * 6. Strict artist-applied tag isolation (zero bleeding into customer/trending tags).
 * 7. High-contrast floating HUD & toast notifications with crisp white text.
 */

(() => {
  if (window.__MF_CONTENT_INJECTED__) return;
  window.__MF_CONTENT_INJECTED__ = true;

  const TEEPUBLIC_BULK_URL = "https://www.teepublic.com/designs/bulk_uploader";

  let extensionEnabled = true;
  let scraperEnabled = true;
  let isAutopilotRunning = false;
  let abortController = null;
  let cachedQueue = [];
  let scrapedCount = 0;

  // ==================== LIFECYCLE & ABORT HELPERS ====================

  function checkAborted() {
    if (!extensionEnabled || (abortController && abortController.signal.aborted)) {
      throw new Error("AUTOPILOT_ABORTED");
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function sendProgress(step, pct, current, total, statusLine, isRunning = true, batchCompleted = false) {
    const payload = {
      step,
      pct,
      currentDesign: current,
      totalDesigns: total,
      statusLine,
      isRunning,
      batchCompleted
    };
    updateHudUI(payload);
    chrome.runtime.sendMessage({
      action: "UPDATE_AUTOPILOT_PROGRESS",
      payload
    }).catch(() => {});
  }

  function hardStopAutopilot(reason = "Autopilot Stopped") {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isAutopilotRunning = false;
    chrome.storage.local.remove(["pendingAutopilotResume"]);
    sendProgress(0, 0, 0, cachedQueue.length, reason, false, false);
    showToast(reason, "warning");
  }

  async function syncQueueFromStudio() {
    const res = await chrome.runtime.sendMessage({ action: "FETCH_STUDIO_STATE" });
    if (res && res.success && res.data) {
      cachedQueue = (res.data.designs || []).filter((d) => d.is_matched && d.has_thumbnail);
      return res.data;
    }
    return null;
  }

  // ==================== DOM DETECTION HELPERS ====================

  function getActiveEditingIndices() {
    const textNodes = Array.from(document.querySelectorAll("h1, h2, h3, h4, span, div, p"));
    for (const el of textNodes) {
      const txt = (el.textContent || "").trim();
      const match = txt.match(/Currently\s+Editing\s+Design\s+(\d+)\s+of\s+(\d+)/i) ||
                    txt.match(/Design\s+(\d+)\s+of\s+(\d+)/i) ||
                    txt.match(/Editing\s+(\d+)\s*\/\s*(\d+)/i);
      if (match) {
        return {
          current: parseInt(match[1], 10),
          total: parseInt(match[2], 10)
        };
      }
    }
    const stepIndicators = document.querySelectorAll(".bulk-uploader-step, .m-step, [class*='counter']");
    for (const el of stepIndicators) {
      const txt = (el.textContent || "").trim();
      const match = txt.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        return {
          current: parseInt(match[1], 10),
          total: parseInt(match[2], 10)
        };
      }
    }
    return null;
  }

  function setNativeValue(element, value) {
    if (!element) return;
    const proto = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getTaggleTextInput() {
    const secContainer = document.querySelector("#secondary_tags");
    if (!secContainer) return null;
    return secContainer.querySelector('input.taggle_input, input[type="text"]');
  }

  // ==================== AUTOPILOT CORE WORKFLOW ====================

  async function startAutopilotFlow() {
    if (!extensionEnabled) {
      showToast("Extension is OFF. Switch ON to run Autopilot.", "warning");
      return;
    }
    if (isAutopilotRunning) {
      showToast("Autopilot is already running!", "info");
      return;
    }

    const studioData = await syncQueueFromStudio();
    if (!cachedQueue.length) {
      showToast("No confirmed designs in Studio Queue! Import CSV & Images on port 5050.", "warning");
      return;
    }

    const batch = cachedQueue.slice(0, 50);
    const total = batch.length;

    isAutopilotRunning = true;
    abortController = new AbortController();

    try {
      const url = window.location.href;
      const isEditingFormVisible = Boolean(
        document.querySelector('#design_design_title, input[name="design[design_title]"], input[placeholder="Title"]')
      );
      const isDropzoneVisible = Boolean(
        document.querySelector('input[type="file"], .dz-hidden-input, .dropzone')
      ) && !isEditingFormVisible;

      // STEP 1: Navigate to Bulk Uploader if not already there
      if (!url.includes("/designs/bulk_uploader") && !url.includes("/upload-art") && !isEditingFormVisible && !isDropzoneVisible) {
        sendProgress(1, 5, 0, total, `Navigating to Bulk Uploader (${total} designs)...`, true, false);
        await chrome.storage.local.set({
          pendingAutopilotResume: true,
          pendingBatchSession: Date.now()
        });
        window.location.href = TEEPUBLIC_BULK_URL;
        return;
      }

      // Clear resume flag immediately so page reloads never cause infinite loops
      await chrome.storage.local.remove(["pendingAutopilotResume"]);

      // If on /upload-art selection screen, click "Multi-File Upload"
      const multiBtn = Array.from(document.querySelectorAll("a, button, div")).find(
        (el) => /Multi-File Upload/i.test(el.textContent || "") && el.offsetParent !== null
      );
      if (multiBtn && !isDropzoneVisible && !isEditingFormVisible) {
        sendProgress(1, 8, 0, total, "Selecting Multi-File Upload...", true, false);
        await chrome.storage.local.set({ pendingAutopilotResume: true });
        multiBtn.click();
        return;
      }

      // STEP 2 & 3: Inject all batch PNGs into Dropzone & Wait for S3 Upload
      if (!isEditingFormVisible) {
        await injectBatchFilesToDropzone(batch);
        await waitForGetStartedAndClick(total);
      }

      // STEP 4 & 5: Loop sequentially through all designs in the batch
      await processAllDesignsInBatch(batch);

      // STEP 6: Final Publish All
      await finalizeAndPublishBatch(total);

    } catch (err) {
      if (err && err.message === "AUTOPILOT_ABORTED") {
        console.log("[Magic Fabrica] Autopilot cleanly aborted by user.");
      } else {
        console.error("[Magic Fabrica] Autopilot Error:", err);
        showToast(`Autopilot stopped: ${err.message || "Unexpected error"}`, "warning");
        sendProgress(0, 0, 0, total, `Stopped: ${err.message || "Error"}`, false, false);
      }
    } finally {
      isAutopilotRunning = false;
      abortController = null;
      await chrome.storage.local.remove(["pendingAutopilotResume"]);
    }
  }

  async function injectBatchFilesToDropzone(batch) {
    checkAborted();
    const total = batch.length;
    sendProgress(2, 12, 0, total, `Preparing 0 / ${total} artwork files...`, true, false);

    let fileInput = document.querySelector('input.dz-hidden-input, input[type="file"][multiple], input[type="file"]');
    if (!fileInput) {
      for (let w = 0; w < 20; w++) {
        await sleep(500);
        fileInput = document.querySelector('input.dz-hidden-input, input[type="file"][multiple], input[type="file"]');
        if (fileInput) break;
      }
    }
    if (!fileInput) {
      throw new Error("Could not find TeePublic file upload dropzone.");
    }

    // Fetch files sequentially with live progress so 25+ high-res PNGs never choke browser memory
    const dataTransfer = new DataTransfer();
    for (let i = 0; i < total; i++) {
      checkAborted();
      const d = batch[i];
      const prepPct = 10 + Math.round(((i + 1) / total) * 15);
      sendProgress(2, prepPct, i + 1, total, `Loading artwork ${i + 1} / ${total}: ${d.file_name}`, true, false);

      const artRes = await chrome.runtime.sendMessage({
        action: "FETCH_ARTWORK_BASE64",
        index: d.zero_index ?? i
      });

      if (!artRes || !artRes.success || !artRes.dataUrl) {
        throw new Error(`Could not load artwork #${i + 1} (${d.file_name}) from Studio.`);
      }

      const fetchRes = await fetch(artRes.dataUrl);
      const blob = await fetchRes.blob();
      const cleanName = d.file_name && d.file_name.toLowerCase().endsWith(".png")
        ? d.file_name
        : `${d.file_name || `design_${i + 1}`}.png`;
      const fileObj = new File([blob], cleanName, { type: "image/png", lastModified: Date.now() });
      dataTransfer.items.add(fileObj);
      await sleep(60);
    }

    checkAborted();
    sendProgress(2, 26, total, total, `Injecting ${total} artworks into TeePublic S3 uploader...`, true, false);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function waitForGetStartedAndClick(total) {
    checkAborted();
    // Dynamic timeout: 60s base + 12s per design so 25 designs have up to 6 minutes on slower connections
    const maxWaitSeconds = Math.max(90, 60 + total * 12);

    for (let sec = 0; sec < maxWaitSeconds; sec++) {
      checkAborted();

      const dzPreviews = document.querySelectorAll(".dz-preview.dz-success, .dz-complete, .bulk-uploader-image");
      const uploadedSoFar = Math.min(total, dzPreviews.length || 0);
      const uploadPct = 26 + Math.min(18, Math.round(((sec + 1) / Math.min(maxWaitSeconds, 45)) * 18));

      sendProgress(
        3,
        uploadPct,
        uploadedSoFar > 0 ? uploadedSoFar : 0,
        total,
        uploadedSoFar > 0
          ? `Uploading to TeePublic S3 (${uploadedSoFar} / ${total} complete)...`
          : `Uploading ${total} designs to TeePublic S3 (${sec}s)...`,
        true,
        false
      );

      const bodyUpper = (document.body?.innerText || "").toUpperCase();
      const getStartedBtn =
        document.querySelector(".jsS3BulkUploaderSubmit, button.get-started-button, [data-test='get-started']") ||
        Array.from(document.querySelectorAll("button, a, input[type='submit'], input[type='button']")).find(
          (el) => /GET\s+STARTED/i.test(el.textContent || el.value || "") && el.offsetParent !== null
        );

      const isAlreadyOnForm = Boolean(
        document.querySelector('#design_design_title, input[name="design[design_title]"], input[placeholder="Title"]')
      );
      if (isAlreadyOnForm) {
        return;
      }

      if (getStartedBtn && !getStartedBtn.disabled && (bodyUpper.includes("UPLOADS COMPLETE") || getStartedBtn.offsetParent !== null)) {
        sendProgress(3, 45, total, total, "Uploads complete! Clicking GET STARTED...", true, false);
        await sleep(600);
        getStartedBtn.click();

        // Wait for form to appear
        for (let waitForm = 0; waitForm < 30; waitForm++) {
          checkAborted();
          await sleep(500);
          if (document.querySelector('#design_design_title, input[name="design[design_title]"], input[placeholder="Title"]')) {
            await sleep(800);
            return;
          }
        }
      }

      await sleep(1000);
    }

    throw new Error(`S3 Dropzone upload timed out after ${maxWaitSeconds} seconds.`);
  }

  async function processAllDesignsInBatch(batch) {
    const queueTotal = batch.length;
    const domCounter = getActiveEditingIndices();
    const totalToProcess = domCounter ? Math.min(queueTotal, domCounter.total) : queueTotal;
    const startIdx = domCounter && domCounter.current > 1 ? domCounter.current - 1 : 0;

    for (let i = startIdx; i < totalToProcess; i++) {
      checkAborted();
      const design = batch[i];
      const humanIndex = i + 1;

      // Calculate accurate percentage between 45% and 95%
      const basePct = 45 + Math.round(((humanIndex - 0.5) / totalToProcess) * 48);

      // STEP 4: Fill Metadata & Tags
      sendProgress(
        4,
        basePct,
        humanIndex,
        totalToProcess,
        `[${humanIndex} / ${totalToProcess}] Filling metadata: "${(design.title || design.file_name).slice(0, 28)}..."`,
        true,
        false
      );

      await fillSingleDesignMetadata(design);
      await sleep(300);

      // STEP 5: Configure Garment & 14 Product Colors
      const colorPct = 45 + Math.round((humanIndex / totalToProcess) * 48);
      sendProgress(
        5,
        colorPct,
        humanIndex,
        totalToProcess,
        `[${humanIndex} / ${totalToProcess}] Setting colors & 14 products (${design.default_color || "Black"})...`,
        true,
        false
      );

      await configureSingleDesignColorsAndToggles(design);
      await sleep(400);

      // Advance to NEXT DESIGN if not on the last design
      if (i < totalToProcess - 1) {
        checkAborted();
        const nextBtn = findNextDesignButton();
        if (nextBtn) {
          sendProgress(
            5,
            colorPct,
            humanIndex,
            totalToProcess,
            `[${humanIndex} / ${totalToProcess}] Completed! Advancing to Design ${humanIndex + 1} of ${totalToProcess}...`,
            true,
            false
          );
          const beforeCounter = getActiveEditingIndices()?.current || humanIndex;
          nextBtn.click();

          // Wait until TeePublic transitions the form to Design X+1
          for (let waitStep = 0; waitStep < 25; waitStep++) {
            checkAborted();
            await sleep(350);
            const nowCounter = getActiveEditingIndices()?.current;
            const titleEl = document.querySelector('#design_design_title, input[name="design[design_title]"], input[placeholder="Title"]');
            if ((nowCounter && nowCounter > beforeCounter) || (titleEl && titleEl.value === "")) {
              break;
            }
          }
          await sleep(350);
        }
      }
    }
  }

  async function fillSingleDesignMetadata(design) {
    checkAborted();

    // 1. Title
    const titleEl = document.querySelector(
      '#design_design_title, input[name="design[design_title]"], input[name="design[title]"], input[placeholder="Title"]'
    );
    if (titleEl) {
      setNativeValue(titleEl, design.title || "");
    }

    // 2. Description
    const descEl = document.querySelector(
      '#design_design_description, textarea[name="design[design_description]"], textarea[name="design[description]"], textarea[placeholder*="Description"]'
    );
    if (descEl) {
      setNativeValue(descEl, design.description || "");
    }

    // 3. Main Tag
    const mainTagEl = document.querySelector(
      '#design_primary_tag, input[name="design[primary_tag]"], input[name="design[main_tag]"], input[placeholder*="Main Tag"]'
    );
    if (mainTagEl) {
      const cleanMain = (design.main_tag || "").trim().replace(/^#/, "");
      setNativeValue(mainTagEl, cleanMain);
      mainTagEl.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    // 4. Supporting Tags (Taggle + native typing + DOM check + fallback)
    await fillSupportingTagsReliably(design.supporting_tags, design.main_tag);

    // 5. Mature Content Flag (Default: No)
    const isMature = String(design.mature_content || "no").toLowerCase() === "yes";
    const matureRadio = document.querySelector(
      isMature
        ? '#design_content_flag_true, input[name*="content_flag"][value="true"], input[name*="content_flag"][value="1"]'
        : '#design_content_flag_false, input[name*="content_flag"][value="false"], input[name*="content_flag"][value="0"]'
    );
    if (matureRadio && !matureRadio.checked) {
      matureRadio.click();
    }

    // 6. Print Placement (Front / Back)
    const placement = String(design.print_placement || "front").toLowerCase();
    const placementRadio = document.querySelector(
      placement.includes("back")
        ? '#design_print_location_back, input[value="back"]'
        : '#design_print_location_front, input[value="front"]'
    );
    if (placementRadio && !placementRadio.checked) {
      placementRadio.click();
    }
  }

  async function fillSupportingTagsReliably(suppTagsVal, mainTagVal = "") {
    if (!suppTagsVal) return;
    const normalizedMainTag = (mainTagVal || "").trim().toLowerCase().replace(/^#+/, "");
    const seen = new Set();
    const rawTags = suppTagsVal.split(",")
      .map((t) => t.trim().replace(/^#+/, "").trim())
      .filter(Boolean);

    const tags = [];
    for (const raw of rawTags) {
      const lower = raw.toLowerCase();
      const clean = raw.substring(0, 39);
      if (!clean) continue;
      if (normalizedMainTag && lower === normalizedMainTag) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      tags.push(clean);
      if (tags.length >= 15) break;
    }

    if (tags.length === 0) return;

    // Clear existing taggles if any
    try {
      const clearScript = document.createElement("script");
      clearScript.textContent = `
        (function() {
          try {
            if (window.secondaryTagsForm && typeof window.secondaryTagsForm.removeAll === 'function') {
              window.secondaryTagsForm.removeAll();
            }
          } catch (_) {}
        })();
      `;
      (document.head || document.documentElement).appendChild(clearScript);
      clearScript.remove();
    } catch (_) {}

    document.querySelectorAll("#secondary_tags .taggle .close").forEach((btn) => btn.click());
    await sleep(80);

    const taggleInput = getTaggleTextInput();
    const plainTextarea = document.querySelector(
      'textarea[name*="secondary_tags"], input[name*="secondary_tags"], textarea[placeholder*="commas to separate"]'
    );

    if (taggleInput) {
      for (const tag of tags) {
        checkAborted();
        taggleInput.focus();
        setNativeValue(taggleInput, tag);
        await sleep(50);

        // Dispatch Comma & Enter
        taggleInput.dispatchEvent(new KeyboardEvent("keydown", { key: ",", code: "Comma", keyCode: 188, which: 188, bubbles: true }));
        taggleInput.dispatchEvent(new KeyboardEvent("keypress", { key: ",", code: "Comma", keyCode: 188, which: 188, bubbles: true }));
        taggleInput.dispatchEvent(new KeyboardEvent("keyup", { key: ",", code: "Comma", keyCode: 188, which: 188, bubbles: true }));

        // Check if added
        let hasTag = Array.from(document.querySelectorAll('#secondary_tags input[name="design[secondary_tags][]"]'))
          .some((inp) => inp.value.toLowerCase() === tag.toLowerCase());

        if (!hasTag) {
          taggleInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
          taggleInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
        }

        hasTag = Array.from(document.querySelectorAll('#secondary_tags input[name="design[secondary_tags][]"]'))
          .some((inp) => inp.value.toLowerCase() === tag.toLowerCase());

        // Script injection fallback
        if (!hasTag) {
          try {
            const addScript = document.createElement("script");
            addScript.textContent = `
              (function() {
                try {
                  if (window.secondaryTagsForm && typeof window.secondaryTagsForm.add === 'function') {
                    window.secondaryTagsForm.add(${JSON.stringify(tag)});
                  }
                } catch (_) {}
              })();
            `;
            (document.head || document.documentElement).appendChild(addScript);
            addScript.remove();
          } catch (_) {}
        }
        await sleep(60);
      }
    } else if (plainTextarea) {
      setNativeValue(plainTextarea, tags.join(", "));
    }
  }

  async function configureSingleDesignColorsAndToggles(design) {
    checkAborted();

    const productColors = design.product_colors || {};
    const defaultColor = design.default_color || productColors["T-Shirt"] || "Black";
    const colorPref = String(design.color_preference || "all").toLowerCase();

    // 1. Primary T-Shirt Default Color Dropdown (ddSlick)
    const colorDropdowns = document.querySelectorAll('.dd-container, select[name*="default_color"]');
    for (const dd of colorDropdowns) {
      if (dd.tagName === "SELECT") {
        const opt = Array.from(dd.options).find((o) => o.text.trim().toLowerCase() === defaultColor.toLowerCase());
        if (opt) {
          dd.value = opt.value;
          dd.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } else {
        const selectedText = dd.querySelector(".dd-selected-text");
        if (selectedText && selectedText.textContent.trim().toLowerCase() !== defaultColor.toLowerCase()) {
          const ddOption = Array.from(dd.querySelectorAll(".dd-option-text")).find(
            (o) => o.textContent.trim().toLowerCase() === defaultColor.toLowerCase()
          );
          if (ddOption) {
            ddOption.click();
            await sleep(80);
          }
        }
      }
    }

    // 2. Apparel Color Palette Checkboxes (All / Dark / Light)
    if (colorPref !== "all") {
      const colorCheckboxes = document.querySelectorAll('input[type="checkbox"][name*="color"]');
      const lightNames = ["white", "heather", "creme", "natural", "yellow"];
      for (const cb of colorCheckboxes) {
        const label = cb.closest("label") || cb.parentElement;
        const colorName = (label?.textContent || cb.value || "").toLowerCase();
        const isLight = lightNames.some((l) => colorName.includes(l));
        if (colorPref === "dark" && isLight && cb.checked) {
          cb.click();
        } else if (colorPref === "light" && !isLight && cb.checked) {
          cb.click();
        }
      }
    }

    // 3. Product Toggles (Enable / Disable items)
    const productToggles = design.product_toggles || {};
    for (const [prodName, isEnabled] of Object.entries(productToggles)) {
      if (isEnabled === false) {
        const prodLabel = Array.from(document.querySelectorAll("label, .m-product-title, .c-product-card__title")).find(
          (l) => l.textContent.trim().toLowerCase() === prodName.toLowerCase()
        );
        if (prodLabel) {
          const toggle = prodLabel.closest(".m-product-card, .c-product-card")?.querySelector('input[type="checkbox"]');
          if (toggle && toggle.checked) {
            toggle.click();
          }
        }
      }
    }
  }

  function findNextDesignButton() {
    return (
      document.querySelector('button.next-design-button, .js-next-design, input[value="Next Design" i]') ||
      Array.from(document.querySelectorAll("button, a, input[type='button'], input[type='submit']")).find(
        (el) => /Next\s+Design/i.test(el.textContent || el.value || "") && el.offsetParent !== null
      )
    );
  }

  async function finalizeAndPublishBatch(total) {
    checkAborted();
    sendProgress(6, 98, total, total, `Finalizing & publishing all ${total} designs...`, true, false);

    const termsCheckbox = document.querySelector('#terms, input[name="terms"], input[type="checkbox"][name*="agree"]');
    if (termsCheckbox && !termsCheckbox.checked) {
      termsCheckbox.click();
      await sleep(200);
    }

    const publishBtn =
      document.querySelector('button.publish-and-promote-button, input[value="Publish All" i], input[value="Publish" i]') ||
      Array.from(document.querySelectorAll("button, input[type='submit'], a")).find(
        (el) => /\bPublish(\s+All|\s+Designs)?\b/i.test(el.textContent || el.value || "") && el.offsetParent !== null
      );

    // Mark batch completed BEFORE clicking publish so page redirect never restarts the batch!
    await chrome.storage.local.remove(["pendingAutopilotResume"]);
    sendProgress(6, 100, total, total, `Batch complete! Published ${total} / ${total} designs.`, false, true);
    showToast(`All ${total} designs configured & published!`, "success");

    if (publishBtn) {
      await sleep(400);
      publishBtn.click();
    }
  }

  // ==================== COMPETITOR TAG & TITLE SCRAPER ====================

  function normalizeHeaderProbe(header) {
    if (!header) return "";
    return header
      .replace(/[\u2018\u2019\u201A\u201B\u2032'`´]/g, "'")
      .trim()
      .toLowerCase();
  }

  function cleanScrapedTag(t) {
    if (!t) return "";
    return t
      .replace(/^#+/, "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .toLowerCase();
  }

  function isInvalidOrUnrelatedTag(tag) {
    if (!tag || tag.length < 2 || tag.length > 39) return true;
    const lower = tag.toLowerCase();
    const badExact = new Set(["t-shirt", "teepublic", "tee public", "shirt", "apparel", "clothing", "shop all", "view all"]);
    if (badExact.has(lower)) return true;
    const badFragments = ["customer also", "trending", "explore similar", "more from", "size chart", "free return", "guarantee"];
    if (badFragments.some((frag) => lower.includes(frag))) return true;
    return false;
  }

  function extractArtistAppliedTagsStrictly(doc = document) {
    const extractedTags = [];

    // 1. Locate the exact "Artist's Applied Tags" heading element with normalized quotes
    const allHeaders = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6, div, p, span, strong, b, label"));
    let appliedHeader = null;

    for (const el of allHeaders) {
      const rawTxt = el.textContent || "";
      if (rawTxt.length > 60) continue;
      const norm = normalizeHeaderProbe(rawTxt);
      if (
        norm === "artist's applied tags" ||
        norm === "artist applied tags" ||
        norm.startsWith("artist's applied tags") ||
        norm.startsWith("artist applied tags")
      ) {
        appliedHeader = el;
        break;
      }
    }

    if (!appliedHeader) {
      for (const el of allHeaders) {
        const rawTxt = el.textContent || "";
        if (rawTxt.length > 70) continue;
        const norm = normalizeHeaderProbe(rawTxt);
        if (norm.includes("artist's applied tags") || norm.includes("artist applied tags")) {
          if (el.children.length <= 2) {
            appliedHeader = el;
            break;
          }
        }
      }
    }

    // 2. Identify the SINGLE direct tags container following the header
    let tagsContainer = null;
    if (appliedHeader) {
      const nextSib = appliedHeader.nextElementSibling;
      if (nextSib) {
        const pills = nextSib.querySelectorAll("a, button, [data-tag], .tag, .pill");
        if (pills.length > 0) tagsContainer = nextSib;
      }

      if (!tagsContainer && appliedHeader.parentElement && appliedHeader.parentElement.nextElementSibling) {
        const parentSib = appliedHeader.parentElement.nextElementSibling;
        const pills = parentSib.querySelectorAll("a, button, [data-tag], .tag, .pill");
        if (pills.length > 0) tagsContainer = parentSib;
      }

      if (!tagsContainer && appliedHeader.parentElement) {
        let passedHeader = false;
        for (const child of appliedHeader.parentElement.children) {
          if (child === appliedHeader || child.contains(appliedHeader)) {
            passedHeader = true;
            continue;
          }
          if (!passedHeader) continue;
          const pills = child.querySelectorAll("a, button, [data-tag], .tag, .pill");
          if (pills.length > 0) {
            tagsContainer = child;
            break;
          }
        }
      }
    }

    // 3. Extract pills strictly from that single container
    if (tagsContainer) {
      const pills = tagsContainer.querySelectorAll("a, button, [data-tag], .tag, .pill, span");
      for (const p of pills) {
        if (p.children.length > 1) continue;
        const clean = cleanScrapedTag(p.textContent || "");
        if (clean && !isInvalidOrUnrelatedTag(clean)) {
          extractedTags.push(clean);
        }
      }
    }

    // Fallback: If header was not found, check standard metadata or scoped container
    if (extractedTags.length === 0) {
      const scoped = doc.querySelector('.m-design__tags, [data-test="applied-tags"], .c-design-tags');
      if (scoped) {
        scoped.querySelectorAll("a").forEach((a) => {
          const clean = cleanScrapedTag(a.textContent || "");
          if (clean && !isInvalidOrUnrelatedTag(clean)) {
            extractedTags.push(clean);
          }
        });
      }
    }

    // Fallback: Meta keywords
    if (extractedTags.length === 0) {
      const metaKw = doc.querySelector('meta[name="keywords"]');
      if (metaKw && metaKw.content) {
        metaKw.content.split(",").forEach((k) => {
          const clean = cleanScrapedTag(k);
          if (clean && !isInvalidOrUnrelatedTag(clean)) {
            extractedTags.push(clean);
          }
        });
      }
    }

    // 4. Deduplicate and filter out numbered variants (e.g. "christmas puns 1" when "christmas puns" exists)
    const seen = new Set(extractedTags);
    const finalTags = [];
    for (const tag of extractedTags) {
      const parts = tag.rsplit ? tag.rsplit(" ", 1) : tag.split(" ");
      if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        const basePart = parts.slice(0, -1).join(" ");
        if (/^\d+$/.test(lastPart) && seen.has(basePart)) {
          continue;
        }
      }
      if (!finalTags.includes(tag)) {
        finalTags.push(tag);
      }
    }

    // Hard platform limit: max 15 tags
    return finalTags.slice(0, 15);
  }

  function scrapeCurrentTeePublicListing() {
    if (!scraperEnabled) {
      showToast("Tag Scraper is turned OFF.", "warning");
      return null;
    }

    // 1. Extract Title
    const h1 = document.querySelector("h1.m-design__title, h1[class*='title'], h1");
    let rawTitle = h1 ? h1.textContent.trim() : document.title.split("|")[0].trim();
    rawTitle = rawTitle
      .replace(/\s+(T-Shirt|Shirt|Sticker|Hoodie|Mug|Poster|Tapestry|Tank Top|Sweatshirt|Apparel)\s*$/i, "")
      .trim();

    // 2. Extract Store / Artist Name
    const storeEl = document.querySelector(
      ".m-design__author a, a[href*='/user/'], .c-design-header__artist a, [data-test='artist-link']"
    );
    const storeName = storeEl ? storeEl.textContent.trim() : "TeePublic Artist";

    // 3. Extract Tags strictly from Artist's Applied Tags container
    const tags = extractArtistAppliedTagsStrictly(document);

    if (!rawTitle && tags.length === 0) {
      showToast("No TeePublic design listing detected on this page.", "warning");
      return null;
    }

    return {
      id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      url: window.location.href,
      title: rawTitle || "Untitled Design",
      store: storeName,
      mainTag: tags[0] || "",
      supportingTags: tags.slice(1).join(", "),
      allTags: tags,
      scrapedAt: new Date().toISOString()
    };
  }

  async function grabAndSaveCurrentListing() {
    const item = scrapeCurrentTeePublicListing();
    if (!item) return null;

    return new Promise((resolve) => {
      chrome.storage.local.get(["scrapedListings", "scrapedCompetitorDesigns"], (res) => {
        const list = Array.isArray(res.scrapedListings)
          ? res.scrapedListings
          : (Array.isArray(res.scrapedCompetitorDesigns) ? res.scrapedCompetitorDesigns : []);

        const existsIdx = list.findIndex(
          (x) => x.url === item.url || (x.title && x.title.toLowerCase() === item.title.toLowerCase())
        );

        if (existsIdx >= 0) {
          list[existsIdx] = { ...list[existsIdx], ...item };
        } else {
          list.push(item);
        }

        scrapedCount = list.length;
        chrome.storage.local.set({ scrapedListings: list, scrapedCompetitorDesigns: list }, () => {
          updateQuickGrabBadge(scrapedCount, true);
          showToast(`Grabbed "${item.title.slice(0, 28)}..." (${item.allTags.length} artist tags)`, "success");
          resolve({ item, totalCount: list.length });
        });
      });
    });
  }

  // ==================== FLOATING HUD & TOAST UI ====================

  function showToast(msg, type = "info", duration = 3000) {
    let toast = document.getElementById("tp-companion-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "tp-companion-toast";
      document.body.appendChild(toast);
    }

    const icon = type === "success" ? "✓" : type === "warning" ? "⚠️" : "⚡";
    const iconColor = type === "success" ? "#34D399" : type === "warning" ? "#FBBF24" : "#38BDF8";
    const borderColor = type === "success" ? "rgba(52, 211, 153, 0.7)" : type === "warning" ? "rgba(245, 158, 11, 0.7)" : "rgba(56, 189, 248, 0.7)";
    const glowColor = type === "success" ? "rgba(52, 211, 153, 0.35)" : type === "warning" ? "rgba(245, 158, 11, 0.35)" : "rgba(56, 189, 248, 0.35)";

    toast.className = `toast-${type}`;
    toast.style.cssText = `
      position: fixed !important;
      top: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) translateY(0) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 12px 24px !important;
      background: #0D1527 !important;
      border: 1px solid ${borderColor} !important;
      border-radius: 9999px !important;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 16px ${glowColor} !important;
      color: #FFFFFF !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 13.5px !important;
      font-weight: 600 !important;
      pointer-events: none !important;
      transition: opacity 0.25s ease, transform 0.25s ease !important;
      opacity: 1 !important;
    `;

    toast.innerHTML = `
      <span class="tp-toast-icon" style="display:inline-flex; align-items:center; justify-content:center; font-size:16px; color:${iconColor} !important;">${icon}</span>
      <span class="tp-toast-msg" style="color:#FFFFFF !important; font-size:13.5px !important; font-weight:600 !important; text-shadow:0 1px 2px rgba(0,0,0,0.8) !important;">${msg}</span>
    `;

    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(-10px)";
    }, duration);
  }

  function injectFloatingHud() {
    if (document.getElementById("mf-floating-hud")) return;

    const hud = document.createElement("div");
    hud.id = "mf-floating-hud";
    hud.innerHTML = `
      <div class="mf-hud-pill" id="mfHudPill">
        <div class="mf-hud-left">
          <span class="mf-hud-status-dot" id="mfHudDot"></span>
          <span class="mf-hud-logo">⚡ Magic Fabrica</span>
          <span class="mf-hud-step-text" id="mfHudStepText">Ready</span>
          <span class="mf-hud-counter" id="mfHudCounter">[0/0]</span>
        </div>
        <div class="mf-hud-progress-track">
          <div class="mf-hud-progress-fill" id="mfHudProgressFill" style="width: 0%"></div>
        </div>
        <div class="mf-hud-actions">
          <button class="mf-hud-btn mf-hud-btn-primary" id="mfHudBtnStart" title="Start Autopilot (Alt+F)">Start</button>
          <button class="mf-hud-btn mf-hud-btn-scrape" id="mfHudBtnScrape" title="Grab Listing & Tags (Alt+S)">
            Grab <span class="mf-hud-badge" id="mfHudScrapedBadge">0</span>
          </button>
          <label class="mf-hud-toggle-label" title="Enable / Disable Autopilot">
            <input type="checkbox" id="mfHudMasterToggle" checked />
            <span class="mf-hud-toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
    document.body.appendChild(hud);

    // Event Listeners
    document.getElementById("mfHudBtnStart").addEventListener("click", () => startAutopilotFlow());
    document.getElementById("mfHudBtnScrape").addEventListener("click", () => grabAndSaveCurrentListing());

    const toggle = document.getElementById("mfHudMasterToggle");
    toggle.addEventListener("change", () => {
      const enabled = toggle.checked;
      chrome.runtime.sendMessage({ action: "SET_EXTENSION_ENABLED", enabled });
      if (!enabled) {
        hardStopAutopilot("Autopilot Deactivated (OFF)");
      } else {
        extensionEnabled = true;
        showToast("Autopilot Enabled (ON)", "success");
      }
      syncHudToggleUI();
    });
  }

  function updateQuickGrabBadge(count, animate = false) {
    const badge = document.getElementById("mfHudScrapedBadge");
    if (!badge) return;
    badge.textContent = String(count);
    if (animate) {
      badge.classList.remove("mf-badge-pop");
      void badge.offsetWidth;
      badge.classList.add("mf-badge-pop");
    }
  }

  function syncHudToggleUI() {
    const toggle = document.getElementById("mfHudMasterToggle");
    if (toggle) toggle.checked = extensionEnabled;
    const hud = document.getElementById("mf-floating-hud");
    if (hud) hud.classList.toggle("mf-disabled", !extensionEnabled);
  }

  function updateHudUI(state) {
    const dot = document.getElementById("mfHudDot");
    const stepText = document.getElementById("mfHudStepText");
    const counter = document.getElementById("mfHudCounter");
    const fill = document.getElementById("mfHudProgressFill");
    const btnStart = document.getElementById("mfHudBtnStart");

    if (dot) dot.className = `mf-hud-status-dot ${state.isRunning ? "running" : state.batchCompleted ? "completed" : "idle"}`;
    if (stepText) stepText.textContent = state.statusLine || "Ready";
    if (counter) counter.textContent = `[${state.currentDesign || 0}/${state.totalDesigns || 0}]`;
    if (fill) fill.style.width = `${state.pct || 0}%`;
    if (btnStart) btnStart.textContent = state.isRunning ? "Running" : "Start";
  }

  // ==================== RUNTIME MESSAGING ====================

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.action) return false;

    if (msg.action === "HARD_ABORT_AUTOPILOT") {
      extensionEnabled = false;
      hardStopAutopilot("Autopilot Deactivated (OFF)");
      syncHudToggleUI();
      sendResponse({ success: true });
      return true;
    }

    if (msg.action === "EXTENSION_ACTIVATED") {
      extensionEnabled = true;
      syncHudToggleUI();
      sendResponse({ success: true });
      return true;
    }

    if (msg.action === "START_AUTOPILOT") {
      startAutopilotFlow();
      sendResponse({ success: true });
      return true;
    }

    if (msg.action === "SCRAPE_ACTIVE_TAB") {
      grabAndSaveCurrentListing().then((res) => {
        sendResponse({ success: Boolean(res), ...(res || {}) });
      });
      return true;
    }

    if (msg.action === "PREVIEW_ACTIVE_TAB") {
      const item = scrapeCurrentTeePublicListing();
      sendResponse({ success: Boolean(item), item });
      return true;
    }

    return false;
  });

  window.addEventListener("keydown", (e) => {
    if (e.altKey && e.code === "KeyF") {
      e.preventDefault();
      startAutopilotFlow();
    } else if (e.altKey && e.code === "KeyS") {
      e.preventDefault();
      grabAndSaveCurrentListing();
    }
  });

  // ==================== INITIALIZATION ====================

  injectFloatingHud();

  chrome.storage.local.get(
    ["extensionEnabled", "scraperEnabled", "autopilotState", "scrapedListings", "scrapedCompetitorDesigns", "pendingAutopilotResume"],
    async (res) => {
      extensionEnabled = res.extensionEnabled !== false;
      scraperEnabled = res.scraperEnabled !== false;
      const list = Array.isArray(res.scrapedListings)
        ? res.scrapedListings
        : (Array.isArray(res.scrapedCompetitorDesigns) ? res.scrapedCompetitorDesigns : []);
      scrapedCount = list.length;

      updateQuickGrabBadge(scrapedCount);
      syncHudToggleUI();

      await syncQueueFromStudio();

      if (res.autopilotState) {
        updateHudUI({
          ...res.autopilotState,
          totalDesigns: res.autopilotState.totalDesigns || cachedQueue.length
        });
      } else {
        updateHudUI({
          step: 0,
          pct: 0,
          currentDesign: 0,
          totalDesigns: cachedQueue.length,
          statusLine: `Ready (${cachedQueue.length} designs in queue)`
        });
      }

      // Only auto-resume if pendingAutopilotResume was explicitly set during Step 1 navigation
      if (extensionEnabled && res.pendingAutopilotResume) {
        await chrome.storage.local.remove(["pendingAutopilotResume"]);
        setTimeout(() => startAutopilotFlow(), 900);
      }
    }
  );
})();
