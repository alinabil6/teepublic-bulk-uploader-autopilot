/**
 * Magic Fabrica — Extension Popup Controller (popup.js)
 * Real-time sync with Studio (127.0.0.1:5050), live 1/N design progress tracker,
 * Master Kill-Switch, and Competitor Tag Scraper CSV export.
 */

document.addEventListener("DOMContentLoaded", () => {
  const extensionToggle = document.getElementById("extensionToggle");
  const statusText = document.getElementById("statusText");
  const connDot = document.getElementById("connDot");
  const connLabel = document.getElementById("connLabel");
  const btnRefreshConn = document.getElementById("btnRefreshConn");

  const queueDesignTitle = document.getElementById("queueDesignTitle");
  const queueMainTag = document.getElementById("queueMainTag");
  const queueColor = document.getElementById("queueColor");
  const queueCounterBadge = document.getElementById("queueCounterBadge");

  const popupTrackerPct = document.getElementById("popupTrackerPct");
  const popupTrackerBarFill = document.getElementById("popupTrackerBarFill");
  const popupTrackerStatusLine = document.getElementById("popupTrackerStatusLine");

  const btnFillDesign = document.getElementById("btnFillDesign");
  const btnFillNext = document.getElementById("btnFillNext");
  const btnSyncLocal = document.getElementById("btnSyncLocal");

  // Tabs
  const tabBtnAutopilot = document.getElementById("tabBtnAutopilot");
  const tabBtnScraper = document.getElementById("tabBtnScraper");
  const panelAutopilot = document.getElementById("panelAutopilot");
  const panelScraper = document.getElementById("panelScraper");
  const scraperBadge = document.getElementById("scraperBadge");

  // Scraper elements
  const scraperToggle = document.getElementById("scraperToggle");
  const scraperStatusText = document.getElementById("scraperStatusText");
  const targetDot = document.getElementById("targetDot");
  const targetStatusLabel = document.getElementById("targetStatusLabel");
  const targetPreviewBox = document.getElementById("targetPreviewBox");
  const targetPreviewTitle = document.getElementById("targetPreviewTitle");
  const targetPreviewStore = document.getElementById("targetPreviewStore");
  const btnScrapeActiveTab = document.getElementById("btnScrapeActiveTab");
  const btnDownloadMagicCsv = document.getElementById("btnDownloadMagicCsv");
  const btnDownloadTwoRowCsv = document.getElementById("btnDownloadTwoRowCsv");
  const btnCopyAllTags = document.getElementById("btnCopyAllTags");
  const btnCopyAllTitles = document.getElementById("btnCopyAllTitles");
  const btnClearScrapedList = document.getElementById("btnClearScrapedList");
  const scrapedCardsScroll = document.getElementById("scrapedCardsScroll");
  const scrapedListCountBadge = document.getElementById("scrapedListCountBadge");
  const statScrapedTotal = document.getElementById("statScrapedTotal");
  const statUniqueTagsTotal = document.getElementById("statUniqueTagsTotal");
  const statArtistStoresTotal = document.getElementById("statArtistStoresTotal");

  let studioDesigns = [];

  // ==================== TAB NAVIGATION ====================
  function switchTab(tab) {
    const isAuto = tab === "autopilot";
    if (tabBtnAutopilot) tabBtnAutopilot.classList.toggle("active", isAuto);
    if (tabBtnScraper) tabBtnScraper.classList.toggle("active", !isAuto);
    if (panelAutopilot) panelAutopilot.classList.toggle("active", isAuto);
    if (panelScraper) panelScraper.classList.toggle("active", !isAuto);
    if (!isAuto) {
      checkActiveTabForScraper();
      renderScrapedCards();
    }
  }

  if (tabBtnAutopilot) tabBtnAutopilot.addEventListener("click", () => switchTab("autopilot"));
  if (tabBtnScraper) tabBtnScraper.addEventListener("click", () => switchTab("scraper"));

  // ==================== MASTER KILL-SWITCH ====================
  function updateToggleUI(enabled) {
    if (extensionToggle) extensionToggle.checked = enabled;
    if (statusText) {
      statusText.textContent = enabled ? "ON" : "OFF";
      statusText.className = `status-toggle-text ${enabled ? "active" : "inactive"}`;
    }
    if (btnFillDesign) btnFillDesign.disabled = !enabled;
    if (btnFillNext) btnFillNext.disabled = !enabled;
  }

  if (extensionToggle) {
    extensionToggle.addEventListener("change", () => {
      const enabled = extensionToggle.checked;
      updateToggleUI(enabled);
      chrome.runtime.sendMessage({ action: "SET_EXTENSION_ENABLED", enabled });
    });
  }

  // ==================== STUDIO QUEUE & PROGRESS TRACKER ====================
  async function refreshStudioState() {
    if (connLabel) connLabel.textContent = "Connecting to Studio (5050)...";
    const res = await chrome.runtime.sendMessage({ action: "FETCH_STUDIO_STATE" });
    if (res && res.success && res.data) {
      const data = res.data;
      studioDesigns = (data.designs || []).filter((d) => d.is_matched && d.has_thumbnail);
      const totalMatched = studioDesigns.length;

      if (connDot) connDot.classList.add("connected");
      if (connLabel) connLabel.textContent = `Studio Connected (${totalMatched} confirmed)`;

      const prog = data.progress || {};
      const currentIdx = prog.current > 0 ? Math.min(prog.current - 1, totalMatched - 1) : 0;
      const activeDesign = studioDesigns[currentIdx] || studioDesigns[0];

      if (activeDesign) {
        if (queueDesignTitle) queueDesignTitle.textContent = activeDesign.title || activeDesign.file_name;
        if (queueMainTag) queueMainTag.textContent = `Tag: ${activeDesign.main_tag || "—"}`;
        if (queueColor) queueColor.textContent = `Color: ${activeDesign.default_color || "Black"}`;
      } else {
        if (queueDesignTitle) queueDesignTitle.textContent = "No matched designs in queue";
      }

      if (queueCounterBadge) {
        const curNum = prog.current > 0 ? prog.current : (totalMatched > 0 ? 1 : 0);
        queueCounterBadge.textContent = `${curNum} / ${totalMatched}`;
      }

      renderTracker(prog);
    } else {
      if (connDot) connDot.classList.remove("connected");
      if (connLabel) connLabel.textContent = "Studio Offline (Launch port 5050)";
      if (queueDesignTitle) queueDesignTitle.textContent = "Waiting for Studio connection...";
      if (queueCounterBadge) queueCounterBadge.textContent = "0 / 0";
    }
  }

  function renderTracker(state) {
    if (!state) return;
    const pct = Math.min(100, Math.max(0, state.pct || 0));
    if (popupTrackerPct) popupTrackerPct.textContent = `${pct}%`;
    if (popupTrackerBarFill) popupTrackerBarFill.style.width = `${pct}%`;
    if (popupTrackerStatusLine) popupTrackerStatusLine.textContent = state.message || state.statusLine || "Ready";

    const stepNum = state.step || 0;
    for (let s = 1; s <= 6; s++) {
      const chip = document.getElementById(`pstep-${s}`);
      if (chip) {
        chip.classList.toggle("completed", s < stepNum);
        chip.classList.toggle("active", s === stepNum);
      }
    }
  }

  // Live storage listener for progress updates from content script
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.autopilotState) {
      renderTracker(changes.autopilotState.newValue);
    }
    if (changes.extensionEnabled) {
      updateToggleUI(changes.extensionEnabled.newValue !== false);
    }
    if (changes.scrapedListings || changes.scrapedCompetitorDesigns) {
      renderScrapedCards();
    }
  });

  // Action Buttons
  if (btnRefreshConn) btnRefreshConn.addEventListener("click", refreshStudioState);
  if (btnSyncLocal) btnSyncLocal.addEventListener("click", refreshStudioState);

  async function triggerAutopilotOnActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { action: "START_AUTOPILOT" }, () => {
      window.close();
    });
  }

  if (btnFillDesign) btnFillDesign.addEventListener("click", triggerAutopilotOnActiveTab);
  if (btnFillNext) btnFillNext.addEventListener("click", triggerAutopilotOnActiveTab);

  // ==================== COMPETITOR TAG SCRAPER ====================
  function updateScraperToggleUI(enabled) {
    if (scraperToggle) scraperToggle.checked = enabled;
    if (scraperStatusText) {
      scraperStatusText.textContent = enabled ? "ON" : "OFF";
      scraperStatusText.className = `status-toggle-text ${enabled ? "active" : "inactive"}`;
    }
    if (btnScrapeActiveTab) btnScrapeActiveTab.disabled = !enabled;
  }

  if (scraperToggle) {
    scraperToggle.addEventListener("change", () => {
      const enabled = scraperToggle.checked;
      updateScraperToggleUI(enabled);
      chrome.storage.local.set({ scraperEnabled: enabled });
    });
  }

  async function checkActiveTabForScraper() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes("teepublic.com")) {
      if (targetDot) targetDot.className = "target-dot";
      if (targetStatusLabel) targetStatusLabel.textContent = "Open a TeePublic product page";
      if (targetPreviewBox) targetPreviewBox.style.display = "none";
      if (btnScrapeActiveTab) btnScrapeActiveTab.disabled = true;
      return;
    }

    if (btnScrapeActiveTab) btnScrapeActiveTab.disabled = false;
    chrome.tabs.sendMessage(tab.id, { action: "PREVIEW_ACTIVE_TAB" }, (res) => {
      if (chrome.runtime.lastError || !res || !res.success || !res.item) {
        if (targetDot) targetDot.className = "target-dot";
        if (targetStatusLabel) targetStatusLabel.textContent = "No design listing detected on tab";
        if (targetPreviewBox) targetPreviewBox.style.display = "none";
        return;
      }
      if (targetDot) targetDot.className = "target-dot active";
      if (targetStatusLabel) targetStatusLabel.textContent = "TeePublic listing detected";
      if (targetPreviewBox) targetPreviewBox.style.display = "block";
      if (targetPreviewTitle) targetPreviewTitle.textContent = res.item.title;
      if (targetPreviewStore) targetPreviewStore.textContent = `Store: ${res.item.store || "Artist"}`;
    });
  }

  if (btnScrapeActiveTab) {
    btnScrapeActiveTab.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_ACTIVE_TAB" }, () => {
        renderScrapedCards();
      });
    });
  }

  function getScrapedList(callback) {
    chrome.storage.local.get(["scrapedListings", "scrapedCompetitorDesigns"], (res) => {
      const arr1 = Array.isArray(res.scrapedListings) ? res.scrapedListings : [];
      const arr2 = Array.isArray(res.scrapedCompetitorDesigns) ? res.scrapedCompetitorDesigns : [];

      const combined = [];
      const seen = new Set();

      for (const item of [...arr1, ...arr2]) {
        if (!item) continue;
        const key = (item.url || item.title || "").trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          combined.push(item);
        } else if (!key) {
          combined.push(item);
        }
      }
      callback(combined);
    });
  }

  function renderScrapedCards() {
    getScrapedList((list) => {
      if (scraperBadge) scraperBadge.textContent = String(list.length);
      if (scrapedListCountBadge) scrapedListCountBadge.textContent = `${list.length} items`;
      if (statScrapedTotal) statScrapedTotal.textContent = String(list.length);

      const uniqueTags = new Set();
      const uniqueStores = new Set();
      list.forEach((item) => {
        (item.allTags || []).forEach((t) => uniqueTags.add(t));
        if (item.store) uniqueStores.add(item.store);
      });
      if (statUniqueTagsTotal) statUniqueTagsTotal.textContent = String(uniqueTags.size);
      if (statArtistStoresTotal) statArtistStoresTotal.textContent = String(uniqueStores.size);

      if (!scrapedCardsScroll) return;

      if (list.length === 0) {
        scrapedCardsScroll.innerHTML = `
          <div class="empty-scraper-state">
            <div class="empty-icon">🏷️</div>
            <div class="empty-title">No designs collected yet</div>
            <div class="empty-sub">Open TeePublic competitor tabs, click "Grab Listing", or press <b>Alt+S</b>!</div>
          </div>`;
        return;
      }

      scrapedCardsScroll.innerHTML = list
        .map(
          (item, idx) => `
        <div class="scraped-card">
          <div class="scraped-card-header">
            <div class="scraped-card-title-group">
              <span class="scraped-num-badge">#${idx + 1}</span>
              <span class="scraped-card-title" title="${item.title}">${item.title}</span>
            </div>
          </div>
          <div class="scraped-card-meta">
            <span class="scraped-meta-store">Store: <strong>${item.store || "Artist"}</strong></span>
            <span class="scraped-meta-count">${(item.allTags || []).length} artist tags</span>
          </div>
          <div class="scraped-tags-list">
            ${(item.allTags || []).slice(0, 15).map((t) => `<span class="scraped-tag-pill">${t}</span>`).join("")}
          </div>
        </div>`
        )
        .join("");
    });
  }

  // ==================== CSV EXPORT ENGINES ====================

  function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    return `"${String(val).replace(/"/g, '""')}"`;
  }

  function showButtonFeedback(btn, text, isSuccess = true, duration = 2500) {
    if (!btn) return;
    const origHtml = btn.innerHTML;
    btn.innerHTML = `<span>${isSuccess ? "✓" : "⚠️"}</span> ${text}`;
    if (isSuccess) {
      btn.classList.add("btn-download-success");
    }
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.classList.remove("btn-download-success");
    }, duration);
  }

  function triggerUniversalDownload(csvString, filename, btnElement) {
    // Prepend UTF-8 BOM so Excel opens it with perfect unicode encoding
    const bom = "\uFEFF";
    const fullContent = bom + csvString;
    let success = false;

    // STRATEGY 1: Universal DOM Anchor + Blob URL (Works directly in Firefox, Tor, Chrome, Brave, Edge)
    try {
      const blob = new Blob([fullContent], { type: "text/csv;charset=utf-8;" });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.style.display = "none";
      link.setAttribute("href", blobUrl);
      link.setAttribute("download", filename);
      document.body.appendChild(link);

      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

      // Keep blob URL alive for 45s so Firefox never cancels the download mid-write
      setTimeout(() => {
        try {
          if (link.parentNode) link.parentNode.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        } catch (_) {}
      }, 45000);
      success = true;
    } catch (err1) {
      console.warn("[Magic Fabrica] Anchor blob download error:", err1);
    }

    // STRATEGY 2: DOM Anchor + Data URI (Fallback if blob URLs are restricted in Tor)
    if (!success) {
      try {
        const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(fullContent);
        const link = document.createElement("a");
        link.style.display = "none";
        link.setAttribute("href", dataUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        setTimeout(() => {
          try { if (link.parentNode) link.parentNode.removeChild(link); } catch (_) {}
        }, 5000);
        success = true;
      } catch (err2) {
        console.warn("[Magic Fabrica] Anchor data URI download error:", err2);
      }
    }

    // STRATEGY 3: Browser Extension Downloads API (Chrome / Brave fallback with Data URI)
    if (!success) {
      try {
        const dl = (typeof chrome !== "undefined" && chrome.downloads)
          ? chrome.downloads
          : ((typeof browser !== "undefined" && browser.downloads) ? browser.downloads : null);
        if (dl && typeof dl.download === "function") {
          const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(fullContent);
          dl.download({
            url: dataUri,
            filename: filename,
            saveAs: true
          }, () => {
            if (chrome.runtime?.lastError) {
              console.warn("[Magic Fabrica] dl error:", chrome.runtime.lastError);
            }
          });
          success = true;
        }
      } catch (err3) {
        console.warn("[Magic Fabrica] Extension downloads API error:", err3);
      }
    }

    // STRATEGY 4: Quaternary Fallback: Copy to clipboard if OS/browser sandboxing blocks file downloads
    if (!success) {
      try {
        navigator.clipboard.writeText(csvString).then(() => {
          if (btnElement) showButtonFeedback(btnElement, "Copied CSV to Clipboard!", true, 3000);
        });
        return;
      } catch (err4) {
        console.error("[Magic Fabrica] All download strategies failed:", err4);
      }
    }

    if (btnElement) {
      showButtonFeedback(btnElement, "Downloaded!", true, 2500);
    }
  }

  // 1. Exact 6-column format requested for Magic Listing & Studio upload:
  // Design ID, File Name, Platform, Title, Tags / Keywords, Description
  if (btnDownloadMagicCsv) {
    btnDownloadMagicCsv.addEventListener("click", () => {
      getScrapedList((list) => {
        if (!list.length) {
          showButtonFeedback(btnDownloadMagicCsv, "No designs to export", false, 2500);
          return;
        }
        const headers = ["Design ID", "File Name", "Platform", "Title", "Tags / Keywords", "Description"];
        const rows = [headers];

        list.forEach((item, idx) => {
          const designId = (item.id || `scraped_${idx + 1}`).slice(0, 12);
          const fileName = `design_${idx + 1}.png`;
          const platform = "teepublic";
          const title = item.title || `Design ${idx + 1}`;
          const tags = (item.allTags || []).join(", ");
          const desc = item.store ? `${title} by ${item.store}` : title;
          rows.push([designId, fileName, platform, title, tags, desc]);
        });

        const csvContent = rows
          .map((r) => r.map(escapeCsvCell).join(","))
          .join("\r\n");

        const filename = `magic_listing_export_${new Date().toISOString().slice(0, 10)}.csv`;
        triggerUniversalDownload(csvContent, filename, btnDownloadMagicCsv);
      });
    });
  }

  // 2. Exact 2-row raw format matching Image 3:
  // Row 1 = Title, Row 2 = space-separated tags
  if (btnDownloadTwoRowCsv) {
    btnDownloadTwoRowCsv.addEventListener("click", () => {
      getScrapedList((list) => {
        if (!list.length) {
          showButtonFeedback(btnDownloadTwoRowCsv, "No designs to export", false, 2500);
          return;
        }
        const lines = [];

        list.forEach((item) => {
          lines.push(escapeCsvCell(item.title || ""));
          const tagsStr = (item.allTags || []).join(" ");
          lines.push(escapeCsvCell(tagsStr));
        });

        const csvContent = lines.join("\r\n");
        const filename = `teepublic_raw_titles_tags_${new Date().toISOString().slice(0, 10)}.csv`;
        triggerUniversalDownload(csvContent, filename, btnDownloadTwoRowCsv);
      });
    });
  }

  if (btnClearScrapedList) {
    btnClearScrapedList.addEventListener("click", () => {
      chrome.storage.local.set({ scrapedListings: [], scrapedCompetitorDesigns: [] }, renderScrapedCards);
    });
  }

  if (btnCopyAllTags) {
    btnCopyAllTags.addEventListener("click", () => {
      getScrapedList((list) => {
        if (!list.length) {
          showButtonFeedback(btnCopyAllTags, "No tags", false, 2000);
          return;
        }
        const all = Array.from(new Set(list.flatMap((x) => x.allTags || []))).join(", ");
        navigator.clipboard.writeText(all).then(() => {
          showButtonFeedback(btnCopyAllTags, "Copied!", true, 2000);
        });
      });
    });
  }

  if (btnCopyAllTitles) {
    btnCopyAllTitles.addEventListener("click", () => {
      getScrapedList((list) => {
        if (!list.length) {
          showButtonFeedback(btnCopyAllTitles, "No titles", false, 2000);
          return;
        }
        navigator.clipboard.writeText(list.map((x) => x.title).join("\n")).then(() => {
          showButtonFeedback(btnCopyAllTitles, "Copied!", true, 2000);
        });
      });
    });
  }

  // Collapsible Accordion
  const prefHeader = document.getElementById("prefHeader");
  const prefBody = document.getElementById("prefBody");
  const prefChevron = document.getElementById("prefChevron");
  if (prefHeader) {
    prefHeader.addEventListener("click", () => {
      if (prefBody) prefBody.classList.toggle("collapsed");
      if (prefChevron) prefChevron.classList.toggle("open");
    });
  }

  // Initial Load
  chrome.storage.local.get(["extensionEnabled", "scraperEnabled", "autopilotState"], (res) => {
    updateToggleUI(res.extensionEnabled !== false);
    updateScraperToggleUI(res.scraperEnabled !== false);
    if (res.autopilotState) renderTracker(res.autopilotState);
  });
  refreshStudioState();
  renderScrapedCards();
});
