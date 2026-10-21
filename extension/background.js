/**
 * TeePublic Bulk Uploader Companion — Background Service Worker (Manifest V3)
 * Universal compatibility: Tor Browser, Firefox, Chrome, Brave, Edge
 */

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[TeePublic Companion] Background Service Worker installed.");
  const existing = await chrome.storage.local.get("extensionEnabled");
  if (existing.extensionEnabled === undefined || existing.extensionEnabled === false) {
    await chrome.storage.local.set({
      extensionEnabled: true,
      activeDesignIndex: 0,
      prefColorMode: "dark",
      prefPrintLocation: "front",
      prefMature: "no",
      prefDefaultColor: "Black",
      cachedDesigns: []
    });
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
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        const res = await fetch(`http://127.0.0.1:5050/api/thumbnail/${idx}`, {
          signal: controller.signal,
          cache: "no-store"
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          sendResponse({ success: false, error: `HTTP ${res.status}` });
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
        sendResponse({ success: false, error: err.message || "Failed to fetch thumbnail" });
      }
    })();
    return true; // Keep message channel open for async response
  }
});
