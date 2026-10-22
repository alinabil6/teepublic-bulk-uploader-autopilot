/**
 * TeePublic Bulk Uploader Companion — Master Autopilot Agent (Manifest V3)
 * Human-Paced Live Navigator:
 * 1. Always routes to canonical Bulk Uploader: https://www.teepublic.com/designs/bulk_uploader
 * 2. Injects artwork PNG & watches for visible green "Get Started"
 * 3. Clicks "Get Started" automatically
 * 4. Waits for listing editor to load (/designs/<id>/edit) with artwork verified
 * 5. Live human-paced scrolling & typing: Title, Main Tag, Suggestions Tags, Description, Colors
 * 6. Sets all 14 product backgrounds (Zero Validation Alerts!)
 * 7. Scrolls to Publish and clicks!
 */

let hudElement = null;
let keydownListener = null;
let isListingInProgress = false;

// Global tracker state
let currentTracker = {
  step: 1,
  pct: 0,
  msg: "Autopilot Ready"
};

// ===================================================================
// PRIVILEGED LOCAL API PROXY & BASE64 ENGINE
// Completely bypasses Tor Browser / Firefox HTTPS Mixed-Content blocking
// ===================================================================

function base64ToBlob(base64Data, contentType) {
  const byteCharacters = atob(base64Data);
  const byteArrays = [];
  const sliceSize = 32768;
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: contentType || 'image/png' });
}

