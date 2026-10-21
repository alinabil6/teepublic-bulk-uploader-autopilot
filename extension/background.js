/**
 * TeePublic Bulk Uploader Companion — Background Service Worker (Manifest V3)
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
});
