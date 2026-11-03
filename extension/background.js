/**
 * Magic Fabrica — TeePublic Autopilot Background Service Worker (MV3)
 * Coordinates state between Local Studio (127.0.0.1:5050), Popup, and TeePublic Content Script.
 */

const STUDIO_URLS = ["http://127.0.0.1:5050", "http://localhost:5050"];

async function fetchStudio(endpoint, options = {}) {
  for (const base of STUDIO_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${base}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      clearTimeout(timer);
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {
      // Try fallback localhost URL
    }
  }
  return null;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    ["extensionEnabled", "scraperEnabled", "autopilotState", "scrapedListings", "scrapedCompetitorDesigns", "theme"],
    (res) => {
      const defaults = {};
      if (typeof res.extensionEnabled === "undefined") defaults.extensionEnabled = true;
      if (typeof res.scraperEnabled === "undefined") defaults.scraperEnabled = true;
      if (typeof res.theme === "undefined") defaults.theme = "dark";
      if (!res.scrapedListings && !res.scrapedCompetitorDesigns) defaults.scrapedListings = [];
      if (!res.autopilotState) {
        defaults.autopilotState = {
          isRunning: false,
          batchCompleted: false,
          step: 0,
          pct: 0,
          currentDesign: 0,
          totalDesigns: 0,
          statusLine: "Ready to start",
          sessionId: null
        };
      }
      if (Object.keys(defaults).length > 0) {
        chrome.storage.local.set(defaults);
      }
    }
  );
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return false;

  // 1. Master Kill-Switch Toggle (Immediate Halt)
  if (msg.action === "SET_EXTENSION_ENABLED") {
    const enabled = Boolean(msg.enabled);
    chrome.storage.local.get(["autopilotState"], (data) => {
      const nextState = {
        ...(data.autopilotState || {}),
        isRunning: enabled ? (data.autopilotState?.isRunning || false) : false,
        statusLine: enabled ? "Ready to start" : "Autopilot Deactivated (OFF)"
      };
      chrome.storage.local.set({ extensionEnabled: enabled, autopilotState: nextState }, () => {
        fetchStudio("/api/autopilot/toggle", {
          method: "POST",
          body: JSON.stringify({ enabled })
        });
        // Broadcast immediate stop to all TeePublic tabs
        chrome.tabs.query({ url: ["*://*.teepublic.com/*", "*://teepublic.com/*"] }, (tabs) => {
          tabs.forEach((t) => {
            chrome.tabs.sendMessage(t.id, {
              action: enabled ? "EXTENSION_ACTIVATED" : "HARD_ABORT_AUTOPILOT"
            }).catch(() => {});
          });
        });
        sendResponse({ success: true, enabled });
      });
    });
    return true;
  }

  // 2. Progress Sync from Content Script -> Storage + Studio Server
  if (msg.action === "UPDATE_AUTOPILOT_PROGRESS") {
    const payload = msg.payload || {};
    chrome.storage.local.get(["autopilotState"], (data) => {
      const updated = {
        ...(data.autopilotState || {}),
        ...payload,
        updatedAt: Date.now()
      };
      chrome.storage.local.set({ autopilotState: updated }, () => {
        fetchStudio("/api/autopilot/progress", {
          method: "POST",
          body: JSON.stringify({
            current: updated.currentDesign || 0,
            total: updated.totalDesigns || 0,
            step: updated.step || 0,
            pct: updated.pct || 0,
            stage: updated.batchCompleted ? "completed" : (updated.isRunning ? "running" : "idle"),
            running: Boolean(updated.isRunning),
            message: updated.statusLine || ""
          })
        });
        sendResponse({ success: true, state: updated });
      });
    });
    return true;
  }

  // 3. Fetch Studio State Proxy (Avoids Mixed-Content / CORS issues on HTTPS TeePublic)
  if (msg.action === "FETCH_STUDIO_STATE") {
    fetchStudio("/api/state").then((data) => {
      sendResponse({ success: Boolean(data), data });
    });
    return true;
  }

  // 4. Fetch Artwork Binary as Base64 DataURL for reliable multi-file injection
  if (msg.action === "FETCH_ARTWORK_BASE64") {
    const idx = msg.index;
    (async () => {
      for (const base of STUDIO_URLS) {
        try {
          const res = await fetch(`${base}/api/thumbnail/${idx}?base=0&t=${Date.now()}`);
          if (res.ok) {
            const blob = await res.blob();
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            sendResponse({
              success: true,
              dataUrl,
              mimeType: blob.type || "image/png"
            });
            return;
          }
        } catch (_) {}
      }
      sendResponse({ success: false, error: `Failed to fetch artwork #${idx}` });
    })();
    return true;
  }

  return false;
});