// Proxied state fetcher via background script (works in all browsers)
async function apiGetStudioState() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: "FETCH_LOCAL_STATE" }, async (response) => {
        if (!chrome.runtime.lastError && response && response.success && response.state) {
          resolve(response.state);
          return;
        }
        // Direct fallback
        try {
          const direct = await fetch("http://127.0.0.1:5050/api/state");
          if (direct.ok) {
            const data = await direct.json();
            resolve(data);
            return;
          }
        } catch (_) {}
        resolve(null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

// Proxied thumbnail blob fetcher via background script
async function apiGetThumbnailBlob(index) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: "FETCH_LOCAL_THUMBNAIL", index: index }, async (response) => {
        if (!chrome.runtime.lastError && response && response.success && response.base64) {
          try {
            const blob = base64ToBlob(response.base64, response.mimeType || "image/png");
            resolve(blob);
            return;
          } catch (e) {
            console.warn("[Autopilot] base64 decode error:", e);
          }
        }
        // Direct fallback
        try {
          const direct = await fetch(`http://127.0.0.1:5050/api/thumbnail/${index}`);
          if (direct.ok) {
            const blob = await direct.blob();
            resolve(blob);
            return;
          }
        } catch (_) {}
        resolve(null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

// Suppress blocking page alerts (e.g. TeePublic premature upload warnings)
function suppressPageAlerts() {
  try {
    const script = document.createElement("script");
    script.textContent = `
      (function() {
        if (window.__tpAlertSuppressed) return;
        window.__tpAlertSuppressed = true;
        const _orig = window.alert;
        window.alert = function(msg) {
          console.warn("[Magic Fabrica - Intercepted TeePublic Alert]:", msg);
        };
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (_) {}
}

// Initialize when page is ready
(async function init() {
  const store = await chrome.storage.local.get({
    extensionEnabled: true,
    activeDesignIndex: 0,
    cachedDesigns: [],
    prefColorMode: "dark",
    prefPrintLocation: "front",
    prefMature: "no",
    prefDefaultColor: "Black",
    pendingAutoList: false,
    triggeredByPopupTimestamp: 0,
    advanceNextAfterFill: false,
    trackerState: null
  });

  const isEnabled = store.extensionEnabled !== false;

  // Always mount HUD with toggle
  mountHUD(store);
  if (isEnabled) {
    attachKeyboardShortcuts();
  }

  const pageType = getPageType();

  // HARD GUARANTEE: Opening Bulk Uploader directly MUST NEVER auto-run!
  // Wait until user explicitly clicks "START AUTOPILOT" (or triggers from popup).
  if (pageType === "BULK_DROPZONE") {
    // Only continue if the user explicitly clicked Start in popup less than 15s ago to navigate here
    const isRecentPopupNav = Boolean(store.triggeredByPopupTimestamp && (Date.now() - store.triggeredByPopupTimestamp < 15000));
    const continuationToken = sessionStorage.getItem("TP_PIPELINE_CONTINUING");
    const isContinuingNav = Boolean(continuationToken && (Date.now() - parseInt(continuationToken, 10) < 30000));

    if (isEnabled && store.pendingAutoList && (isRecentPopupNav || isContinuingNav)) {
      await chrome.storage.local.set({ triggeredByPopupTimestamp: 0 });
      sessionStorage.removeItem("TP_PIPELINE_CONTINUING");
      sessionStorage.setItem("TP_AUTOPILOT_ACTIVE_SESSION", Date.now().toString());
      showToast("🚀 TeePublic Autopilot Live! Executing upload...", "info", 2000);
      setTimeout(() => {
        executeMasterWorkflow(store.advanceNextAfterFill || false);
      }, 1200);
      return;
    }

    // Direct window open, tab restore, or manual visit: NEVER auto-run!
    await chrome.storage.local.set({ pendingAutoList: false, triggeredByPopupTimestamp: 0 });
    sessionStorage.removeItem("TP_AUTOPILOT_ACTIVE_SESSION");
    sessionStorage.removeItem("TP_PIPELINE_CONTINUING");
    return;
  }

  // For DESIGN_EDIT: Only auto-continue if this edit page is an active continuation
  // of an upload just completed in Bulk Uploader (< 90 seconds ago)
  const continuationToken = sessionStorage.getItem("TP_PIPELINE_CONTINUING");
  const isContinuingPipeline = Boolean(continuationToken && (Date.now() - parseInt(continuationToken, 10) < 90000));

  if (isEnabled && store.pendingAutoList && isContinuingPipeline && pageType === "DESIGN_EDIT") {
    sessionStorage.removeItem("TP_PIPELINE_CONTINUING");
    showToast("🚀 Continuing Autopilot to listing metadata...", "info", 2000);
    setTimeout(() => {
      executeMasterWorkflow(store.advanceNextAfterFill || false);
    }, 1200);
  } else {
    // Direct window open or fresh navigation: NEVER auto-run without user clicking!
    await chrome.storage.local.set({ pendingAutoList: false, triggeredByPopupTimestamp: 0 });
    sessionStorage.removeItem("TP_AUTOPILOT_ACTIVE_SESSION");
    sessionStorage.removeItem("TP_PIPELINE_CONTINUING");
  }
})();

// Listen for messages from popup or background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TOGGLE_EXTENSION") {
    const isEnabled = Boolean(message.enabled);
    applyHUDEnabledState(isEnabled);
    if (isEnabled) {
      attachKeyboardShortcuts();
    } else {
      detachKeyboardShortcuts();
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "START_AUTO_LISTING") {
    handleAutoListTrigger(Boolean(message.advanceNext));
    sendResponse({ success: true, started: true });
    return true;
  }

  if (message.action === "AUTOFILL_DESIGN") {
    handleAutoListTrigger(false);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "AUTOFILL_AND_NEXT") {
    handleAutoListTrigger(true);
    sendResponse({ success: true });
    return true;
  }
});

// Real-time synchronization across tabs and extension popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.extensionEnabled !== undefined) {
      const isEnabled = Boolean(changes.extensionEnabled.newValue);
      applyHUDEnabledState(isEnabled);
      if (isEnabled) {
        attachKeyboardShortcuts();
      } else {
        detachKeyboardShortcuts();
      }
    }
    if (changes.activeDesignIndex !== undefined || changes.cachedDesigns !== undefined) {
      chrome.storage.local.get(["cachedDesigns", "activeDesignIndex"], (data) => {
        updateHUDLabels(data.cachedDesigns?.[data.activeDesignIndex || 0], data.activeDesignIndex || 0, data.cachedDesigns?.length || 0);
      });
    }
  }
});

// ===================================================================
// PRECISE ROUTE & PAGE STATE CLASSIFICATION
// ===================================================================

function getPageType() {
  const path = window.location.pathname.toLowerCase();

  // Multi-upload bulk dropzone screen (/designs/bulk_uploader)
  if (path.includes("/designs/bulk_uploader") || path.includes("/bulk_uploader")) {
    return "BULK_DROPZONE";
  }

  // If on /designs/<id>/edit:
  if (path.includes("/designs/") && path.includes("/edit")) {
    // Check if the page is showing an empty "Upload A Design" dropzone (no artwork uploaded yet!)
    const emptyDropzone = document.querySelector('.m-uploader__dropzone-message, .jsUploaderDropzone, a[href*="bulk_uploader"]');
    const hasArtworkLoaded = document.querySelector('.img_holder img, .current-artwork, .mockup-display-preview.front[style*="url"], [data-canvas="tshirt"] img');

    if (emptyDropzone && !hasArtworkLoaded) {
      // Artwork is not loaded yet! Must go to Bulk Uploader!
      return "NAVIGATE_TO_BULK";
    }

    // If artwork is loaded and form title exists:
    if (document.querySelector('#design_design_title, input[name="design[design_title]"]')) {
      return "DESIGN_EDIT";
    }
  }

  // Any other page (Store, Profile, Landing, or Empty Upload): Go to Bulk Uploader!
  return "NAVIGATE_TO_BULK";
}

// Master Entry Point
async function handleAutoListTrigger(advanceNext = false) {
  const store = await chrome.storage.local.get({ extensionEnabled: true });
  if (store.extensionEnabled === false) {
    showToast("⚠️ Autopilot is turned OFF. Turn the toggle ON to start.", "warning", 3000);
    return;
  }

  if (isListingInProgress) {
    showToast("⚠️ Autopilot is currently navigating...", "warning");
    return;
  }

  // Explicit user trigger: authorize session token
  sessionStorage.setItem("TP_AUTOPILOT_ACTIVE_SESSION", Date.now().toString());

  const pageType = getPageType();

  // If on Store page, Landing, or an empty upload screen: Navigate directly to /designs/bulk_uploader!
  if (pageType === "NAVIGATE_TO_BULK") {
    updateTracker(1, 15, "Autopilot navigating to TeePublic Bulk Uploader...");
    showToast("📍 Navigating to TeePublic Bulk Uploader...", "info", 2000);

    sessionStorage.setItem("TP_PIPELINE_CONTINUING", Date.now().toString());
    await chrome.storage.local.set({
      pendingAutoList: true,
      advanceNextAfterFill: advanceNext
    });

    const topUploadBtn = document.querySelector('a[href*="bulk"], a[data-rudderstack-event-type="cta"], .vc-header__upload-art, a.btn-upload');
    const multiFileLink = document.querySelector('a[href*="bulk_uploader"], [data-rudderstack-link-label="Use Multi-File Uploader"]');

    if (multiFileLink) {
      multiFileLink.classList.add("tp-sitemap-target-glow");
    } else if (topUploadBtn) {
      topUploadBtn.classList.add("tp-sitemap-target-glow");
    }

    setTimeout(() => {
      window.location.href = "https://www.teepublic.com/designs/bulk_uploader";
    }, 600);
    return;
  }

  await executeMasterWorkflow(advanceNext);
}

// ===================================================================
// MASTER RECREATED AUTOPILOT WORKFLOW (LIVE HUMAN NAVIGATION)
// ===================================================================

async function executeMasterWorkflow(advanceNext = false) {
  isListingInProgress = true;
  updateHUDStatus("running", "⚙️ AUTOPILOT RUNNING");

  try {
    // 1. Fetch freshest design data from Local Studio
    updateTracker(1, 15, "Connecting to Local Queue Studio (port 5050)...");
    let designs = [];
    let design = null;
    let totalCount = 1;
    let curIdx = 0;

    try {
      const serverState = await apiGetStudioState();
      if (serverState && serverState.designs && serverState.designs.length > 0) {
        designs = serverState.designs;
        curIdx = serverState.current_index >= 0 ? serverState.current_index : 0;
        totalCount = designs.length;
        design = designs[curIdx] || null;

        await chrome.storage.local.set({
          cachedDesigns: designs,
          activeDesignIndex: curIdx
        });
      } else {
        throw new Error("No server state");
      }
    } catch (_) {
      const store = await chrome.storage.local.get({ cachedDesigns: [], activeDesignIndex: 0 });
      designs = store.cachedDesigns || [];
      curIdx = store.activeDesignIndex || 0;
      totalCount = designs.length;
      design = designs[curIdx] || null;
    }

    if (!design && designs.length === 0) {
      showToast("⚠️ No designs found in queue! Load a CSV in Desktop Studio first.", "warning", 4000);
      updateTracker(1, 0, "No designs in queue");
      updateHUDStatus("active", "● READY");
      isListingInProgress = false;
      return;
    }

    if (!design) design = designs[0];

    updateHUDLabels(design, curIdx, totalCount);
    let designTitle = design.title || design.file_name || `Design #${curIdx + 1}`;
    showToast(`🚀 Autopilot Live: "${designTitle.substring(0, 30)}..."`, "info", 2000);
    await sleep(400);

    const pageType = getPageType();

    // ===============================================================
    // WORKFLOW PART 1: UPLOAD ARTWORK (/designs/bulk_uploader)
    // ===============================================================
    if (pageType === "BULK_DROPZONE") {
      // Suppress disruptive page alerts (e.g. premature upload prompts)
      suppressPageAlerts();

      // Keep page firmly at top (NO erratic scrolling down to footer!)
      window.scrollTo({ top: 0, behavior: 'instant' });

      const fileInput = document.querySelector('input.jsBulkS3FileInput, input[type="file"]');
      const dropzone = document.querySelector('.m-uploader__upload-container, .current.jsBulkUploaderImages, #bulk_form, [data-test="dropzone"]');
      const localBlobUrls = [];
      const totalUploadCount = designs.length > 0 ? designs.length : 1;

      // Check if designs are ALREADY uploaded on the bulk uploader (e.g. user resumed or refreshed)
      const alreadyUploaded = hasUploadedArtworks();

      if (!alreadyUploaded && fileInput) {
        updateTracker(2, 25, `Preparing batch upload of ${totalUploadCount} design(s)...`);
        if (dropzone) dropzone.classList.add("tp-section-glow");

        const dt = new DataTransfer();

        for (let i = 0; i < totalUploadCount; i++) {
          const d = designs[i] || design || {};
          const fileName = d.file_name || `design_${i + 1}.png`;
          const pct = 25 + Math.round(((i + 1) / totalUploadCount) * 15);
          updateTracker(2, pct, `Attaching artwork #${i + 1}/${totalUploadCount}: ${fileName}`);

          try {
            const blob = await apiGetThumbnailBlob(i);
            if (blob) {
              const bUrl = URL.createObjectURL(blob);
              localBlobUrls.push(bUrl);
              const file = new File([blob], fileName, { type: blob.type || "image/png" });
              dt.items.add(file);
            }
          } catch (e) {
            console.warn(`File attach warning for index ${i}:`, e);
          }
        }

        if (dt.items.length > 0) {
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
          fileInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));

          if (dropzone) {
            const dtDrop = new DataTransfer();
            for (let i = 0; i < dt.files.length; i++) {
              dtDrop.items.add(dt.files[i]);
            }
            dropzone.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dtDrop, bubbles: true, composed: true }));
            dropzone.dispatchEvent(new DragEvent("dragover", { dataTransfer: dtDrop, bubbles: true, composed: true }));
            dropzone.dispatchEvent(new DragEvent("drop", { dataTransfer: dtDrop, bubbles: true, composed: true }));
          }

          // Trigger TeePublic jQuery handler in page world for Tor Browser & Firefox
          try {
            const scr = document.createElement("script");
            scr.textContent = `
              (function() {
                try {
                  var inp = document.querySelector('input.jsBulkS3FileInput, input[type="file"]');
                  if (inp && inp.files && inp.files.length > 0 && window.jQuery) {
                    window.jQuery(inp).trigger('change');
                  }
                } catch(e) {}
              })();
            `;
            (document.head || document.documentElement).appendChild(scr);
            scr.remove();
          } catch (_) {}

          showToast(`🖼️ Attached all ${dt.items.length} designs to Bulk Uploader!`, "success", 2500);
        } else {
          showToast("⚠️ Could not load designs from Desktop Studio. Check that Studio is running!", "warning", 4000);
        }

        await sleep(800);
        if (dropzone) dropzone.classList.remove("tp-section-glow");
      } else if (alreadyUploaded) {
        showToast("✓ Artwork designs already present on page. Watching for Get Started...", "info", 2500);
      }

      // Keep pending flag & session token so on the next page it resumes automatically!
      sessionStorage.setItem("TP_AUTOPILOT_ACTIVE_SESSION", Date.now().toString());
      await chrome.storage.local.set({
        pendingAutoList: true,
        advanceNextAfterFill: advanceNext
      });

      // Active Thumbnail Healer for all uploaded images
      function ensureThumbnailsVisible() {
        if (localBlobUrls.length === 0) return;
        const imgs = document.querySelectorAll('.jsBulkUploaderImages img, .img_holder img, .current img');
        imgs.forEach((img, idx) => {
          const fallbackUrl = localBlobUrls[idx % localBlobUrls.length];
          img.onerror = () => { img.src = fallbackUrl; };
          if (img.naturalWidth === 0 || img.naturalHeight === 0 || !img.src || img.src.includes('broken')) {
            img.src = fallbackUrl;
          }
          img.style.objectFit = 'contain';
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
          img.style.display = 'block';
        });
      }

      // Verify that TeePublic has actually rendered uploaded artwork elements in DOM
      function hasUploadedArtworks() {
        const imgs = document.querySelectorAll('.jsBulkUploaderImages img, .current img, .jsBulkUploaderImage, .img_holder img');
        if (imgs.length > 0) return true;
        const dropText = (document.querySelector('.jsBulkUploaderDropzone, .m-uploader__dropzone-message')?.textContent || '');
        if (dropText.includes('Uploads complete') || dropText.includes('Get Started')) return true;
        return false;
      }

      // Easily & reliably recognize whichever Get Started button is genuinely visible
      // HARD REQUIREMENT: Never return any button if zero images have completed uploading!
      function findVisibleGetStartedButton() {
        if (!hasUploadedArtworks()) {
          return null;
        }

        // 1. S3 Bulk Submit Button (TeePublic's modern uploader)
        const s3Btn = document.querySelector('.jsS3BulkUploaderSubmit');
        const s3Cont = document.querySelector('.jsS3BulkUploaderSubmitContainer');
        if (s3Btn) {
          const s3ContStyle = s3Cont ? window.getComputedStyle(s3Cont) : null;
          const btnStyle = window.getComputedStyle(s3Btn);
          if ((!s3ContStyle || s3ContStyle.display !== 'none') && btnStyle.display !== 'none' && s3Btn.offsetHeight > 0) {
            return { btn: s3Btn, type: 's3' };
          }
        }

        // 2. Regular Bulk Submit Button
        const bulkBtn = document.querySelector('.jsBulkUploaderSubmit');
        const bulkCont = document.querySelector('.jsBulkUploaderSubmitContainer');
        if (bulkBtn) {
          const bulkContStyle = bulkCont ? window.getComputedStyle(bulkCont) : null;
          const btnStyle = window.getComputedStyle(bulkBtn);
          if ((!bulkContStyle || bulkContStyle.display !== 'none') && btnStyle.display !== 'none' && bulkBtn.offsetHeight > 0) {
            return { btn: bulkBtn, type: 'bulk' };
          }
        }

        // 3. Fallback: Any visible element matching text "GET STARTED"
        const all = Array.from(document.querySelectorAll('.m-bulk-uploader__submit-button, .jsBulkUploaderSubmit, .jsS3BulkUploaderSubmit, [class*="BulkUploaderSubmit"], .btn--green, button, div, a'));
        for (const el of all) {
          const text = (el.innerText || el.textContent || el.value || '').trim().toUpperCase();
          if (text === 'GET STARTED' || text.includes('GET STARTED')) {
            const elStyle = window.getComputedStyle(el);
            const parentStyle = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
            if (elStyle.display !== 'none' && (!parentStyle || parentStyle.display !== 'none') && (el.offsetHeight > 0 || (el.parentElement && el.parentElement.offsetHeight > 0))) {
              const isS3 = el.classList.contains('jsS3BulkUploaderSubmit') || (el.parentElement && el.parentElement.classList.contains('jsS3BulkUploaderSubmitContainer'));
              return { btn: el, type: isS3 ? 's3' : 'bulk' };
            }
          }
        }
        return null;
      }

      // Force click Get Started without any unwanted scrolling or layout jumping
      function forceClickGetStarted(targetObj) {
        const targetBtn = targetObj && targetObj.btn ? targetObj.btn : targetObj;

        // 1. Isolated World native mouse & pointer events
        if (targetBtn) {
          targetBtn.classList.add("tp-sitemap-target-glow");
          const evts = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
          for (const ev of evts) {
            try { targetBtn.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window, buttons: 1, which: 1 })); } catch (_) {}
          }
          try { targetBtn.click(); } catch (_) {}

          if (targetBtn.parentElement) {
            for (const ev of evts) {
              try { targetBtn.parentElement.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window, buttons: 1, which: 1 })); } catch (_) {}
            }
            try { targetBtn.parentElement.click(); } catch (_) {}
          }
        }

        // 2. Main Page World script injection (triggers TeePublic's jQuery .on('click') handlers & direct S3 session AJAX)
        try {
          const script = document.createElement('script');
          script.textContent = `
            (function() {
              try {
                if (window.jQuery) {
                  window.jQuery('.jsS3BulkUploaderSubmitContainer').show();
                  window.jQuery('.jsBulkUploaderSubmitContainer').show();
                  window.jQuery('.jsS3BulkUploaderSubmit').trigger('click');
                  window.jQuery('.jsBulkUploaderSubmit').trigger('click');
                  window.jQuery('.m-bulk-uploader__submit-button').trigger('click');
                }

                var domBtns = document.querySelectorAll('.jsS3BulkUploaderSubmit, .jsBulkUploaderSubmit, .m-bulk-uploader__submit-button, .btn--green');
                domBtns.forEach(function(b) {
                  try { b.click(); } catch(e) {}
                });

                // Direct Session API Failsafe (for S3-based flow)
                if (window.jQuery && window.location.pathname.includes('bulk_uploader')) {
                  var ids = [];
                  window.jQuery('.jsBulkUploaderImages img, .current img').each(function() {
                    var dId = window.jQuery(this).attr('data-design-id') || window.jQuery(this).data('design_id');
                    if (dId && !isNaN(Number(dId))) ids.push(Number(dId));
                  });
                  if (ids.length > 0) {
                    var meta = document.querySelector('meta[name="csrf-token"]');
                    var csrf = meta && meta.getAttribute('content');
                    window.jQuery.ajax({
                      url: '/design/s3_bulk_uploader',
                      type: 'POST',
                      contentType: 'application/json; charset=UTF-8',
                      data: JSON.stringify({ design_ids: ids }),
                      headers: { 'X-CSRF-Token': csrf },
                      success: function() {
                        window.location.assign('/designs/' + ids[0] + '/edit');
                      }
                    });
                  }
                }
              } catch (err) {
                console.warn('[Autopilot Page World Click Error]', err);
              }
            })();
          `;
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch (_) {}
      }

      updateTracker(3, 35, `Processing ${totalUploadCount} design upload(s)... Watching for Get Started button`);
      showToast(`⏳ Watching for TeePublic upload completion...`, "info", 3000);

      let detectedBtnObj = null;

      // Generous 10-minute timeout (1200 * 500ms = 600s) for slow Tor relays & large batches
      for (let attempt = 0; attempt < 1200; attempt++) {
        ensureThumbnailsVisible();
        window.scrollTo({ top: 0, behavior: 'instant' });

        const uploadedCount = document.querySelectorAll('.jsBulkUploaderImages img, .current img, .jsBulkUploaderImage').length;
        if (uploadedCount > 0) {
          const pct = Math.min(58, 35 + Math.round((uploadedCount / totalUploadCount) * 23));
          updateTracker(3, pct, `TeePublic uploaded ${uploadedCount}/${totalUploadCount} design(s)...`);
        }

        detectedBtnObj = findVisibleGetStartedButton();
        if (detectedBtnObj) {
          break;
        }

        // Also check if TeePublic dropzone text says uploads are complete
        const dropzoneText = (document.querySelector('.jsBulkUploaderDropzone, .m-uploader__dropzone-message')?.textContent || '');
        if (dropzoneText.includes('Uploads complete') || dropzoneText.includes('Get Started')) {
          const s3Btn = document.querySelector('.jsS3BulkUploaderSubmit, .m-bulk-uploader__submit-button, .jsBulkUploaderSubmit');
          if (s3Btn) {
            detectedBtnObj = { btn: s3Btn, type: 's3' };
            break;
          }
        }

        await sleep(500);
      }

      ensureThumbnailsVisible();

      if (detectedBtnObj) {
        updateTracker(3, 60, "Get Started detected! Force clicking automatically...");
        showToast("🚀 'Get Started' detected! Force clicking automatically...", "info", 2000);

        if (detectedBtnObj.btn) {
          detectedBtnObj.btn.classList.add("tp-sitemap-target-glow");
        }
        await sleep(250);

        // Continuous clicking watcher: repeat every 800ms until redirection away from bulk_uploader
        updateTracker(3, 62, "Processing design batch... Redirecting to listing editor in a moment");
        showToast("⏳ Processing design batch... Waiting for listing editor to load...", "info", 3000);

        // Set pipeline continuing token so the subsequent edit form knows it was user-triggered
        sessionStorage.setItem("TP_PIPELINE_CONTINUING", Date.now().toString());
        await chrome.storage.local.set({ pendingAutoList: true });

        for (let wait = 0; wait < 120; wait++) {
          forceClickGetStarted(detectedBtnObj);
          await sleep(800);
          window.scrollTo({ top: 0, behavior: 'instant' });

          if (!window.location.pathname.includes("bulk_uploader")) {
            // Already navigated away from bulk_uploader to /designs/.../edit!
            return;
          }

          // If still on bulk_uploader, re-scan for button and retry
          const refreshed = findVisibleGetStartedButton();
          if (refreshed) {
            detectedBtnObj = refreshed;
          }
        }

        return; // Navigates to /designs/<id>/edit
      } else {
        showToast("✓ Artwork uploaded! Waiting for listing editor...", "info", 2000);
      }
    }

    // ===============================================================
    // WORKFLOW PART 2: FORM EDITOR (/designs/<id>/edit)
    // ===============================================================
    updateTracker(4, 65, "Waiting for Listing Form to load...");

    // Wait up to 20 seconds for the form to actually exist on the page!
    let titleEl = null;
    for (let wait = 0; wait < 40; wait++) {
      titleEl = document.querySelector('#design_design_title, input[name="design[design_title]"]');
      if (titleEl) break;
      await sleep(500);
    }

    if (!titleEl) {
      showToast("⚠️ Listing form is still loading. Please wait...", "warning", 3000);
      updateTracker(4, 65, "Waiting for form...");
      isListingInProgress = false;
      return;
    }

    // Detect bulk editor progress: e.g. "Currently Editing Design X of Y"
    const bulkProgress = getBulkEditorProgress();
    let isBulkMode = false;
    let isLastDesign = false;

    if (bulkProgress) {
      curIdx = bulkProgress.currentIndex; // 0-based
      totalCount = Math.max(bulkProgress.totalCount, designs.length);
      isBulkMode = true;
      isLastDesign = (curIdx >= totalCount - 1);
    } else {
      isBulkMode = false;
      isLastDesign = (curIdx >= totalCount - 1);
    }

    // Refresh design object for this exact index!
    design = (designs && designs[curIdx]) ? designs[curIdx] : ((designs && designs[0]) ? designs[0] : null);

    if (!design) {
      showToast(`⚠️ No design found in queue at index #${curIdx + 1}!`, "warning", 4000);
      isListingInProgress = false;
      return;
    }

    // Keep session active for the next design in the pipeline
    sessionStorage.setItem("TP_AUTOPILOT_ACTIVE_SESSION", Date.now().toString());
    await chrome.storage.local.set({
      activeDesignIndex: curIdx,
      pendingAutoList: true
    });

    updateHUDLabels(design, curIdx, totalCount);
    designTitle = design.title || design.file_name || `Design #${curIdx + 1}`;
    showToast(`📝 Autopilot [${curIdx + 1}/${totalCount}]: "${designTitle.substring(0, 24)}..."`, "info", 2000);
    await sleep(500);

    // 1. Live Typing Design Title
    const titleVal = design.title || "";
    if (titleVal && titleEl) {
      updateTracker(4, 68, `Writing Title: "${titleVal.substring(0, 24)}..."`);
      await humanType(titleEl, titleVal, "✓ Writing Design Title...");
    }

    // 2. Live Typing Main Tag
    const mainTagVal = design.main_tag || "";
    const mainTagEl = document.querySelector('#design_primary_tag, input[name="design[primary_tag]"]');
    if (mainTagVal && mainTagEl) {
      updateTracker(4, 72, `Writing Main Tag: "${mainTagVal}"`);
      await humanType(mainTagEl, mainTagVal, `✓ Setting Main Tag [${mainTagVal}]`);
    }

    // 3. Supporting Tags (Live Tag-by-Tag from TeePublic Autocomplete Suggestions)
    const suppTagsVal = design.supporting_tags || "";
    if (suppTagsVal) {
      await fillSupportingTagsWithSuggestionsLive(suppTagsVal);
    }

    // 4. Live Typing Description
    const descVal = design.description || "";
    const descEl = document.querySelector('#design_design_description, textarea[name="design[design_description]"]');
    if (descVal && descEl) {
      updateTracker(4, 82, "Writing Description...");
      await humanType(descEl, descVal, "✓ Writing Description...");
    }

    // 5. Mature Content Radio
    const isMature = String(design.mature_content || "no").toLowerCase() === "yes";
    const targetRadioId = isMature ? "design_content_flag_true" : "design_content_flag_false";
    const matureRadio = document.getElementById(targetRadioId);

    if (matureRadio) {
      matureRadio.scrollIntoView({ behavior: "smooth", block: "center" });
      matureRadio.checked = true;
      matureRadio.click();
      matureRadio.dispatchEvent(new Event("change", { bubbles: true }));
      updateTracker(4, 85, `Mature Content: ${isMature ? 'Yes' : 'No'}`);
      await sleep(300);
    }

    // ===============================================================
    // WORKFLOW PART 3: APPAREL, PLACEMENT & ALL 14 PRODUCT COLORS
    // ===============================================================
    updateTracker(5, 88, "Configuring Apparel, Colors & All 14 Product Backgrounds...");

    // 1. T-Shirt Print Placement
    const placement = (design.print_placement || "front").toLowerCase();
    const placementRadioId = placement === "back" ? "apparel_side_back" : "apparel_side_front";
    const placementRadio = document.getElementById(placementRadioId);
    if (placementRadio) {
      placementRadio.scrollIntoView({ behavior: "smooth", block: "center" });
      placementRadio.checked = true;
      placementRadio.click();
      placementRadio.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(250);
    }

    // 2. Extract Apparel & Product Settings from Studio Data for THIS specific design!
    const apparelSettings = design.apparel_settings || {};
    const productColors = design.product_colors || {};
    const productToggles = design.product_toggles || {};

    const defaultColor = apparelSettings["T-Shirt"]?.defaultColor 
                      || productColors["T-Shirt"] 
                      || design.default_color 
                      || "Black";
    const colorMode = (design.color_preference || "dark").toLowerCase();

    // 3. Sync Enabled / Disabled Product Toggles
    updateTracker(5, 89, "Syncing Enabled / Disabled Products with Studio...");
    await syncProductTogglesLive(apparelSettings, productToggles);
    await sleep(200);

    // 4. Select Garment Colors via ddSlick & Set Product Backgrounds (Zero Alerts!)
    updateTracker(5, 93, `Selecting Garment Colors (${defaultColor}) & Eliminating Alerts...`);
    await applyAllProductBackgroundColorsAndApparelLive(defaultColor, colorMode, apparelSettings, productColors);

    // ===============================================================
    // WORKFLOW PART 4: NOTICE & PUBLISH
    // ===============================================================
    updateTracker(6, 100, `Design #${curIdx + 1}/${totalCount} 100% Configured!`);
    updateHUDStatus("completed", "✓ READY TO PUB");

    showToast(`🎉 Design #${curIdx + 1}/${totalCount} configured!`, "success", 2500);
    await sleep(400);

    // Display the High-Visibility Notice Modal on screen
    showPublishNoticeModal({
      title: designTitle,
      mainTag: design.main_tag || "N/A",
      defaultColor: defaultColor,
      placement: placement.toUpperCase(),
      advanceNext: advanceNext || isBulkMode,
      curIdx: curIdx,
      totalCount: totalCount,
      isBulkMode: isBulkMode,
      isLastDesign: isLastDesign
    });

  } catch (err) {
    console.error("[TeePublic Autopilot] Pipeline error:", err);
    showToast("⚠️ Autopilot encountered an issue: " + err.message, "warning", 4000);
    updateTracker(currentTracker.step, currentTracker.pct, "Paused — please inspect");
    updateHUDStatus("active", "● READY");
  } finally {
    isListingInProgress = false;
  }
}

