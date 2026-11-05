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

// Helper functions to manage tab-isolated autopilot session lifecycle
function markSessionActive() {
  const now = Date.now().toString();
  sessionStorage.setItem("TP_AUTOPILOT_SESSION_ACTIVE", "true");
  sessionStorage.setItem("TP_AUTOPILOT_SESSION_TIME", now);
  sessionStorage.setItem("TP_PIPELINE_CONTINUING", now);
  sessionStorage.setItem("TP_AUTOPILOT_ACTIVE_SESSION", now);
}

function clearSessionActive() {
  sessionStorage.removeItem("TP_AUTOPILOT_SESSION_ACTIVE");
  sessionStorage.removeItem("TP_AUTOPILOT_SESSION_TIME");
  sessionStorage.removeItem("TP_PIPELINE_CONTINUING");
  sessionStorage.removeItem("TP_AUTOPILOT_ACTIVE_SESSION");
}

// Initialize when page is ready
(async function init() {
  const store = await chrome.storage.local.get({
    extensionEnabled: true,
    scraperEnabled: true,
    scrapedCompetitorDesigns: [],
    activeDesignIndex: 0,
    cachedDesigns: [],
    prefColorMode: "dark",
    prefPrintLocation: "front",
    prefMature: "no",
    prefDefaultColor: "Black",
    pendingAutoList: false,
    triggeredByPopupTimestamp: 0,
    advanceNextAfterFill: false,
    batchCompleted: false,
    trackerState: null
  });

  const isEnabled = store.extensionEnabled !== false;

  // Always mount HUD with toggle
  mountHUD(store);
  mountQuickGrabLauncher(store);
  if (isEnabled) {
    attachKeyboardShortcuts();
  }

  const isBatchCompleted = Boolean(store.batchCompleted || sessionStorage.getItem("TP_BATCH_COMPLETED") === "true");

  // If a previous upload batch finished completely: disarm session, stop any loops, stay on page!
  if (isBatchCompleted) {
    clearSessionActive();
    sessionStorage.removeItem("TP_BATCH_COMPLETED");
    await chrome.storage.local.set({
      pendingAutoList: false,
      advanceNextAfterFill: false,
      batchCompleted: false,
      triggeredByPopupTimestamp: 0
    });
    isListingInProgress = false;
    showToast("🎉 Batch Completed! All designs uploaded and published.", "success", 4000);
    updateHUDStatus("active", "● READY");
    return;
  }

  const pageType = getPageType();

  // Check if this browser tab is currently running an active, user-authorized Autopilot session
  const isSessionActive = sessionStorage.getItem("TP_AUTOPILOT_SESSION_ACTIVE") === "true";
  const sessionTime = parseInt(
    sessionStorage.getItem("TP_AUTOPILOT_SESSION_TIME") || 
    sessionStorage.getItem("TP_PIPELINE_CONTINUING") || 
    sessionStorage.getItem("TP_AUTOPILOT_ACTIVE_SESSION") || "0", 
    10
  );
  // Session remains valid if active within the last 10 minutes (prevents stall on slow Tor/assets load)
  const isSessionFresh = (isSessionActive || sessionTime > 0) && (Date.now() - sessionTime < 600000);
  const isRecentPopupNav = Boolean(store.triggeredByPopupTimestamp && (Date.now() - store.triggeredByPopupTimestamp < 25000));

  const shouldAutoContinue = isEnabled && !isBatchCompleted && (store.pendingAutoList || isSessionActive) && (isSessionFresh || isRecentPopupNav);

  if (shouldAutoContinue) {
    if (pageType === "BULK_DROPZONE") {
      markSessionActive();
      await chrome.storage.local.set({
        pendingAutoList: true,
        triggeredByPopupTimestamp: 0,
        advanceNextAfterFill: true
      });
      showToast("🚀 TeePublic Autopilot Live! Processing bulk batch...", "info", 2000);
      setTimeout(() => {
        executeMasterWorkflow(true);
      }, 400);
    } else if (pageType === "DESIGN_EDIT") {
      markSessionActive();
      await chrome.storage.local.set({
        pendingAutoList: true,
        triggeredByPopupTimestamp: 0,
        advanceNextAfterFill: true
      });
      showToast("🚀 Continuing Autopilot to next design...", "info", 2000);
      setTimeout(() => {
        executeMasterWorkflow(true);
      }, 400);
    } else {
      // Storefront, profile, or other non-uploader page:
      // ONLY navigate to bulk uploader if strictly initiated by a fresh popup click!
      if (isRecentPopupNav && store.pendingAutoList) {
        showToast("📍 Navigating to TeePublic Bulk Uploader...", "info", 1500);
        setTimeout(() => {
          window.location.href = "https://www.teepublic.com/designs/bulk_uploader";
        }, 400);
      } else {
        // Otherwise, batch is done or manual visit: disarm and stay on page (NO ZOMBIE LOOP!)
        clearSessionActive();
        await chrome.storage.local.set({ pendingAutoList: false, triggeredByPopupTimestamp: 0 });
      }
    }
  } else {
    // Direct window open, fresh manual visit, or tab restore when idle: NEVER auto-run!
    await chrome.storage.local.set({ pendingAutoList: false, triggeredByPopupTimestamp: 0 });
    clearSessionActive();
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
    handleAutoListTrigger(message.advanceNext !== false);
    sendResponse({ success: true, started: true });
    return true;
  }

  if (message.action === "AUTOFILL_DESIGN") {
    handleAutoListTrigger(true);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "AUTOFILL_AND_NEXT") {
    handleAutoListTrigger(true);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "CHECK_PRODUCT_PAGE") {
    const isProd = isProductPage();
    let preview = null;
    if (isProd) {
      const scraped = scrapeTeePublicProductPage();
      preview = {
        title: scraped.title,
        store: scraped.store,
        tagCount: scraped.tags.length
      };
    }
    sendResponse({ isProduct: isProd, preview: preview });
    return true;
  }

  if (message.action === "SCRAPE_CURRENT_PAGE") {
    const scraped = scrapeTeePublicProductPage();
    sendResponse({ success: true, data: scraped });
    return true;
  }

  if (message.action === "TOGGLE_SCRAPER") {
    const isEnabled = Boolean(message.enabled);
    const grabBtn = document.getElementById("tp-quick-grab-launcher");
    if (grabBtn) {
      if (isEnabled) grabBtn.classList.remove("grab-deactivated");
      else grabBtn.classList.add("grab-deactivated");
    }
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
    if (changes.scrapedCompetitorDesigns !== undefined) {
      const count = (changes.scrapedCompetitorDesigns.newValue || []).length;
      const grabBadge = document.getElementById("tpGrabCountBadge");
      if (grabBadge) grabBadge.textContent = count;
      const hudBadge = document.getElementById("hudScrapedCount");
      if (hudBadge) hudBadge.textContent = count;
    }
    if (changes.scraperEnabled !== undefined) {
      const isEnabled = Boolean(changes.scraperEnabled.newValue);
      const grabBtn = document.getElementById("tp-quick-grab-launcher");
      if (grabBtn) {
        if (isEnabled) grabBtn.classList.remove("grab-deactivated");
        else grabBtn.classList.add("grab-deactivated");
      }
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

  // If on design editor: /designs/<id>/edit or /designs/.../edit
  if (path.includes("/designs/") && path.includes("/edit")) {
    return "DESIGN_EDIT";
  }

  // Any other page (Store, Profile, Landing, or Empty Upload): Go to Bulk Uploader!
  return "NAVIGATE_TO_BULK";
}

// Master Entry Point
async function handleAutoListTrigger(advanceNext = true) {
  const store = await chrome.storage.local.get({ extensionEnabled: true });
  if (store.extensionEnabled === false) {
    showToast("⚠️ Autopilot is turned OFF. Turn the toggle ON to start.", "warning", 3000);
    return;
  }

  if (isListingInProgress) {
    showToast("⚠️ Autopilot is currently navigating...", "warning");
    return;
  }

  // Explicit user trigger: open HUD to view live progress & authorize session token
  openHUD();
  markSessionActive();

  await chrome.storage.local.set({
    pendingAutoList: true,
    advanceNextAfterFill: advanceNext
  });

  const pageType = getPageType();

  // If on Store page, Landing, or an empty upload screen: Navigate directly to /designs/bulk_uploader!
  if (pageType === "NAVIGATE_TO_BULK") {
    updateTracker(1, 15, "Autopilot navigating to TeePublic Bulk Uploader...");
    showToast("📍 Navigating to TeePublic Bulk Uploader...", "info", 2000);

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

async function executeMasterWorkflow(advanceNext = true) {
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
      if (serverState && Array.isArray(serverState.designs)) {
        if (serverState.designs.length > 0) {
          designs = serverState.designs;
          curIdx = serverState.current_index >= 0 ? serverState.current_index : 0;
          totalCount = designs.length;
          design = designs[curIdx] || null;

          await chrome.storage.local.set({
            cachedDesigns: designs,
            activeDesignIndex: curIdx
          });
        } else {
          // Connected to studio, but studio queue is empty (user cleared it)!
          // Clear extension cache so old stale designs are never resurrected!
          await chrome.storage.local.set({
            cachedDesigns: [],
            activeDesignIndex: 0
          });
          designs = [];
          design = null;
          totalCount = 0;
        }
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
      markSessionActive();
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
        markSessionActive();
        await chrome.storage.local.set({ pendingAutoList: true, advanceNextAfterFill: true });

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

    // Wait up to 30 seconds for the form to actually exist on the page (handles slow asset downloads in Tor/Brave)
    let titleEl = null;
    for (let wait = 0; wait < 60; wait++) {
      titleEl = document.querySelector('#design_design_title, input[name="design[design_title]"]');
      if (titleEl) break;
      if (wait % 10 === 0 && wait > 0) {
        updateTracker(4, 65, `Waiting for Listing Form (${Math.round((60 - wait) * 0.5)}s remaining)...`);
      }
      await sleep(500);
    }

    if (!titleEl) {
      showToast("⚠️ Listing form is still loading. Retrying...", "warning", 3000);
      for (let retry = 0; retry < 30; retry++) {
        titleEl = document.querySelector('#design_design_title, input[name="design[design_title]"]');
        if (titleEl) break;
        await sleep(500);
      }
    }

    if (!titleEl) {
      showToast("⚠️ Form loading timed out. Click Start Autopilot to retry.", "warning", 4000);
      updateTracker(4, 65, "Timed out waiting for form");
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
    markSessionActive();
    await chrome.storage.local.set({
      activeDesignIndex: curIdx,
      pendingAutoList: true,
      advanceNextAfterFill: true
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

    // 3. Supporting Tags (Live Tag-by-Tag with 100% Studio Fidelity)
    const suppTagsVal = design.supporting_tags || "";
    if (suppTagsVal) {
      await fillSupportingTagsWithSuggestionsLive(suppTagsVal, mainTagVal);
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

function getTaggleTextInput() {
  return document.querySelector(
    '#secondary_tags input[type="text"].taggle_input, ' +
    '#secondary_tags input.taggle_input[type="text"], ' +
    '#secondary_tags .taggle_input input, ' +
    '#secondary_tags input[type="text"], ' +
    '#secondary_tags input:not([type="hidden"]), ' +
    '#secondary_tags textarea'
  );
}

async function fillSupportingTagsWithSuggestionsLive(suppTagsVal, mainTagVal = "") {
  if (!suppTagsVal) return;
  updateTracker(4, 74, "Adding Supporting Tags from Studio...");

  const secTagsContainer = document.querySelector('#secondary_tags');
  if (secTagsContainer) {
    secTagsContainer.scrollIntoView({ behavior: "smooth", block: "center" });
    secTagsContainer.classList.add("tp-field-active");
  }

  // Parse studio tags (clean hashtags, trim whitespace, deduplicate, filter out primary tag duplicate)
  const normalizedMainTag = (mainTagVal || "").trim().toLowerCase().replace(/^#+/, '');
  const seen = new Set();
  const rawTags = suppTagsVal.split(",")
    .map(t => t.trim().replace(/^#+/, '').trim())
    .filter(Boolean);

  const tags = [];
  for (const raw of rawTags) {
    const lower = raw.toLowerCase();
    // TeePublic max length is 39 characters
    const clean = raw.substring(0, 39);
    if (!clean) continue;
    // Disallow if duplicate of main tag (TeePublic rejects secondary tag == main tag)
    if (normalizedMainTag && lower === normalizedMainTag) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    tags.push(clean);
    // TeePublic allows at most 14-15 secondary tags
    if (tags.length >= 15) break;
  }

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

  await sleep(150);

  // 2. Add each studio tag one by one with live visual feedback
  let addedCount = 0;

  for (let idx = 0; idx < tags.length; idx++) {
    const tag = tags[idx];
    const secInput = getTaggleTextInput();

    if (secInput) {
      secInput.focus();
      secInput.value = "";

      // Smooth visual typing simulation for human review
      for (let c = 0; c < tag.length; c++) {
        secInput.value += tag[c];
        secInput.dispatchEvent(new Event("input", { bubbles: true }));
        if (c % 2 === 0) await sleep(12);
      }
      secInput.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(40);

      // Trigger Taggle via Comma keydown/keypress/keyup
      secInput.dispatchEvent(new KeyboardEvent("keydown", { key: ",", code: "Comma", keyCode: 188, which: 188, bubbles: true }));
      secInput.dispatchEvent(new KeyboardEvent("keypress", { key: ",", code: "Comma", keyCode: 188, which: 188, bubbles: true }));
      secInput.dispatchEvent(new KeyboardEvent("keyup", { key: ",", code: "Comma", keyCode: 188, which: 188, bubbles: true }));

      // Check if Taggle successfully added this tag
      let hasTag = Array.from(document.querySelectorAll('#secondary_tags input[name="design[secondary_tags][]"]'))
        .some(inp => inp.value.toLowerCase() === tag.toLowerCase());

      if (!hasTag) {
        // Also try Enter key
        secInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
        secInput.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
        secInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      }

      hasTag = Array.from(document.querySelectorAll('#secondary_tags input[name="design[secondary_tags][]"]'))
        .some(inp => inp.value.toLowerCase() === tag.toLowerCase());

      // If key events did not trigger Taggle, invoke Taggle.add in page world
      if (!hasTag) {
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

      await sleep(80);

      hasTag = Array.from(document.querySelectorAll('#secondary_tags input[name="design[secondary_tags][]"]'))
        .some(inp => inp.value.toLowerCase() === tag.toLowerCase());

      // Ultimate DOM fallback: Safely inject chip and hidden input inside ul.taggle_list right before li.taggle_input
      if (!hasTag) {
        const list = document.querySelector('#secondary_tags ul.taggle_list, #secondary_tags ul');
        const inputLi = document.querySelector('#secondary_tags li.taggle_input');
        if (list) {
          const chipLi = document.createElement("li");
          chipLi.className = "taggle";
          chipLi.innerHTML = `<span class="taggle_text">${escapeHtml(tag)}</span><button type="button" class="close">&times;</button><input type="hidden" name="design[secondary_tags][]" value="${escapeHtml(tag)}">`;
          if (inputLi) {
            list.insertBefore(chipLi, inputLi);
          } else {
            list.appendChild(chipLi);
          }
        }
      }

      // Always clear the text input for the next tag
      secInput.value = "";
      secInput.dispatchEvent(new Event("input", { bubbles: true }));

      // Hide autocomplete menu so it doesn't obstruct the screen
      try {
        const closeAuto = document.createElement("script");
        closeAuto.textContent = `if (window.jQuery) { window.jQuery('ul.ui-autocomplete').hide(); }`;
        (document.head || document.documentElement).appendChild(closeAuto);
        closeAuto.remove();
      } catch (_) {}

      addedCount++;
      const currentPct = 74 + Math.round((addedCount / tags.length) * 8);
      updateTracker(4, Math.min(82, currentPct), `Added Tag (${addedCount}/${tags.length}): "${tag}"`);
      showToast(`✓ Tag [${addedCount}/${tags.length}]: "${tag}"`, "info", 600);
      await sleep(100);
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
          <span id="noticePublishText">${nextBtnLabel} (1s)</span>
        </button>
        <button class="notice-btn-dismiss" id="btnNoticeDismiss">
          ⏸️ Pause & Inspect
        </button>
      </div>
    </div>
  `;

  requestAnimationFrame(() => modal.classList.add("visible"));

  let countdown = 1;
  let countdownTimer = null;

  async function doSubmit() {
    if (countdownTimer) clearInterval(countdownTimer);
    modal.classList.remove("visible");
    await executePublishClick(meta);
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

  document.getElementById("btnNoticeDismiss").onclick = async () => {
    if (countdownTimer) clearInterval(countdownTimer);
    modal.classList.remove("visible");
    clearSessionActive();
    await chrome.storage.local.set({ pendingAutoList: false, advanceNextAfterFill: false });
    isListingInProgress = false;
    showToast("⏸️ Autopilot paused for inspection. Click Publish button when ready.", "info", 3000);
  };

  document.getElementById("btnNoticePublish").onclick = () => {
    doSubmit();
  };
}

async function executePublishClick(meta) {
  const isFinalDesign = Boolean(meta.isLastDesign || (meta.curIdx >= meta.totalCount - 1));
  const publishBtn = findPublishButton(isFinalDesign);

  if (publishBtn) {
    publishBtn.scrollIntoView({ behavior: "smooth", block: "center" });
    publishBtn.classList.add("tp-sitemap-target-glow");

    if (isFinalDesign) {
      // Entire batch completed: disarm all autopilot state, set completion locks, and cease looping!
      clearSessionActive();
      sessionStorage.setItem("TP_BATCH_COMPLETED", "true");
      await chrome.storage.local.set({
        pendingAutoList: false,
        advanceNextAfterFill: false,
        batchCompleted: true,
        activeDesignIndex: 0
      });
      isListingInProgress = false;
      updateTracker(6, 100, "🎉 All designs published! Batch complete.");
      updateHUDStatus("completed", "✓ BATCH COMPLETE");
      showToast("🎉 Final design submitted! All designs published successfully.", "success", 5000);
    } else if (meta.isBulkMode) {
      showToast(`🎉 Submitting Design #${meta.curIdx + 1}... Advancing to Design #${meta.curIdx + 2}`, "success", 2500);
      markSessionActive();
      await chrome.storage.local.set({
        pendingAutoList: true,
        advanceNextAfterFill: true,
        activeDesignIndex: meta.curIdx + 1,
        batchCompleted: false
      });
    } else {
      if (meta.advanceNext && meta.curIdx < meta.totalCount - 1) {
        const nextIdx = meta.curIdx + 1;
        markSessionActive();
        await chrome.storage.local.set({
          activeDesignIndex: nextIdx,
          pendingAutoList: true,
          advanceNextAfterFill: true,
          batchCompleted: false
        });
        setTimeout(() => {
          window.location.href = "https://www.teepublic.com/designs/bulk_uploader";
        }, 1200);
      } else {
        clearSessionActive();
        sessionStorage.setItem("TP_BATCH_COMPLETED", "true");
        await chrome.storage.local.set({
          pendingAutoList: false,
          advanceNextAfterFill: false,
          batchCompleted: true,
          activeDesignIndex: 0
        });
        isListingInProgress = false;
        showToast("🎉 Final design submitted! Batch complete.", "success", 5000);
      }
    }

    setTimeout(() => {
      publishBtn.click();
    }, 400);
  } else {
    if (isFinalDesign) {
      clearSessionActive();
      sessionStorage.setItem("TP_BATCH_COMPLETED", "true");
      await chrome.storage.local.set({
        pendingAutoList: false,
        advanceNextAfterFill: false,
        batchCompleted: true,
        activeDesignIndex: 0
      });
      isListingInProgress = false;
    }
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

      <!-- Scraper Quick Bar inside HUD -->
      <div class="hud-scraper-bar">
        <div class="hud-scraper-info">
          <span>🏷️ Competitor Tags:</span>
          <span class="hud-scraper-badge" id="hudScrapedCount">${(store.scrapedCompetitorDesigns || []).length}</span>
        </div>
        <div class="hud-scraper-actions">
          <button class="hud-btn-mini" id="btnHudQuickGrab" title="Grab this listing's tags & title (Alt+S)">📸 Grab</button>
          <button class="hud-btn-mini success" id="btnHudDownloadCsv" title="Download collected listings as Magic Listing CSV">📥 CSV</button>
        </div>
      </div>
    </div>

    <div class="hud-footer">
      Live Autonomous Agent — Active in Browser
    </div>
  `;

  document.body.appendChild(hudElement);

  // Create mini floating logo button in bottom-right corner
  let miniLauncher = document.getElementById("tp-hud-mini-launcher");
  if (!miniLauncher) {
    miniLauncher = document.createElement("div");
    miniLauncher.id = "tp-hud-mini-launcher";
    miniLauncher.title = "Magic Fabrica Autopilot (Click to open)";
    miniLauncher.innerHTML = `
      <div class="mini-launcher-inner">
        <img src="${logoUrl}" alt="Magic Fabrica" class="mini-launcher-icon" />
        <span class="mini-launcher-dot on" id="miniLauncherDot"></span>
      </div>
    `;
    document.body.appendChild(miniLauncher);

    miniLauncher.addEventListener("click", () => {
      openHUD();
    });
  }

  document.getElementById("btnHudMinimize").addEventListener("click", () => {
    closeHUD();
  });

  document.getElementById("btnHudClose").addEventListener("click", () => {
    closeHUD();
  });

  document.getElementById("btnHudFill").addEventListener("click", () => {
    handleAutoListTrigger(true);
  });

  document.getElementById("btnHudNext").addEventListener("click", () => {
    handleAutoListTrigger(true);
  });

  document.getElementById("btnHudSync").addEventListener("click", syncWithLocalServer);

  const btnHudQuickGrab = document.getElementById("btnHudQuickGrab");
  if (btnHudQuickGrab) {
    btnHudQuickGrab.addEventListener("click", () => {
      handleQuickGrabTrigger();
    });
  }

  const btnHudDownloadCsv = document.getElementById("btnHudDownloadCsv");
  if (btnHudDownloadCsv) {
    btnHudDownloadCsv.addEventListener("click", async () => {
      const data = await chrome.storage.local.get({ scrapedCompetitorDesigns: [] });
      const designs = data.scrapedCompetitorDesigns || [];
      if (designs.length === 0) {
        showToast("⚠️ No designs collected yet! Open tabs and click Grab.", "warning", 2500);
        return;
      }
      downloadMagicListingCsvDirect(designs);
    });
  }

  const toggleInput = document.getElementById("hudToggleInput");
  if (toggleInput) {
    toggleInput.addEventListener("change", (e) => {
      const active = e.target.checked;
      chrome.storage.local.set({ extensionEnabled: active, pendingAutoList: false, advanceNextAfterFill: false });
      if (!active) {
        clearSessionActive();
      }
      applyHUDEnabledState(active);
      if (active) {
        attachKeyboardShortcuts();
      } else {
        detachKeyboardShortcuts();
      }
      showToast(active ? "✅ Autopilot Activated (ON)" : "⏸️ Autopilot Deactivated (OFF)", active ? "info" : "warning", 2500);
    });
  }

  // Set initial HUD state & start collapsed as small logo by default
  applyHUDEnabledState(store.extensionEnabled !== false);
  closeHUD();
}

function openHUD() {
  const hud = document.getElementById("tp-companion-hud");
  const mini = document.getElementById("tp-hud-mini-launcher");
  if (hud) hud.classList.remove("hidden-hud");
  if (mini) mini.classList.add("hidden-mini");
}

function closeHUD() {
  const hud = document.getElementById("tp-companion-hud");
  const mini = document.getElementById("tp-hud-mini-launcher");
  if (hud) hud.classList.add("hidden-hud");
  if (mini) mini.classList.remove("hidden-mini");
}

function applyHUDEnabledState(isEnabled) {
  const toggleInput = document.getElementById("hudToggleInput");
  const toggleText = document.getElementById("hudToggleText");
  const statusBadge = document.getElementById("hudStatusBadge");
  const btnFill = document.getElementById("btnHudFill");
  const btnNext = document.getElementById("btnHudNext");
  const hud = document.getElementById("tp-companion-hud");
  const miniDot = document.getElementById("miniLauncherDot");

  if (toggleInput) toggleInput.checked = isEnabled;
  if (toggleText) {
    toggleText.textContent = isEnabled ? "ON" : "OFF";
    toggleText.className = isEnabled ? "hud-toggle-text on" : "hud-toggle-text off";
  }

  if (miniDot && !isListingInProgress) {
    miniDot.className = "mini-launcher-dot " + (isEnabled ? "on" : "off");
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
  const mini = document.getElementById("tp-hud-mini-launcher");
  if (mini) mini.remove();
  const grabber = document.getElementById("tp-quick-grab-launcher");
  if (grabber) grabber.remove();
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
  const miniDot = document.getElementById("miniLauncherDot");
  if (miniDot) {
    if (stateClass === "running") {
      miniDot.className = "mini-launcher-dot running";
    } else if (stateClass === "paused") {
      miniDot.className = "mini-launcher-dot off";
    } else {
      miniDot.className = "mini-launcher-dot on";
    }
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
    if (data && Array.isArray(data.designs)) {
      const designs = data.designs || [];
      const idx = designs.length > 0 ? Math.min(data.current_index || 0, designs.length - 1) : 0;
      await chrome.storage.local.set({ cachedDesigns: designs, activeDesignIndex: idx });
      updateHUDLabels(designs[idx] || null, idx, designs.length);
      if (btn) btn.textContent = "✓ Synced!";
      showToast(designs.length > 0 ? `✓ Synced ${designs.length} listings from studio!` : "ℹ️ Desktop Studio queue is currently empty.", "success", 2000);
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
  const iconColor = type === "success" ? "#34D399" : type === "warning" ? "#FBBF24" : "#38BDF8";
  const borderColor = type === "success" ? "rgba(52, 211, 153, 0.7)" : type === "warning" ? "rgba(245, 158, 11, 0.7)" : "rgba(56, 189, 248, 0.7)";
  const glowColor = type === "success" ? "rgba(52, 211, 153, 0.35)" : type === "warning" ? "rgba(245, 158, 11, 0.35)" : "rgba(56, 189, 248, 0.35)";

  toast.className = `toast-${type}`;

  // Direct inline styles guarantee dark mode text is bright white and completely immune to site style overrides
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
    border-radius: 999px !important;
    background: #0B0F19 !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1.5px solid ${borderColor} !important;
    box-shadow: 0 12px 35px rgba(0, 0, 0, 0.85), 0 0 25px ${glowColor} !important;
    color: #FFFFFF !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    font-size: 13.5px !important;
    font-weight: 600 !important;
    pointer-events: none !important;
    opacity: 0 !important;
    transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
  `;

  toast.innerHTML = `
    <span class="toast-icon" style="font-size: 16px !important; font-weight: 700 !important; color: ${iconColor} !important; display: inline-flex !important; align-items: center !important; line-height: 1 !important;">${icon}</span>
    <span class="toast-msg" style="color: #FFFFFF !important; font-size: 13.5px !important; font-weight: 600 !important; letter-spacing: 0.15px !important; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85) !important; display: inline-block !important;">${escapeHtml(message)}</span>
  `;

  requestAnimationFrame(() => {
    toast.classList.add("visible");
    toast.style.setProperty("opacity", "1", "important");
    toast.style.setProperty("transform", "translateX(-50%) translateY(0)", "important");
  });

  if (window._toastTimeout) clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.classList.remove("visible");
    toast.style.setProperty("opacity", "0", "important");
    toast.style.setProperty("transform", "translateX(-50%) translateY(-20px)", "important");
  }, duration);
}

function attachKeyboardShortcuts() {
  if (keydownListener) return;
  keydownListener = (e) => {
    if (e.altKey && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      handleAutoListTrigger(false);
    }
    if (e.altKey && (e.key === "s" || e.key === "S" || e.key === "c" || e.key === "C")) {
      e.preventDefault();
      handleQuickGrabTrigger();
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
  const pattern = /(?:Currently\s*Editing\s*Design|Editing\s*Design|Design|Item)\s*#?\s*(\d+)\s*(?:of|\/)\s*(\d+)/i;

  const statusEl = document.querySelector('.m-uploader__bulk-status-text, .m-uploader__bulk-status, [data-test="bulk-status"], .bulk-status');
  if (statusEl) {
    const text = statusEl.textContent || statusEl.innerText || '';
    const match = text.match(pattern);
    if (match) {
      return {
        currentIndex: parseInt(match[1], 10) - 1,
        totalCount: parseInt(match[2], 10),
        humanIndex: parseInt(match[1], 10)
      };
    }
  }

  const allText = document.body.innerText || '';
  const match = allText.match(pattern);
  if (match) {
    return {
      currentIndex: parseInt(match[1], 10) - 1,
      totalCount: parseInt(match[2], 10),
      humanIndex: parseInt(match[1], 10)
    };
  }

  return null;
}

function findPublishButton(isLastDesign = false) {
  if (isLastDesign) {
    // 1. On last design, prioritize Publish All / Publish button
    const bulkSubmit = document.querySelector('input[type="submit"][value*="Publish"], button[value*="Publish"], input.save-publish-later-button[value*="Publish"], input.save-publish-later-button, button.publish-and-promote-button, button[value="publish"]');
    if (bulkSubmit) return bulkSubmit;

    const greenBtn = document.querySelector('.save-publish-later-button.btn--green, input[type="submit"].btn--green, button.btn--green, input[type="submit"].btn--primary, button.btn--primary');
    if (greenBtn) return greenBtn;
  } else {
    // 1. Bulk uploader explicit submit Next buttons (when advancing design-by-design)
    const bulkNext = document.querySelector('input[type="submit"][value*="Next"], button[value*="Next"], input.btn--next, .btn-next-design');
    if (bulkNext && !bulkNext.disabled) return bulkNext;
  }

  // 2. Fallback to Publish buttons
  const bulkSubmitFallback = document.querySelector('input[type="submit"][value*="Publish"], input.save-publish-later-button[value*="Publish"], input.save-publish-later-button');
  if (bulkSubmitFallback) return bulkSubmitFallback;

  // 3. Publish and promote button
  const publishBtn = document.querySelector('button.publish-and-promote-button, button[value="publish"]');
  if (publishBtn) return publishBtn;

  // 4. Green CTA submit button
  const greenBtnFallback = document.querySelector('.save-publish-later-button.btn--green, input[type="submit"].btn--green, button.btn--green, input[type="submit"].btn--primary, button.btn--primary');
  if (greenBtnFallback) return greenBtnFallback;

  // 5. Any submit button in the design form
  const formSubmit = document.querySelector('form.edit_design input[type="submit"], form#edit_design input[type="submit"], form[action*="/designs/"] input[type="submit"], form[action*="/designs/"] button[type="submit"]');
  if (formSubmit) return formSubmit;

  return null;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

// ===================================================================
// COMPETITOR TAG & TITLE SCRAPER ENGINE (1-CLICK BATCH COLLECTOR)
// ===================================================================

function isProductPage() {
  const path = window.location.pathname.toLowerCase();
  const productSlugs = [
    "/t-shirt/", "/t-shirts/", "/hoodie/", "/hoodies/", "/tank-top/",
    "/crewneck-sweatshirt/", "/long-sleeve-t-shirt/", "/baseball-t-shirt/",
    "/kids-t-shirt/", "/baby-onesie/", "/sticker/", "/stickers/",
    "/phone-case/", "/phone-cases/", "/laptop-case/", "/mug/", "/mugs/",
    "/wall-art/", "/pillow/", "/pillows/", "/tote-bag/", "/tote-bags/",
    "/tapestry/", "/tapestries/", "/pin/", "/pins/", "/mask/", "/masks/",
    "/magnets/", "/magnet/", "/prints/", "/print/"
  ];

  for (const slug of productSlugs) {
    if (path.includes(slug)) return true;
  }

  // Check characteristic DOM elements
  if (document.querySelector('h1.product-title, h1[itemprop="name"], .product-details h1, .m-product-title')) {
    return true;
  }

  // Check for "Artist's Applied Tags" heading
  const allHeaders = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b'));
  const hasAppliedTags = allHeaders.some(el => (el.textContent || '').toLowerCase().includes("artist's applied tags"));
  if (hasAppliedTags) return true;

  return false;
}

function cleanScrapedText(str) {
  if (!str) return "";
  return str.replace(/\s+/g, " ").trim();
}

// ===================================================================
// STRICT ARTIST-APPLIED TAGS EXTRACTION ENGINE
// Strictly isolates ONLY the artist's own applied tags for this design.
// Zero bleeding into "Customers Also Search", "Trending", or "Related".
// ===================================================================

function cleanScrapedTag(str) {
  if (!str) return "";
  return str
    .replace(/^#+/, "")
    .replace(/["'\\]/g, "")
    .replace(/[\u2018\u2019\u201A\u201B\u2032'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeHeaderProbe(str) {
  if (!str) return "";
  return str
    .replace(/[\u2018\u2019\u201A\u201B\u2032'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isInvalidOrUnrelatedTag(tagText) {
  if (!tagText || tagText.length < 2 || tagText.length > 40) return true;

  const stopWords = [
    "artist's applied tags", "artist applied tags", "applied tags",
    "similar to", "customers also search", "customers also searched",
    "trending", "explore", "related searches", "more products",
    "more from this artist", "similar products", "tags", "t-shirts",
    "hoodies", "stickers", "cart", "account", "login", "browse",
    "home", "next", "previous"
  ];

  if (stopWords.includes(tagText)) return true;
  if (/^\d+$/.test(tagText)) return true;

  return false;
}

function extractArtistAppliedTagsStrictly(doc = document) {
  const extractedTags = [];

  // 1. Locate the exact "Artist's Applied Tags" heading element with normalized quotes
  const allHeaders = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, div, p, span, strong, b, label'));
  let appliedHeader = null;

  for (const el of allHeaders) {
    const rawTxt = el.textContent || '';
    if (rawTxt.length > 60) continue; // Must be a concise header/label, not a big block
    const norm = normalizeHeaderProbe(rawTxt);
    if (norm === "artist's applied tags" || norm === "artist applied tags" ||
        norm.startsWith("artist's applied tags") || norm.startsWith("artist applied tags")) {
      appliedHeader = el;
      break;
    }
  }

  // Fallback if slightly embedded in text
  if (!appliedHeader) {
    for (const el of allHeaders) {
      const rawTxt = el.textContent || '';
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
    // Check immediate next element sibling
    const nextSib = appliedHeader.nextElementSibling;
    if (nextSib) {
      const pills = nextSib.querySelectorAll('a, button, [data-tag], .tag, .pill');
      if (pills.length > 0) {
        tagsContainer = nextSib;
      }
    }

    // Check parent's next element sibling (if header was wrapped in <div class="header"><h3>...</h3></div>)
    if (!tagsContainer && appliedHeader.parentElement && appliedHeader.parentElement.nextElementSibling) {
      const parentSib = appliedHeader.parentElement.nextElementSibling;
      const pills = parentSib.querySelectorAll('a, button, [data-tag], .tag, .pill');
      if (pills.length > 0) {
        tagsContainer = parentSib;
      }
    }

    // Check sibling within parent that appears AFTER header
    if (!tagsContainer && appliedHeader.parentElement) {
      let passedHeader = false;
      for (const child of appliedHeader.parentElement.children) {
        if (child === appliedHeader || child.contains(appliedHeader)) {
          passedHeader = true;
          continue;
        }
        if (!passedHeader) continue;
        const pills = child.querySelectorAll('a, button, [data-tag], .tag, .pill');
        if (pills.length > 0) {
          tagsContainer = child;
          break;
        }
      }
    }
  }

  // Direct CSS fallback if DOM hierarchy varies
  if (!tagsContainer) {
    tagsContainer = doc.querySelector('.m-design-tags__list, [data-test="artist-applied-tags"], .artist-tags-list, .applied-tags-list');
  }

  // 3. Extract pills ONLY from this single container
  if (tagsContainer) {
    const pills = tagsContainer.querySelectorAll('a, button, [data-tag], .tag, .pill, li');
    for (const p of pills) {
      // Exclude muted / inactive / disabled elements (e.g., greyed out variant chips like Image 2 "christmas puns 1")
      if (p.classList?.contains("disabled") ||
          p.classList?.contains("inactive") ||
          p.classList?.contains("muted") ||
          p.classList?.contains("text-muted") ||
          p.classList?.contains("is-muted") ||
          p.getAttribute("aria-disabled") === "true") {
        continue;
      }

      const raw = p.getAttribute("data-tag") || p.textContent;
      const clean = cleanScrapedTag(raw);
      if (!isInvalidOrUnrelatedTag(clean)) {
        extractedTags.push(clean);
      }
    }
  }

  // Deduplicate and filter out variants like "christmas puns 1" if "christmas puns" exists
  const uniqueTags = [];
  const seen = new Set();

  for (const t of extractedTags) {
    if (!seen.has(t)) {
      seen.add(t);
      uniqueTags.push(t);
    }
  }

  // Filter out numbered suffix variants
  const filteredTags = uniqueTags.filter(tag => {
    const numMatch = tag.match(/^(.+?)\s+(\d+)$/);
    if (numMatch) {
      const basePhrase = numMatch[1].trim();
      if (seen.has(basePhrase)) {
        return false;
      }
    }
    return true;
  });

  // TeePublic Platform Constraint: Max 15 tags per listing
  return filteredTags.slice(0, 15);
}

function scrapeTeePublicProductPage() {
  const result = {
    id: "scraped_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
    url: window.location.href,
    title: "",
    store: "",
    mainTag: "",
    tags: [],
    price: "",
    imageUrl: "",
    timestamp: new Date().toISOString()
  };

  // 1. EXTRACT TITLE
  const h1Candidates = [
    document.querySelector('h1[itemprop="name"]'),
    document.querySelector('h1.product-title'),
    document.querySelector('h1.design-title'),
    document.querySelector('h1.m-product-title'),
    document.querySelector('.product-details h1'),
    document.querySelector('.product-meta h1'),
    document.querySelector('h1')
  ];
  for (const h1 of h1Candidates) {
    if (h1 && cleanScrapedText(h1.textContent)) {
      result.title = cleanScrapedText(h1.textContent);
      break;
    }
  }

  if (!result.title) {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      result.title = cleanScrapedText(ogTitle.content.split("|")[0]);
    }
  }

  if (!result.title) {
    const docTitle = document.title || "";
    result.title = cleanScrapedText(docTitle.split("|")[0].split("- TeePublic")[0]);
  }

  // 2. EXTRACT STORE / ARTIST NAME
  const storeLinks = [
    document.querySelector('a[href*="/user/"]'),
    document.querySelector('a[href*="/stores/"]'),
    document.querySelector('[itemprop="author"] a'),
    document.querySelector('.designer-name a, a.designer-name'),
    document.querySelector('.artist-name a, a.artist-name'),
    document.querySelector('a.store-link')
  ];
  for (const sl of storeLinks) {
    if (sl && cleanScrapedText(sl.textContent)) {
      result.store = cleanScrapedText(sl.textContent);
      break;
    }
  }

  if (!result.store) {
    const bodyText = document.body.innerText || "";
    const m = bodyText.match(/(?:designed\s+and\s+sold\s+by|sold\s+by|by)\s+([A-Za-z0-9_\-\s]{2,40})/i);
    if (m && m[1]) {
      result.store = cleanScrapedText(m[1].split("\n")[0]);
    }
  }

  // 3. EXTRACT STRICT ARTIST-APPLIED TAGS (EXCLUDES CUSTOMER SEARCHES & TRENDING)
  result.tags = extractArtistAppliedTagsStrictly(document);
  result.mainTag = result.tags.length > 0 ? result.tags[0] : "";

  // 4. IMAGE PREVIEW
  const imgEl = document.querySelector('.product-photos img, .product-image img, #design-image, img.product-img, [itemprop="image"]');
  if (imgEl && imgEl.src) {
    result.imageUrl = imgEl.src;
  }

  return result;
}

function mountQuickGrabLauncher(store) {
  if (document.getElementById("tp-quick-grab-launcher")) return;
  if (!isProductPage()) return;

  const currentList = store.scrapedCompetitorDesigns || [];
  const isEnabled = store.scraperEnabled !== false;

  const btn = document.createElement("div");
  btn.id = "tp-quick-grab-launcher";
  btn.className = isEnabled ? "" : "grab-deactivated";
  btn.title = "Click to Grab Title & Supporting Tags for Magic Listing (Alt+S)";
  btn.innerHTML = `
    <span class="grab-icon">📸</span>
    <span class="grab-label">Grab Tags</span>
    <span class="grab-badge" id="tpGrabCountBadge">${currentList.length}</span>
  `;

  document.body.appendChild(btn);

  btn.addEventListener("click", () => {
    handleQuickGrabTrigger();
  });
}

async function handleQuickGrabTrigger() {
  const store = await chrome.storage.local.get({
    scraperEnabled: true,
    scrapedCompetitorDesigns: []
  });

  if (store.scraperEnabled === false) {
    showToast("⚠️ Tag Scraper is OFF. Turn ON in extension popup to collect.", "warning", 3000);
    return;
  }

  const scraped = scrapeTeePublicProductPage();
  if (!scraped.title && scraped.tags.length === 0) {
    showToast("⚠️ Could not find listing title or tags on this page.", "warning", 2500);
    return;
  }

  const currentList = store.scrapedCompetitorDesigns || [];
  const storeName = (scraped.store || "Independent Store").trim();

  const existingIdx = currentList.findIndex(
    x => (x.url && scraped.url && x.url === scraped.url) ||
         (x.title && scraped.title && x.title.toLowerCase() === scraped.title.toLowerCase())
  );

  let updatedList = [...currentList];
  let isUpdate = false;
  let itemNum = updatedList.length + 1;

  if (existingIdx >= 0) {
    updatedList[existingIdx] = { ...updatedList[existingIdx], ...scraped };
    isUpdate = true;
    itemNum = existingIdx + 1;
  } else {
    updatedList.push(scraped);
  }

  await chrome.storage.local.set({ scrapedCompetitorDesigns: updatedList });

  const currentStoreTotal = updatedList.filter(item =>
    (item.store || "Independent Store").trim().toLowerCase() === storeName.toLowerCase()
  ).length;

  // Visual button feedback
  const grabBtn = document.getElementById("tp-quick-grab-launcher");
  if (grabBtn) {
    grabBtn.classList.add("grab-success");
    const label = grabBtn.querySelector(".grab-label");
    const badge = grabBtn.querySelector(".grab-badge");
    if (label) label.textContent = isUpdate ? `✓ Updated! (${updatedList.length})` : `✓ Saved! (${updatedList.length})`;
    if (badge) badge.textContent = updatedList.length;

    setTimeout(() => {
      grabBtn.classList.remove("grab-success");
      if (label) label.textContent = "Grab Tags";
    }, 2000);
  }

  // Update in-HUD badge
  const hudBadge = document.getElementById("hudScrapedCount");
  if (hudBadge) hudBadge.textContent = updatedList.length;

  // Show Toast
  const storeBadge = storeName ? ` • ${storeName} (${currentStoreTotal} designs)` : "";
  const toastMsg = isUpdate
    ? `✓ Updated #${itemNum}: "${scraped.title}" (${scraped.tags.length} artist tags${storeBadge})`
    : `✓ #${itemNum} Collected: "${scraped.title}" (${scraped.tags.length} artist tags${storeBadge}) • Total: ${updatedList.length}`;
  showToast(toastMsg, "success", 3000);
}

function downloadMagicListingCsvDirect(designs) {
  const headers = [
    "Design ID", "File Name", "Platform", "Title",
    "Tags / Keywords", "Description"
  ];
  const lines = [headers.join(",")];

  designs.forEach((item, idx) => {
    const designId = (item.id || `scraped_${idx + 1}`).slice(0, 12);
    const fileName = `design_${idx + 1}.png`;
    const platform = "teepublic";
    const title = item.title || `Competitor Design ${idx + 1}`;
    const storeName = item.store || "";
    const tagsStr = (Array.isArray(item.tags) ? item.tags : []).join(", ");
    const description = `${title} ${storeName ? 'by ' + storeName : ''}`.trim();

    const escapeCell = (c) => `"${String(c || '').replace(/"/g, '""')}"`;
    const row = [
      escapeCell(designId),
      escapeCell(fileName),
      escapeCell(platform),
      escapeCell(title),
      escapeCell(tagsStr),
      escapeCell(description)
    ];
    lines.push(row.join(","));
  });

  const csvContent = lines.join("\r\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `magic_listings_export_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast(`✓ Downloaded ${designs.length} listings to CSV!`, "success", 2500);
}
