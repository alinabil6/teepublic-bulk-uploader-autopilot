/**
 * TeePublic Autopilot Agent — Popup Controller
 */

const LOCAL_SERVER_URL = "http://127.0.0.1:5050/api/state";

document.addEventListener("DOMContentLoaded", async () => {
  const extensionToggle = document.getElementById("extensionToggle");
  const statusText = document.getElementById("statusText");

  const connDot = document.getElementById("connDot");
  const connLabel = document.getElementById("connLabel");
  const btnRefreshConn = document.getElementById("btnRefreshConn");

  const queueDesignTitle = document.getElementById("queueDesignTitle");
  const queueCounterBadge = document.getElementById("queueCounterBadge");
  const queueMainTag = document.getElementById("queueMainTag");
  const queueColor = document.getElementById("queueColor");

  const btnFillDesign = document.getElementById("btnFillDesign");
  const btnFillNext = document.getElementById("btnFillNext");
  const btnSyncLocal = document.getElementById("btnSyncLocal");

  const prefHeader = document.getElementById("prefHeader");
  const prefBody = document.getElementById("prefBody");
  const prefChevron = document.getElementById("prefChevron");

  const prefColorMode = document.getElementById("prefColorMode");
  const prefPrintLocation = document.getElementById("prefPrintLocation");
  const prefMature = document.getElementById("prefMature");
  const prefDefaultColor = document.getElementById("prefDefaultColor");

  // Tracker Elements
  const popupTrackerPct = document.getElementById("popupTrackerPct");
  const popupTrackerBarFill = document.getElementById("popupTrackerBarFill");
  const popupTrackerStatusLine = document.getElementById("popupTrackerStatusLine");

  function updatePopupTrackerUI(tracker) {
    if (!tracker) return;
    const pct = tracker.pct || 0;
    const msg = tracker.msg || "Ready";
    const step = tracker.step || 1;

    if (popupTrackerPct) popupTrackerPct.textContent = `${pct}%`;
    if (popupTrackerBarFill) popupTrackerBarFill.style.width = `${pct}%`;
    if (popupTrackerStatusLine) popupTrackerStatusLine.textContent = msg;

    for (let i = 1; i <= 6; i++) {
      const chip = document.getElementById(`pstep-${i}`);
      if (!chip) continue;
      chip.classList.remove("active", "completed");
      if (i < step) {
        chip.classList.add("completed");
      } else if (i === step) {
        chip.classList.add("active");
      }
    }
  }

  // Load initial tracker state from storage
  chrome.storage.local.get(["trackerState", "pendingAutoList"], (res) => {
    if (res.trackerState) {
      // If previous run finished (100%) and no active pending run, reset to Ready
      if (res.trackerState.pct >= 100 && !res.pendingAutoList) {
        updatePopupTrackerUI({ step: 1, pct: 0, msg: "Autopilot Ready" });
      } else {
        updatePopupTrackerUI(res.trackerState);
      }
    }
  });

  // Listen for live tracker messages from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "TRACKER_UPDATE" && msg.tracker) {
      updatePopupTrackerUI(msg.tracker);
      if (msg.tracker.pct > 0 && msg.tracker.pct < 100) {
        // Tracker running
      } else if (msg.tracker.pct === 100) {
        updatePopupTrackerUI({ step: 6, pct: 100, msg: "Completed" });
      }
    }
  });

  function updateToggleUI(isEnabled) {
    if (extensionToggle) extensionToggle.checked = isEnabled;
    if (statusText) {
      statusText.textContent = isEnabled ? "ON" : "OFF";
      statusText.className = isEnabled ? "status-toggle-text active" : "status-toggle-text inactive";
    }
    if (btnFillDesign) {
      btnFillDesign.disabled = !isEnabled;
      if (!isEnabled) {
        btnFillDesign.innerHTML = `<span class="btn-icon">⏸️</span> EXTENSION DEACTIVATED (OFF)`;
      } else {
        btnFillDesign.innerHTML = `<span class="btn-icon">🚀</span> START AUTOPILOT (1-CLICK)`;
      }
    }
    if (btnFillNext) {
      btnFillNext.disabled = !isEnabled;
    }
  }

  if (extensionToggle) {
    extensionToggle.addEventListener("change", async (e) => {
      const isEnabled = e.target.checked;
      await chrome.storage.local.set({ extensionEnabled: isEnabled, pendingAutoList: false });
      updateToggleUI(isEnabled);

      // Broadcast toggle change to all open TeePublic tabs
      try {
        const tabs = await chrome.tabs.query({ url: "*://*.teepublic.com/*" });
        for (const t of tabs) {
          chrome.tabs.sendMessage(t.id, { action: "TOGGLE_EXTENSION", enabled: isEnabled }).catch(() => {});
        }
      } catch (_) {}
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.extensionEnabled !== undefined) {
      updateToggleUI(Boolean(changes.extensionEnabled.newValue));
    }
  });

  // 1. Load Stored State
  const data = await chrome.storage.local.get({
    extensionEnabled: true,
    activeDesignIndex: 0,
    prefColorMode: "dark",
    prefPrintLocation: "front",
    prefMature: "no",
    prefDefaultColor: "Black",
    cachedDesigns: []
  });

  updateToggleUI(data.extensionEnabled);

  prefColorMode.value = data.prefColorMode;
  prefPrintLocation.value = data.prefPrintLocation;
  prefMature.value = data.prefMature;
  prefDefaultColor.value = data.prefDefaultColor;

  updateQueueUI(data.cachedDesigns, data.activeDesignIndex);

  // 2. Fetch live data from local Desktop Studio server
  await checkLocalServer();

  // 3. Event Listeners
  btnRefreshConn.addEventListener("click", checkLocalServer);
  btnSyncLocal.addEventListener("click", checkLocalServer);

  // Accordion Toggle
  prefHeader.addEventListener("click", () => {
    prefBody.classList.toggle("collapsed");
    prefChevron.classList.toggle("open");
  });

  // Save Preferences on change
  [prefColorMode, prefPrintLocation, prefMature, prefDefaultColor].forEach((el) => {
    el.addEventListener("change", async () => {
      await chrome.storage.local.set({
        prefColorMode: prefColorMode.value,
        prefPrintLocation: prefPrintLocation.value,
        prefMature: prefMature.value,
        prefDefaultColor: prefDefaultColor.value
      });
    });
  });

  // 1-Click Autopilot
  btnFillDesign.addEventListener("click", async () => {
    await triggerAutopilot(true);
  });

  // Autopilot & Next
  btnFillNext.addEventListener("click", async () => {
    await triggerAutopilot(true);
  });

  function updateQueueUI(designs, index) {
    if (!designs || designs.length === 0) {
      queueDesignTitle.textContent = "No listings loaded";
      queueCounterBadge.textContent = "0 / 0";
      if (queueMainTag) queueMainTag.textContent = "Tag: None";
      if (queueColor) queueColor.textContent = "Color: None";
      return;
    }
    const current = designs[index] || designs[0];
    queueDesignTitle.textContent = current.title || current.file_name || `Design #${index + 1}`;
    queueCounterBadge.textContent = `${index + 1} / ${designs.length}`;
    if (queueMainTag) queueMainTag.textContent = `Tag: ${current.main_tag || 'Auto'}`;
    const defaultCol = current.default_color 
                    || current.product_colors?.["T-Shirt"] 
                    || current.apparel_settings?.["T-Shirt"]?.defaultColor 
                    || "Black";
    if (queueColor) queueColor.textContent = `Color: ${defaultCol}`;
  }

  async function checkLocalServer() {
    connDot.className = "conn-dot";
    connLabel.textContent = "Checking Studio Queue (Port 5050)...";

    // 1. Try privileged background script proxy first (bypasses Tor/Firefox restrictions)
    let serverState = null;
    try {
      serverState = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "FETCH_LOCAL_STATE" }, (resp) => {
          if (!chrome.runtime.lastError && resp && resp.success && resp.state) {
            resolve(resp.state);
          } else {
            resolve(null);
          }
        });
      });
    } catch (_) {}

    // 2. Direct fetch fallback
    if (!serverState) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(LOCAL_SERVER_URL, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          serverState = await res.json();
        }
      } catch (_) {}
    }

    if (serverState) {
      const designs = serverState.designs || [];
      connDot.className = "conn-dot connected";
      connLabel.textContent = `Connected (Port 5050) — ${designs.length} listings in queue`;

      const curIdx = serverState.current_index >= 0 ? serverState.current_index : 0;
      await chrome.storage.local.set({
        cachedDesigns: designs,
        activeDesignIndex: curIdx,
        extensionEnabled: true
      });
      updateQueueUI(designs, curIdx);
      return;
    }

    // Fallback to offline / stored cache
    connDot.className = "conn-dot";
    connLabel.textContent = "Desktop Studio Offline (Using Cached Queue)";
    const currentStorage = await chrome.storage.local.get({ cachedDesigns: [], activeDesignIndex: 0 });
    updateQueueUI(currentStorage.cachedDesigns, currentStorage.activeDesignIndex);
  }

  async function triggerAutopilot(advanceNext = true) {
    const store = await chrome.storage.local.get({ extensionEnabled: true });
    if (store.extensionEnabled === false) {
      alert("Autopilot is currently turned OFF. Turn the toggle ON first!");
      return;
    }

    btnFillDesign.disabled = true;
    btnFillDesign.innerHTML = `<span>⚙️</span> Autopilot Starting...`;
    updatePopupTrackerUI({ step: 1, pct: 15, msg: "Starting Autopilot pipeline..." });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isTeePublic = Boolean(tab?.url && tab.url.includes("teepublic.com"));

    // Authorize pipeline in storage
    await chrome.storage.local.set({
      pendingAutoList: true,
      triggeredByPopupTimestamp: Date.now(),
      advanceNextAfterFill: advanceNext
    });

    if (!isTeePublic) {
      if (tab?.id) {
        chrome.tabs.update(tab.id, { url: "https://www.teepublic.com/designs/bulk_uploader" });
      } else {
        chrome.tabs.create({ url: "https://www.teepublic.com/designs/bulk_uploader" });
      }

      btnFillDesign.innerHTML = `<span>🚀</span> Opening Bulk Uploader...`;
      setTimeout(() => window.close(), 800);
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "START_AUTO_LISTING",
        advanceNext: advanceNext
      });

      if (response && response.success) {
        btnFillDesign.innerHTML = `<span>✓</span> Autopilot Active!`;
        setTimeout(() => window.close(), 700);
        return;
      }
    } catch (err) {
      console.warn("Message sending error, refreshing TeePublic tab with active pipeline token:", err);
      // If message failed (e.g. page was open prior to extension reload), reload tab so content script injects fresh
      chrome.tabs.reload(tab.id);
      btnFillDesign.innerHTML = `<span>🚀</span> Autopilot Launched!`;
      setTimeout(() => window.close(), 800);
    } finally {
      setTimeout(() => {
        btnFillDesign.disabled = false;
        btnFillDesign.innerHTML = `<span class="btn-icon">🚀</span> START AUTOPILOT (1-CLICK)`;
      }, 1500);
    }
  }
});