// ===================================================================
// HUMAN-PACED LIVE TYPING HELPER
// ===================================================================

async function humanType(el, text, toastMsg) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("tp-field-active");
  el.focus();
  el.value = "";

  if (toastMsg) {
    showToast(toastMsg, "info", 1200);
  }

  // Type smoothly so user actually watches the text appear live
  for (let i = 0; i < text.length; i++) {
    el.value += text[i];
    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (i % 3 === 0) {
      await sleep(18);
    }
  }

  el.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(200);
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  el.classList.remove("tp-field-active");
  el.classList.add("tp-field-success");
  setTimeout(() => el.classList.remove("tp-field-success"), 1000);
  await sleep(150);
}

// ===================================================================
// SUPPORTING TAGS WITH 100% STUDIO FIDELITY (ZERO SKIPPED TAGS)
// ===================================================================

async function fillSupportingTagsWithSuggestionsLive(suppTagsVal) {
  if (!suppTagsVal) return;
  updateTracker(4, 74, "Adding Supporting Tags from Studio...");

  const secTagsContainer = document.querySelector('#secondary_tags');
  if (secTagsContainer) {
    secTagsContainer.scrollIntoView({ behavior: "smooth", block: "center" });
    secTagsContainer.classList.add("tp-field-active");
  }

  // Parse studio tags (clean hashtags, trim whitespace)
  const tags = suppTagsVal.split(",")
    .map(t => t.trim().replace(/^#+/, ''))
    .filter(Boolean);

  if (tags.length === 0) return;

  // 1. Page-world cleanup: clear pre-existing generic tags so only studio tags exist
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

  await sleep(200);

  // 2. Add each studio tag one by one with live visual feedback
  let addedCount = 0;

  for (let idx = 0; idx < tags.length; idx++) {
    const tag = tags[idx];
    const secInput = document.querySelector('#secondary_tags input.taggle_input, #secondary_tags input, #secondary_tags textarea');

    if (secInput) {
      secInput.focus();
      secInput.value = "";

      // Smooth visual typing simulation for human review
      for (let c = 0; c < tag.length; c++) {
        secInput.value += tag[c];
        secInput.dispatchEvent(new Event("input", { bubbles: true }));
        if (c % 2 === 0) await sleep(15);
      }
      secInput.dispatchEvent(new Event("change", { bubbles: true }));

      // Check if autocomplete shows an EXACT match for this tag
      let exactMatchFound = false;
      const autoItems = Array.from(document.querySelectorAll('ul.ui-autocomplete li.ui-menu-item, .ui-menu-item-wrapper'));
      for (const item of autoItems) {
        const itemText = (item.textContent || "").trim().toLowerCase();
        if (itemText === tag.toLowerCase()) {
          exactMatchFound = true;
          try {
            item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, which: 1 }));
            item.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, which: 1 }));
            item.click();
          } catch (_) {}
          break;
        }
      }

      // If no exact match clicked, add directly via Taggle API + native comma/enter keypresses
      if (!exactMatchFound) {
        // Press Comma & Enter on the Taggle input
        secInput.dispatchEvent(new KeyboardEvent("keydown", { key: ",", code: "Comma", keyCode: 188, which: 188, bubbles: true }));
        secInput.dispatchEvent(new KeyboardEvent("keypress", { key: ",", code: "Comma", keyCode: 188, which: 188, bubbles: true }));
        secInput.dispatchEvent(new KeyboardEvent("keyup", { key: ",", code: "Comma", keyCode: 188, which: 188, bubbles: true }));

        secInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
        secInput.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
        secInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));

        // Primary Injection: Invoke Taggle's official .add(tag) method in page world
        try {
          const addScript = document.createElement("script");
          addScript.textContent = `
            (function() {
              try {
                if (window.secondaryTagsForm && typeof window.secondaryTagsForm.add === 'function') {
                  window.secondaryTagsForm.add(${JSON.stringify(tag)});
                }
                if (window.jQuery) {
                  window.jQuery('ul.ui-autocomplete').hide();
                }
              } catch (_) {}
            })();
          `;
          (document.head || document.documentElement).appendChild(addScript);
          addScript.remove();
        } catch (_) {}
      }

      // Hide autocomplete menu so it doesn't obstruct the screen
      try {
        const closeAuto = document.createElement("script");
        closeAuto.textContent = `if (window.jQuery) { window.jQuery('ul.ui-autocomplete').hide(); }`;
        (document.head || document.documentElement).appendChild(closeAuto);
        closeAuto.remove();
      } catch (_) {}

      await sleep(150);

      // Verify DOM: Ensure hidden input <input type="hidden" name="design[secondary_tags][]" value="tag"> exists!
      const existingHiddenInputs = Array.from(document.querySelectorAll('#secondary_tags input[name="design[secondary_tags][]"]'));
      const alreadyHasHidden = existingHiddenInputs.some(inp => inp.value.toLowerCase() === tag.toLowerCase());

      if (!alreadyHasHidden && secTagsContainer) {
        // Fallback DOM injection: Guarantee that the hidden input exists for form submission!
        const hiddenInp = document.createElement("input");
        hiddenInp.type = "hidden";
        hiddenInp.name = "design[secondary_tags][]";
        hiddenInp.value = tag;
        secTagsContainer.appendChild(hiddenInp);

        // Visual tag chip
        const list = secTagsContainer.querySelector("ul.taggle_list, ul") || secTagsContainer;
        const chip = document.createElement("li");
        chip.className = "taggle";
        chip.innerHTML = `<span class="taggle_text">${escapeHtml(tag)}</span><a href="javascript:void(0)" class="close">&times;</a>`;
        list.insertBefore(chip, list.firstChild);
      }

      addedCount++;
      const currentPct = 74 + Math.round((addedCount / tags.length) * 8);
      updateTracker(4, Math.min(82, currentPct), `Added Tag (${addedCount}/${tags.length}): "${tag}"`);
      showToast(`✓ Tag [${addedCount}/${tags.length}]: "${tag}"`, "info", 600);
      await sleep(200);
    }
  }

  // Final validation & report
  const appliedTags = Array.from(document.querySelectorAll('#secondary_tags input[name="design[secondary_tags][]"]')).map(el => el.value);
  showToast(`✓ All ${appliedTags.length} Studio Tags Applied!`, "success", 2000);

  if (secTagsContainer) {
    secTagsContainer.classList.remove("tp-field-active");
    secTagsContainer.classList.add("tp-field-success");
    setTimeout(() => secTagsContainer.classList.remove("tp-field-success"), 1000);
  }
}

