/**
 * TeePublic Bulk Uploader Companion — Background Service Worker (Manifest V3)
 * Universal compatibility: Tor Browser, Firefox, Chrome, Brave, Edge
 */

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[TeePublic Companion] Background Service Worker installed.");
  const existing = await chrome.storage.local.get(["extensionEnabled", "scraperEnabled", "scrapedCompetitorDesigns"]);
  const updates = {};
  if (existing.extensionEnabled === undefined) {
    updates.extensionEnabled = true;
    updates.activeDesignIndex = 0;
    updates.prefColorMode = "dark";
    updates.prefPrintLocation = "front";
    updates.prefMature = "no";
    updates.prefDefaultColor = "Black";
    updates.cachedDesigns = [];
  }
  if (existing.scraperEnabled === undefined) {
    updates.scraperEnabled = true;
  }
  if (existing.scrapedCompetitorDesigns === undefined) {
    updates.scrapedCompetitorDesigns = [];
  }
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
  updateBadge(true);
});

// Update Action Badge based on activation state
function updateBadge(enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#10B981" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// Memory-safe, chunked ArrayBuffer to Base64 encoder (handles 50MB+ images without call stack overflow)
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 16384;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// Canonical design identifier extractor — strictly based on URL ID or canonical link
function extractCanonicalDesignKey(url) {
  if (!url || typeof url !== "string") return "";
  const m1 = url.match(/\/(?:[a-z0-9\-]+)\/(\d{5,12})(?:-[a-z0-9\-]+)?/i);
  if (m1 && m1[1]) return `tp_${m1[1]}`;
  const m2 = url.match(/\/designs\/(\d{5,12})/i);
  if (m2 && m2[1]) return `tp_${m2[1]}`;
  const m3 = url.match(/design_id=(\d{5,12})/i);
  if (m3 && m3[1]) return `tp_${m3[1]}`;
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, "").toLowerCase();
  } catch (_) {
    return url.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
  }
}

// Atomic FIFO queue to serialize concurrent grabs across multiple tabs
let isProcessingScrapedQueue = false;
const scrapedSaveQueue = [];

async function drainScrapedSaveQueue() {
  if (isProcessingScrapedQueue || scrapedSaveQueue.length === 0) return;
  isProcessingScrapedQueue = true;

  while (scrapedSaveQueue.length > 0) {
    const task = scrapedSaveQueue.shift();
    try {
      const store = await chrome.storage.local.get({ scrapedCompetitorDesigns: [] });
      const currentList = Array.isArray(store.scrapedCompetitorDesigns) ? store.scrapedCompetitorDesigns : [];

      const item = task.item || {};
      const itemKey = item.canonicalKey || extractCanonicalDesignKey(item.url) || item.id;
      item.canonicalKey = itemKey;

      // Extract numeric design ID if present
      const idMatch = (item.url || "").match(/\/(?:[a-z0-9\-]+)\/(\d{5,12})(?:-[a-z0-9\-]+)?/i) || 
                      (item.url || "").match(/\/designs\/(\d{5,12})/i);
      if (idMatch && idMatch[1]) {
        item.designId = idMatch[1];
      }

      // STRICT DEDUPLICATION: Match ONLY by canonical design ID or URL. NEVER by title!
      const existingIdx = currentList.findIndex(x => {
        const xKey = x.canonicalKey || extractCanonicalDesignKey(x.url) || x.id;
        if (xKey && itemKey && xKey === itemKey) return true;
        if (x.designId && item.designId && x.designId === item.designId) return true;
        if (x.url && item.url) {
          const cleanX = x.url.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
          const cleanItem = item.url.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
          if (cleanX === cleanItem) return true;
        }
        return false;
      });

      let updatedList = [...currentList];
      let isUpdate = false;
      let itemNum = updatedList.length + 1;

      if (existingIdx >= 0) {
        // Same exact design ID re-grabbed: refresh tags & metadata in-place
        updatedList[existingIdx] = { ...updatedList[existingIdx], ...item };
        isUpdate = true;
        itemNum = existingIdx + 1;
      } else {
        // Distinct design: append as brand new item
        updatedList.push(item);
      }

      await chrome.storage.local.set({ scrapedCompetitorDesigns: updatedList });

      task.sendResponse({
        success: true,
        isUpdate: isUpdate,
        itemNum: itemNum,
        totalCount: updatedList.length,
        item: item
      });
    } catch (err) {
      console.error("[Background Scraper Queue Error]:", err);
      task.sendResponse({ success: false, error: err.message || "Failed to save design" });
    }
  }

  isProcessingScrapedQueue = false;
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TOGGLE_EXTENSION") {
    updateBadge(message.enabled);
    // Broadcast to all TeePublic tabs
    chrome.tabs.query({ url: "*://*.teepublic.com/*" }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      }
    });
    sendResponse({ success: true, enabled: message.enabled });
    return true;
  }

  if (message.action === "TOGGLE_SCRAPER") {
    chrome.tabs.query({ url: "*://*.teepublic.com/*" }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      }
    });
    sendResponse({ success: true, enabled: message.enabled });
    return true;
  }

  if (message.action === "GET_EXTENSION_STATUS") {
    chrome.storage.local.get("extensionEnabled", (res) => {
      sendResponse({ enabled: res.extensionEnabled !== false });
    });
    return true;
  }

  if (message.action === "START_AUTO_LISTING") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    });
    sendResponse({ success: true });
    return true;
  }

  // ===================================================================
  // ATOMIC COMPETITOR DESIGN SAVER QUEUE (Eliminates Multi-Tab Race Conditions)
  // ===================================================================

  if (message.action === "SAVE_SCRAPED_DESIGN") {
    scrapedSaveQueue.push({
      item: message.data || {},
      sendResponse: sendResponse
    });
    drainScrapedSaveQueue();
    return true; // Keep message channel open for async response
  }

  // ===================================================================
  // PRIVILEGED LOCAL API PROXY (Bypasses Tor/Firefox Mixed-Content Blocks)
  // ===================================================================

  if (message.action === "FETCH_LOCAL_STATE") {
    (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch("http://127.0.0.1:5050/api/state", {
          signal: controller.signal,
          cache: "no-store"
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          sendResponse({ success: false, error: `HTTP ${res.status}` });
          return;
        }

        const state = await res.json();
        sendResponse({ success: true, state: state });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Failed to reach local server" });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.action === "FETCH_LOCAL_THUMBNAIL") {
    (async () => {
      try {
        const idx = message.index !== undefined ? message.index : 0;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 65000);
        const res = await fetch(`http://127.0.0.1:5050/api/thumbnail/${idx}`, {
          signal: controller.signal,
          cache: "no-store"
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          sendResponse({ success: false, error: `HTTP ${res.status}: Failed to fetch thumbnail for index ${idx}` });
          return;
        }

        const mimeType = res.headers.get("content-type") || "image/png";
        const buffer = await res.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);

        sendResponse({
          success: true,
          base64: base64,
          mimeType: mimeType
        });
      } catch (err) {
        const isTimeout = err.name === "AbortError";
        const errMsg = isTimeout
          ? `Timeout (65s) fetching thumbnail #${message.index} from local server`
          : (err.message || "Failed to fetch thumbnail");
        sendResponse({ success: false, error: errMsg });
      }
    })();
    return true; // Keep message channel open for async response
  }
});