// ===================================================================
// SYNC PRODUCT ENABLE / DISABLE TOGGLES WITH STUDIO DATA
// ===================================================================

async function syncProductTogglesLive(apparelSettings = {}, productToggles = {}) {
  // 1. Sync Apparel table rows (T-Shirt, Hoodie, Tank, Crewneck, Long Sleeve, Baseball Tee, Kids, Kids Hoodie, Kids Long Sleeve)
  const apparelRows = document.querySelectorAll('.apparel-options tr, tr[data-canvas]');
  for (const row of apparelRows) {
    const rawName = row.getAttribute('data-name') || '';
    if (!rawName) continue;

    let isEnabled = true;
    for (const [key, val] of Object.entries(apparelSettings)) {
      if (key.toLowerCase() === rawName.toLowerCase() && typeof val === 'object' && val.enabled !== undefined) {
        isEnabled = val.enabled !== false;
        break;
      }
    }
    if (isEnabled && productToggles[rawName] !== undefined) {
      isEnabled = productToggles[rawName] !== false;
    }

    const toggleContainer = row.querySelector('.on-off');
    const toggleSpan = row.querySelector('.on-off span');
    const hiddenInput = row.querySelector('.on-off input');

    if (toggleSpan) {
      const currentlyEnabled = toggleSpan.classList.contains('enabled') || (hiddenInput && hiddenInput.value === 'true');
      if (isEnabled !== currentlyEnabled) {
        if (toggleContainer) toggleContainer.click();
        else toggleSpan.click();
        await sleep(60);
      }
    }
  }

  // 2. Sync Configure Other Products cards (Apparel, Socks, Bags, Shorts, Hats, Stickers, Cases, Mugs, Wall Art, Pillows, Totes, Tapestries, Pins, Magnets)
  const otherCanvases = document.querySelectorAll('.additional-canvases-container .canvas');
  for (const card of otherCanvases) {
    const canvasName = card.getAttribute('data-canvas-name') || card.getAttribute('data-canvas') || '';
    if (!canvasName) continue;

    let targetStudioKey = canvasName;
    const lower = canvasName.toLowerCase();
    if (lower === 'print') targetStudioKey = 'Wall Art';
    else if (lower === 'bag') targetStudioKey = 'Bags';
    else if (lower === 'hat') targetStudioKey = 'Hats';
    else if (lower === 'sticker') targetStudioKey = 'Stickers';
    else if (lower === 'case') targetStudioKey = 'Cases';
    else if (lower === 'mug') targetStudioKey = 'Mugs';
    else if (lower === 'pillow') targetStudioKey = 'Pillows';
    else if (lower === 'tote') targetStudioKey = 'Totes';
    else if (lower === 'tapestry') targetStudioKey = 'Tapestries';
    else if (lower === 'pin') targetStudioKey = 'Pins';
    else if (lower === 'magnet') targetStudioKey = 'Magnets';

    let shouldBeEnabled = true;
    if (productToggles[targetStudioKey] !== undefined) {
      shouldBeEnabled = productToggles[targetStudioKey] !== false;
    } else if (productToggles[canvasName] !== undefined) {
      shouldBeEnabled = productToggles[canvasName] !== false;
    }

    const toggleContainer = card.querySelector('.on-off');
    const toggleSpan = card.querySelector('.on-off span');
    const hiddenInput = card.querySelector('.on-off input');

    if (toggleSpan) {
      const currentlyEnabled = toggleSpan.classList.contains('enabled') || (hiddenInput && hiddenInput.value === 'true');
      if (shouldBeEnabled !== currentlyEnabled) {
        if (toggleContainer) toggleContainer.click();
        else toggleSpan.click();
        await sleep(60);
      }
    }
  }
}

// ===================================================================
// PRODUCT COLORS & BACKGROUNDS (DDSLICK SELECTION & ALL 14 PRODUCTS)
// ===================================================================

async function applyAllProductBackgroundColorsAndApparelLive(defaultColorName, colorPreference, apparelSettings = {}, productColors = {}) {
  const colorMap = {
    "black": "#111111",
    "dark": "#111111",
    "white": "#ffffff",
    "light": "#ffffff",
    "navy": "#1c2841",
    "royal blue": "#1b4388",
    "forest green": "#1a3d24",
    "red": "#9e1b24",
    "charcoal": "#333333",
    "heather": "#8c9096",
    "creme": "#faf4e8",
    "cream": "#faf4e8",
    "creamy": "#faf4e8"
  };

  const normDefault = normalizeColorName(defaultColorName);
  let hexColor = colorMap[normDefault] || "#111111";
  for (const [k, v] of Object.entries(colorMap)) {
    if (normDefault.includes(k) || k.includes(normDefault)) {
      hexColor = v;
      break;
    }
  }
  if (colorPreference === "light" && hexColor === "#111111") {
    hexColor = "#ffffff";
  }

  // 1. Color Dropper Tool (#dropperInput & .jsColorDropperApplyToAll)
  const dropperInput = document.getElementById("dropperInput");
  if (dropperInput) {
    dropperInput.value = hexColor;
    dropperInput.dispatchEvent(new Event("input", { bubbles: true }));
    dropperInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const applyAllBtn = document.querySelector(".jsColorDropperApplyToAll");
  if (applyAllBtn) {
    applyAllBtn.click();
    await sleep(200);
  }

  // 2. Direct Background Color Inputs (Eliminates All Warnings / Alerts!)
  const bgSelectors = [
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

  document.querySelectorAll(bgSelectors.join(', ')).forEach(el => {
    el.value = hexColor;
    el.setAttribute('value', hexColor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // 3. Primary Color Inputs for Hats, Shorts, Bags
  document.querySelectorAll('input.primary_color').forEach(inp => {
    if (!inp.value || inp.value.length === 0) {
      inp.value = "1";
      inp.setAttribute('value', "1");
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  ['primary_colors_55', 'primary_colors_56', 'primary_colors_58'].forEach(id => {
    const el = document.getElementById(id);
    if (el && (!el.value || el.value === '')) {
      el.value = "1";
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // 4. Garment & Accessory Default Color Selection via ddSlick
  const apparelColorMap = {
    "primary_color_tshirt": apparelSettings["T-Shirt"]?.defaultColor || productColors["T-Shirt"] || defaultColorName,
    "primary_color_hoodie": apparelSettings["Hoodie"]?.defaultColor || productColors["Hoodie"] || defaultColorName,
    "primary_color_tank": apparelSettings["Tank"]?.defaultColor || productColors["Tank"] || defaultColorName,
    "primary_color_crewneck": apparelSettings["Crewneck"]?.defaultColor || productColors["Crewneck"] || defaultColorName,
    "primary_color_longsleevetshirt": apparelSettings["Long Sleeve T-Shirt"]?.defaultColor || productColors["Long Sleeve T-Shirt"] || productColors["Long Sleeve"] || defaultColorName,
    "primary_color_baseballtee": apparelSettings["Baseball Tee"]?.defaultColor || productColors["Baseball Tee"] || defaultColorName,
    "primary_color_kids": apparelSettings["Kids"]?.defaultColor || productColors["Kids"] || defaultColorName,
    "primary_color_kidshoodie": apparelSettings["Kids Hoodie"]?.defaultColor || productColors["Kids Hoodie"] || defaultColorName,
    "primary_color_kidslongsleevetshirt": apparelSettings["Kids Long Sleeve T-Shirt"]?.defaultColor || productColors["Kids Long Sleeve T-Shirt"] || defaultColorName,
    "primary_color_shorts": productColors["Shorts"] || defaultColorName,
    "primary_color_bag": productColors["Bags"] || productColors["Bag"] || defaultColorName,
    "primary_color_hat": productColors["Hats"] || productColors["Hat"] || defaultColorName
  };

  for (const [id, rawTargetColor] of Object.entries(apparelColorMap)) {
    const container = document.getElementById(id);
    if (!container) continue;

    const normTarget = normalizeColorName(rawTargetColor);

    // TeePublic transforms selects into <div id="primary_color_..." class="dd-container">
    if (container.classList && container.classList.contains("dd-container")) {
      const options = container.querySelectorAll(".dd-option");
      let matched = false;

      // 1. Try exact or normalized match on color text
      for (const opt of options) {
        const rawTxt = (opt.querySelector(".dd-option-text")?.textContent || opt.textContent || "").trim();
        const normTxt = normalizeColorName(rawTxt);
        if (normTxt === normTarget || normTxt.includes(normTarget) || normTarget.includes(normTxt)) {
          opt.click();
          matched = true;
          break;
        }
      }

      // 2. Fallback: If garment doesn't offer target color (e.g. Creme on Tanks), select first valid option (index 1)
      if (!matched && options.length > 1) {
        options[1].click();
      }
    } else if (container.tagName === "SELECT") {
      // Native select fallback
      let matched = false;
      for (let i = 0; i < container.options.length; i++) {
        const opt = container.options[i];
        const normTxt = normalizeColorName(opt.text || "");
        if (normTxt === normTarget || normTxt.includes(normTarget) || normTarget.includes(normTxt)) {
          container.selectedIndex = i;
          container.value = opt.value;
          container.dispatchEvent(new Event("input", { bubbles: true }));
          container.dispatchEvent(new Event("change", { bubbles: true }));
          matched = true;
          break;
        }
      }
      if (!matched && container.options.length > 1) {
        container.selectedIndex = 1;
        container.value = container.options[1].value;
        container.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  // 5. Additional Color Preset Buttons (Dark / Light / All)
  let targetSelector = '.jsAdditionalColorButtons a[data-target="dark"]';
  if (colorPreference === "light") targetSelector = '.jsAdditionalColorButtons a[data-target="light"]';
  else if (colorPreference === "all") targetSelector = '.jsAdditionalColorButtons a[data-target="all"][data-action="enable"]';
  else if (colorPreference === "none") targetSelector = '.jsAdditionalColorButtons a[data-target="all"][data-action="disable"]';

  const colorPresetBtn = document.querySelector(targetSelector);
  if (colorPresetBtn) {
    colorPresetBtn.scrollIntoView({ behavior: "smooth", block: "center" });
    colorPresetBtn.click();
    await sleep(200);
  }

  // 6. Accept Terms & Conditions Checkbox
  const termsCheckbox = document.getElementById("terms");
  if (termsCheckbox) {
    termsCheckbox.checked = true;
    termsCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

// ===================================================================
// PUBLISH NOTICE MODAL & EXECUTION
// ===================================================================

function showPublishNoticeModal(meta) {
  let modal = document.getElementById("tp-publish-notice-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "tp-publish-notice-modal";
    document.body.appendChild(modal);
  }

  const nextBtnLabel = meta.isLastDesign 
    ? "🚀 Publish Entire Batch Now" 
    : `🚀 Advance to Design #${meta.curIdx + 2} of ${meta.totalCount}`;

  modal.innerHTML = `
    <div class="notice-card">
      <div class="notice-header">
        <div class="notice-icon-badge">✓</div>
        <div class="notice-title-box">
          <h3>Autopilot Configured Listing!</h3>
          <span>Tags, Apparel, and All 14 Product Backgrounds Set with 100% Precision</span>
        </div>
      </div>

      <div class="notice-summary-box">
        <div class="notice-summary-row">
          <span class="notice-label">Design Title:</span>
          <span class="notice-val highlight">${escapeHtml(meta.title)}</span>
        </div>
        <div class="notice-summary-row">
          <span class="notice-label">Main Tag:</span>
          <span class="notice-val">${escapeHtml(meta.mainTag)}</span>
        </div>
        <div class="notice-summary-row">
          <span class="notice-label">Colors & Fit:</span>
          <span class="notice-val">${escapeHtml(meta.defaultColor)} (${meta.placement})</span>
        </div>
        <div class="notice-summary-row">
          <span class="notice-label">Batch Progress:</span>
          <span class="notice-val highlight">Design ${meta.curIdx + 1} of ${meta.totalCount}</span>
        </div>
      </div>

      <div class="notice-actions">
        <button class="notice-btn-publish" id="btnNoticePublish">
          <span id="noticePublishText">${nextBtnLabel} (3s)</span>
        </button>
        <button class="notice-btn-dismiss" id="btnNoticeDismiss">
          ⏸️ Pause & Inspect
        </button>
      </div>
    </div>
  `;

  requestAnimationFrame(() => modal.classList.add("visible"));

  let countdown = 3;
  let countdownTimer = null;

  function doSubmit() {
    if (countdownTimer) clearInterval(countdownTimer);
    modal.classList.remove("visible");
    executePublishClick(meta);
  }

  countdownTimer = setInterval(() => {
    countdown--;
    const txtEl = document.getElementById("noticePublishText");
    if (txtEl) {
      if (countdown > 0) {
        txtEl.textContent = `${nextBtnLabel} (${countdown}s)`;
      } else {
        txtEl.textContent = `🚀 Submitting...`;
      }
    }
    if (countdown <= 0) {
      clearInterval(countdownTimer);
      doSubmit();
    }
  }, 1000);

  document.getElementById("btnNoticeDismiss").onclick = () => {
    if (countdownTimer) clearInterval(countdownTimer);
    modal.classList.remove("visible");
    showToast("⏸️ Autopilot paused for inspection. Click Publish button when ready.", "info", 3000);
  };

  document.getElementById("btnNoticePublish").onclick = () => {
    doSubmit();
  };
}

function executePublishClick(meta) {
  const publishBtn = findPublishButton();

  if (publishBtn) {
    publishBtn.scrollIntoView({ behavior: "smooth", block: "center" });
    publishBtn.classList.add("tp-sitemap-target-glow");

    if (meta.isBulkMode) {
      if (!meta.isLastDesign) {
        showToast(`🎉 Submitting Design #${meta.curIdx + 1}... Advancing to Design #${meta.curIdx + 2}`, "success", 2500);
        sessionStorage.setItem("TP_AUTOPILOT_ACTIVE_SESSION", Date.now().toString());
        chrome.storage.local.set({
          pendingAutoList: true,
          activeDesignIndex: meta.curIdx + 1
        });
      } else {
        showToast("🎉 Final design submitted! Publishing entire batch to TeePublic...", "success", 4000);
        sessionStorage.removeItem("TP_AUTOPILOT_ACTIVE_SESSION");
        chrome.storage.local.set({ pendingAutoList: false });
      }
    } else {
      if (meta.advanceNext && meta.curIdx < meta.totalCount - 1) {
        const nextIdx = meta.curIdx + 1;
        sessionStorage.setItem("TP_AUTOPILOT_ACTIVE_SESSION", Date.now().toString());
        chrome.storage.local.set({ activeDesignIndex: nextIdx, pendingAutoList: true });
        setTimeout(() => {
          window.location.href = "https://www.teepublic.com/designs/bulk_uploader";
        }, 1500);
      } else {
        sessionStorage.removeItem("TP_AUTOPILOT_ACTIVE_SESSION");
        chrome.storage.local.set({ pendingAutoList: false });
      }
    }

    setTimeout(() => {
      publishBtn.click();
    }, 600);
  } else {
    showToast("✓ Ready! Click the green Publish button at the bottom of the page.", "success", 4000);
  }
}

// ===================================================================
// TRACKER BROADCAST & FLOATING HUD
// ===================================================================

function updateTracker(step, pct, msg) {
  currentTracker = { step, pct, msg };

  chrome.storage.local.set({ trackerState: currentTracker });

  chrome.runtime.sendMessage({
    action: "TRACKER_UPDATE",
    tracker: currentTracker
  }).catch(() => {});

  const pctEl = document.getElementById("hudTrackerPct");
  const barEl = document.getElementById("hudTrackerBarFill");
  const statusEl = document.getElementById("hudTrackerStatusLine");

  if (pctEl) pctEl.textContent = `${pct}%`;
  if (barEl) barEl.style.width = `${pct}%`;
  if (statusEl) statusEl.textContent = msg;

  for (let i = 1; i <= 6; i++) {
    const chip = document.getElementById(`hud-step-${i}`);
    if (!chip) continue;
    chip.classList.remove("active", "completed");
    if (i < step) chip.classList.add("completed");
    else if (i === step) chip.classList.add("active");
  }
}

function mountHUD(store) {
  if (document.getElementById("tp-companion-hud")) return;

  const designs = store.cachedDesigns || [];
  const curIdx = store.activeDesignIndex || 0;
  const current = designs[curIdx] || null;

  hudElement = document.createElement("div");
  hudElement.id = "tp-companion-hud";

  const titleText = current ? (current.title || current.file_name) : "No design loaded";
  const defaultCol = current ? (current.default_color || current.product_colors?.["T-Shirt"] || current.apparel_settings?.["T-Shirt"]?.defaultColor || "Black") : "Black";
  const tagText = current && current.main_tag ? `Main: #${current.main_tag} • Color: ${defaultCol}` : "Autopilot Ready";
  const counterText = designs.length > 0 ? `${curIdx + 1} / ${designs.length}` : "0 / 0";

  const logoUrl = chrome.runtime.getURL("icons/icon48.png");

  hudElement.innerHTML = `
    <div class="hud-header" id="tp-hud-drag-handle">
      <div class="hud-brand">
        <span class="hud-brand-badge" style="background: transparent; padding: 0;"><img src="${logoUrl}" alt="Magic Fabrica" style="width: 20px; height: 20px; border-radius: 4px; display: block;" /></span>
        <span class="hud-brand-title">Magic Fabrica Autopilot</span>
      </div>
      <div class="hud-tools">
        <div class="hud-toggle-container" title="Turn Autopilot ON/OFF">
          <span class="hud-toggle-text on" id="hudToggleText">ON</span>
          <label class="hud-toggle-label">
            <input type="checkbox" id="hudToggleInput" checked>
            <span class="hud-toggle-slider"></span>
          </label>
        </div>
        <button class="hud-tool-btn" id="btnHudMinimize" title="Minimize/Maximize">_</button>
        <button class="hud-tool-btn" id="btnHudClose" title="Hide HUD">✕</button>
      </div>
    </div>

    <div class="hud-body">
      <div class="hud-status-row">
        <span class="hud-status-badge" id="hudStatusBadge">● AUTOPILOT READY</span>
        <span class="hud-counter" id="hudCounter">${counterText}</span>
      </div>

      <div class="hud-design-info">
        <span class="hud-design-name" id="hudDesignName">${escapeHtml(titleText)}</span>
        <span class="hud-design-tag" id="hudDesignTag">${escapeHtml(tagText)}</span>
      </div>

      <!-- Real-Time Tracker Pipeline -->
      <div class="hud-tracker-container">
        <div class="hud-tracker-header">
          <span>AUTOPILOT TRACKER</span>
          <span class="hud-tracker-pct" id="hudTrackerPct">0%</span>
        </div>
        <div class="hud-tracker-bar-bg">
          <div class="hud-tracker-bar-fill" id="hudTrackerBarFill" style="width: 0%"></div>
        </div>
        <div class="hud-tracker-status-line" id="hudTrackerStatusLine">Ready to start</div>
        <div class="hud-tracker-steps">
          <div class="hud-step-chip" id="hud-step-1"><span class="step-dot"></span><span>1. Nav</span></div>
          <div class="hud-step-chip" id="hud-step-2"><span class="step-dot"></span><span>2. Drop</span></div>
          <div class="hud-step-chip" id="hud-step-3"><span class="step-dot"></span><span>3. Start</span></div>
          <div class="hud-step-chip" id="hud-step-4"><span class="step-dot"></span><span>4. Meta</span></div>
          <div class="hud-step-chip" id="hud-step-5"><span class="step-dot"></span><span>5. Colors</span></div>
          <div class="hud-step-chip" id="hud-step-6"><span class="step-dot"></span><span>6. Pub</span></div>
        </div>
      </div>

      <div class="hud-btn-grid">
        <button class="hud-btn hud-btn-primary" id="btnHudFill" title="Run 1-Click Autopilot">
          <span>🚀</span> START AUTOPILOT
        </button>
        <button class="hud-btn hud-btn-secondary" id="btnHudNext" title="Autopilot & Move to Next Design">
          <span>⏩</span> Autopilot & Next
        </button>
        <button class="hud-btn hud-btn-secondary" id="btnHudSync" title="Sync designs from Local Studio">
          <span>🔄</span> Sync Data
        </button>
      </div>
    </div>

    <div class="hud-footer">
      Live Autonomous Agent — Active in Browser
    </div>
  `;

  document.body.appendChild(hudElement);

  document.getElementById("btnHudMinimize").addEventListener("click", () => {
    hudElement.classList.toggle("minimized");
  });

  document.getElementById("btnHudClose").addEventListener("click", () => {
    unmountHUD();
    detachKeyboardShortcuts();
  });

  document.getElementById("btnHudFill").addEventListener("click", () => {
    handleAutoListTrigger(false);
  });

  document.getElementById("btnHudNext").addEventListener("click", () => {
    handleAutoListTrigger(true);
  });

  document.getElementById("btnHudSync").addEventListener("click", syncWithLocalServer);

  const toggleInput = document.getElementById("hudToggleInput");
  if (toggleInput) {
    toggleInput.addEventListener("change", (e) => {
      const active = e.target.checked;
      chrome.storage.local.set({ extensionEnabled: active, pendingAutoList: false });
      applyHUDEnabledState(active);
      if (active) {
        attachKeyboardShortcuts();
      } else {
        detachKeyboardShortcuts();
      }
      showToast(active ? "✅ Autopilot Activated (ON)" : "⏸️ Autopilot Deactivated (OFF)", active ? "info" : "warning", 2500);
    });
  }

  // Set initial HUD state
  applyHUDEnabledState(store.extensionEnabled !== false);
}

function applyHUDEnabledState(isEnabled) {
  const toggleInput = document.getElementById("hudToggleInput");
  const toggleText = document.getElementById("hudToggleText");
  const statusBadge = document.getElementById("hudStatusBadge");
  const btnFill = document.getElementById("btnHudFill");
  const btnNext = document.getElementById("btnHudNext");
  const hud = document.getElementById("tp-companion-hud");

  if (toggleInput) toggleInput.checked = isEnabled;
  if (toggleText) {
    toggleText.textContent = isEnabled ? "ON" : "OFF";
    toggleText.className = isEnabled ? "hud-toggle-text on" : "hud-toggle-text off";
  }

  if (hud) {
    if (isEnabled) {
      hud.classList.remove("hud-deactivated");
    } else {
      hud.classList.add("hud-deactivated");
    }
  }

  if (statusBadge && !isListingInProgress) {
    if (isEnabled) {
      statusBadge.className = "hud-status-badge";
      statusBadge.textContent = "● AUTOPILOT READY";
    } else {
      statusBadge.className = "hud-status-badge paused";
      statusBadge.textContent = "⏸️ AUTOPILOT DEACTIVATED (OFF)";
    }
  }

  if (btnFill) {
    btnFill.disabled = !isEnabled;
    if (isEnabled) {
      btnFill.innerHTML = `<span>🚀</span> START AUTOPILOT`;
    } else {
      btnFill.innerHTML = `<span>⏸️</span> AUTOPILOT OFF`;
    }
  }

  if (btnNext) {
    btnNext.disabled = !isEnabled;
  }
}

function unmountHUD() {
  const existing = document.getElementById("tp-companion-hud");
  if (existing) existing.remove();
  const toast = document.getElementById("tp-companion-toast");
  if (toast) toast.remove();
  const modal = document.getElementById("tp-publish-notice-modal");
  if (modal) modal.remove();
  hudElement = null;
}

function updateHUDStatus(stateClass, text) {
  const badge = document.getElementById("hudStatusBadge");
  if (badge) {
    badge.className = "hud-status-badge " + stateClass;
    badge.textContent = text;
  }
}

function updateHUDLabels(design, index, total) {
  const nameEl = document.getElementById("hudDesignName");
  const tagEl = document.getElementById("hudDesignTag");
  const countEl = document.getElementById("hudCounter");
  const defaultCol = design ? (design.default_color || design.product_colors?.["T-Shirt"] || design.apparel_settings?.["T-Shirt"]?.defaultColor || "Black") : "Black";
  if (nameEl) nameEl.textContent = design ? (design.title || design.file_name) : "No design loaded";
  if (tagEl) tagEl.textContent = design && design.main_tag ? `Main: #${design.main_tag} • Color: ${defaultCol}` : "Autopilot Ready";
  if (countEl) countEl.textContent = `${index + 1} / ${total}`;
}

async function syncWithLocalServer() {
  const btn = document.getElementById("btnHudSync");
  if (btn) btn.textContent = "Syncing...";
  showToast("🔄 Syncing with Desktop Studio (port 5050)...", "info", 1500);

  try {
    const data = await apiGetStudioState();
    if (data && data.designs) {
      const designs = data.designs || [];
      const idx = data.current_index >= 0 ? data.current_index : 0;
      await chrome.storage.local.set({ cachedDesigns: designs, activeDesignIndex: idx });
      updateHUDLabels(designs[idx], idx, designs.length);
      if (btn) btn.textContent = "✓ Synced!";
      showToast(`✓ Synced ${designs.length} listings from studio!`, "success", 2000);
    } else {
      if (btn) btn.textContent = "Studio Offline";
    }
  } catch (_) {
    if (btn) btn.textContent = "Studio Offline";
  } finally {
    setTimeout(() => {
      if (btn) btn.innerHTML = `<span>🔄</span> Sync Data`;
    }, 1500);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showToast(message, type = "info", duration = 3000) {
  let toast = document.getElementById("tp-companion-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "tp-companion-toast";
    document.body.appendChild(toast);
  }

  const icon = type === "success" ? "✓" : type === "warning" ? "⚠️" : "⚡";
  toast.className = `toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${escapeHtml(message)}</span>`;

  requestAnimationFrame(() => toast.classList.add("visible"));

  if (window._toastTimeout) clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.classList.remove("visible");
  }, duration);
}

function attachKeyboardShortcuts() {
  if (keydownListener) return;
  keydownListener = (e) => {
    if (e.altKey && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      handleAutoListTrigger(false);
    }
  };
  window.addEventListener("keydown", keydownListener);
}

function detachKeyboardShortcuts() {
  if (keydownListener) {
    window.removeEventListener("keydown", keydownListener);
    keydownListener = null;
  }
}

function normalizeColorName(col) {
  if (!col) return "black";
  const s = String(col).trim().toLowerCase();
  if (s === "creamy" || s === "cream" || s === "creme") return "creme";
  if (s === "grey" || s === "gray") return "heather";
  if (s === "dark") return "black";
  if (s === "light") return "white";
  return s;
}

function getBulkEditorProgress() {
  const statusEl = document.querySelector('.m-uploader__bulk-status-text');
  if (statusEl) {
    const text = statusEl.textContent || statusEl.innerText || '';
    const match = text.match(/Currently\s*Editing\s*Design\s*(\d+)\s*of\s*(\d+)/i);
    if (match) {
      return {
        currentIndex: parseInt(match[1], 10) - 1,
        totalCount: parseInt(match[2], 10),
        humanIndex: parseInt(match[1], 10)
      };
    }
  }

  const allText = document.body.innerText || '';
  const match = allText.match(/Currently\s*Editing\s*Design\s*(\d+)\s*of\s*(\d+)/i);
  if (match) {
    return {
      currentIndex: parseInt(match[1], 10) - 1,
      totalCount: parseInt(match[2], 10),
      humanIndex: parseInt(match[1], 10)
    };
  }

  return null;
}

function findPublishButton() {
  const bulkSubmit = document.querySelector('input[type="submit"][value="Publish All"], input.save-publish-later-button[value="Publish All"], input.save-publish-later-button');
  if (bulkSubmit) return bulkSubmit;

  const publishBtn = document.querySelector('button.publish-and-promote-button, button[value="publish"]');
  if (publishBtn) return publishBtn;

  const greenBtn = document.querySelector('.save-publish-later-button.btn--green, input[type="submit"].btn--green, button.btn--green');
  if (greenBtn) return greenBtn;

  return null;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}
