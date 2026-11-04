/**
 * Magic Fabrica — TeePublic Companion (Autopilot & Competitor Tag Scraper)
 * Popup Controller (Manifest V3)
 */

const LOCAL_SERVER_URL = "http://127.0.0.1:5050/api/state";

document.addEventListener("DOMContentLoaded", async () => {
  // Navigation Tabs
  const tabBtnAutopilot = document.getElementById("tabBtnAutopilot");
  const tabBtnScraper = document.getElementById("tabBtnScraper");
  const panelAutopilot = document.getElementById("panelAutopilot");
  const panelScraper = document.getElementById("panelScraper");
  const scraperBadge = document.getElementById("scraperBadge");

  // Autopilot Master Elements
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

  // Scraper UI Elements
  const scraperToggle = document.getElementById("scraperToggle");
  const scraperStatusText = document.getElementById("scraperStatusText");
  const targetDot = document.getElementById("targetDot");
  const targetStatusLabel = document.getElementById("targetStatusLabel");
  const targetPreviewBox = document.getElementById("targetPreviewBox");
  const targetPreviewTitle = document.getElementById("targetPreviewTitle");
  const targetPreviewStore = document.getElementById("targetPreviewStore");
  const btnScrapeActiveTab = document.getElementById("btnScrapeActiveTab");

  const statScrapedTotal = document.getElementById("statScrapedTotal");
  const statUniqueTagsTotal = document.getElementById("statUniqueTagsTotal");
  const statArtistStoresTotal = document.getElementById("statArtistStoresTotal");

  const storeQuotasList = document.getElementById("storeQuotasList");

  const btnDownloadMagicCsv = document.getElementById("btnDownloadMagicCsv");
  const btnDownloadTwoRowCsv = document.getElementById("btnDownloadTwoRowCsv");
  const btnCopyAllTags = document.getElementById("btnCopyAllTags");
  const btnCopyAllTitles = document.getElementById("btnCopyAllTitles");
  const btnClearScrapedList = document.getElementById("btnClearScrapedList");

  const scrapedListCountBadge = document.getElementById("scrapedListCountBadge");
  const scrapedCardsScroll = document.getElementById("scrapedCardsScroll");
  const emptyScraperState = document.getElementById("emptyScraperState");

  // ===================================================================
  // 1. TAB SWITCHING LOGIC
  // ===================================================================
  function switchTab(tabName) {
    if (tabName === "scraper") {
      tabBtnAutopilot.classList.remove("active");
      tabBtnScraper.classList.add("active");
      panelAutopilot.classList.remove("active");
      panelScraper.classList.add("active");
      checkActiveTabForScraper();
    } else {
      tabBtnScraper.classList.remove("active");
      tabBtnAutopilot.classList.add("active");
      panelScraper.classList.remove("active");
      panelAutopilot.classList.add("active");
    }
    chrome.storage.local.set({ activePopupTab: tabName });
  }

  tabBtnAutopilot.addEventListener("click", () => switchTab("autopilot"));
  tabBtnScraper.addEventListener("click", () => switchTab("scraper"));

  // ===================================================================
  // 2. AUTOPILOT TRACKER & TOGGLE
  // ===================================================================
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

  function updateAutopilotToggleUI(isEnabled) {
    if (extensionToggle) extensionToggle.checked = isEnabled;
    if (statusText) {
      statusText.textContent = isEnabled ? "ON" : "OFF";
      statusText.className = isEnabled ? "status-toggle-text active" : "status-toggle-text inactive";
    }
    if (btnFillDesign) {
      btnFillDesign.disabled = !isEnabled;
      if (!isEnabled) {
        btnFillDesign.innerHTML = `<span class="btn-icon">⏸️</span> AUTOPILOT OFF`;
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
      updateAutopilotToggleUI(isEnabled);

      // Broadcast toggle change to all open TeePublic tabs
      try {
        const tabs = await chrome.tabs.query({ url: "*://*.teepublic.com/*" });
        for (const t of tabs) {
          chrome.tabs.sendMessage(t.id, { action: "TOGGLE_EXTENSION", enabled: isEnabled }).catch(() => {});
        }
      } catch (_) {}
    });
  }

  // ===================================================================
  // 3. COMPETITOR TAG SCRAPER TOGGLE & STATE
  // ===================================================================
  function updateScraperToggleUI(isEnabled) {
    if (scraperToggle) scraperToggle.checked = isEnabled;
    if (scraperStatusText) {
      scraperStatusText.textContent = isEnabled ? "ON" : "OFF";
      scraperStatusText.className = isEnabled ? "status-toggle-text active" : "status-toggle-text inactive";
    }
    if (btnScrapeActiveTab) {
      btnScrapeActiveTab.disabled = !isEnabled;
      if (!isEnabled) {
        btnScrapeActiveTab.innerHTML = `<span class="btn-icon">⏸️</span> SCRAPER PAUSED (OFF)`;
      } else {
        btnScrapeActiveTab.innerHTML = `<span class="btn-icon">📸</span> GRAB THIS LISTING & TAGS (1-CLICK)`;
      }
    }
  }

  if (scraperToggle) {
    scraperToggle.addEventListener("change", async (e) => {
      const isEnabled = e.target.checked;
      await chrome.storage.local.set({ scraperEnabled: isEnabled });
      updateScraperToggleUI(isEnabled);

      // Broadcast scraper toggle to all TeePublic tabs
      try {
        const tabs = await chrome.tabs.query({ url: "*://*.teepublic.com/*" });
        for (const t of tabs) {
          chrome.tabs.sendMessage(t.id, { action: "TOGGLE_SCRAPER", enabled: isEnabled }).catch(() => {});
        }
      } catch (_) {}
    });
  }

  // ===================================================================
  // 4. ACTIVE TAB DETECTION FOR SCRAPER
  // ===================================================================
  let currentActiveTabId = null;

  async function checkActiveTabForScraper() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        setTargetState(false, "No active tab detected");
        return;
      }

      currentActiveTabId = tab.id;
      const isTeePublic = tab.url.includes("teepublic.com");

      if (!isTeePublic) {
        setTargetState(false, "Not on TeePublic. Open a design tab.");
        return;
      }

      const storeData = await chrome.storage.local.get({ scrapedCompetitorDesigns: [] });
      const currentDesigns = storeData.scrapedCompetitorDesigns || [];

      // Check with content script on active tab
      chrome.tabs.sendMessage(tab.id, { action: "CHECK_PRODUCT_PAGE" }, (resp) => {
        if (!chrome.runtime.lastError && resp && resp.isProduct) {
          const preview = resp.preview || {};
          const storeName = (preview.store || "Independent Store").trim();
          const storeCount = currentDesigns.filter(x => (x.store || "Independent Store").trim().toLowerCase() === storeName.toLowerCase()).length;
          setTargetState(true, "🟢 TeePublic Design Page Detected", preview, storeCount);
        } else {
          // If not confirmed product page, check URL slug
          const urlLower = tab.url.toLowerCase();
          const looksLikeProduct = urlLower.includes("/t-shirt/") ||
                                   urlLower.includes("/hoodie/") ||
                                   urlLower.includes("/sticker/") ||
                                   urlLower.includes("/mug/") ||
                                   urlLower.includes("/designs/");
          if (looksLikeProduct) {
            setTargetState(true, "🟢 TeePublic Design Detected", {
              title: tab.title ? tab.title.split("|")[0].trim() : "TeePublic Listing",
              store: ""
            }, 0);
          } else {
            setTargetState(false, "Navigate to any TeePublic design/t-shirt page");
          }
        }
      });
    } catch (_) {
      setTargetState(false, "Open TeePublic design tab");
    }
  }

  function setTargetState(isTarget, statusMsg, preview = null, storeCount = 0) {
    if (targetStatusLabel) targetStatusLabel.textContent = statusMsg;
    if (targetDot) {
      targetDot.className = "target-dot " + (isTarget ? "connected" : "inactive");
    }

    if (preview && preview.title && isTarget) {
      if (targetPreviewBox) targetPreviewBox.style.display = "flex";
      if (targetPreviewTitle) targetPreviewTitle.textContent = preview.title;
      if (targetPreviewStore) targetPreviewStore.textContent = preview.store ? `Store: ${preview.store} (${storeCount} designs collected)` : "TeePublic Listing";
    } else {
      if (targetPreviewBox) targetPreviewBox.style.display = "none";
    }

    if (btnScrapeActiveTab) {
      btnScrapeActiveTab.disabled = false;
      btnScrapeActiveTab.classList.remove("limit-blocked");
      btnScrapeActiveTab.innerHTML = `<span class="btn-icon">📸</span> GRAB THIS LISTING & TAGS (1-CLICK)`;
    }
  }

  // 1-Click Grab Current Tab Button
  if (btnScrapeActiveTab) {
    btnScrapeActiveTab.addEventListener("click", async () => {
      const store = await chrome.storage.local.get({
        scraperEnabled: true,
        scrapedCompetitorDesigns: []
      });
      if (store.scraperEnabled === false) {
        alert("Tag Scraper is turned OFF. Turn the toggle ON first!");
        return;
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url.includes("teepublic.com")) {
        alert("Please open or switch to a TeePublic product page to grab tags!");
        return;
      }

      btnScrapeActiveTab.disabled = true;
      btnScrapeActiveTab.innerHTML = `<span class="btn-icon">⚡</span> Extracting Tags...`;

      try {
        chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_CURRENT_PAGE" }, async (resp) => {
          if (!chrome.runtime.lastError && resp && resp.success && resp.data) {
            const item = resp.data;
            const currentList = store.scrapedCompetitorDesigns || [];
            const storeName = (item.store || "Independent Store").trim();

            // Check if already captured in this batch (by URL or title)
            const existingIdx = currentList.findIndex(x =>
              (x.url && item.url && x.url === item.url) ||
              (x.title && item.title && x.title.toLowerCase() === item.title.toLowerCase())
            );

            let updatedList = [...currentList];
            if (existingIdx >= 0) {
              updatedList[existingIdx] = { ...updatedList[existingIdx], ...item };
            } else {
              updatedList.push(item);
            }

            await chrome.storage.local.set({ scrapedCompetitorDesigns: updatedList });

            const currentStoreCount = updatedList.filter(x =>
              (x.store || "Independent Store").trim().toLowerCase() === storeName.toLowerCase()
            ).length;

            // Visual feedback
            btnScrapeActiveTab.classList.add("grabbed-flash");
            btnScrapeActiveTab.innerHTML = `<span class="btn-icon">✓</span> Saved #${updatedList.length}! (${item.tags.length} artist tags)`;

            renderScrapedDesignsList(updatedList);

            setTimeout(() => {
              btnScrapeActiveTab.classList.remove("grabbed-flash");
              btnScrapeActiveTab.disabled = false;
              btnScrapeActiveTab.innerHTML = `<span class="btn-icon">📸</span> GRAB THIS LISTING & TAGS (1-CLICK)`;
            }, 1800);
          } else {
            // Fallback: retry
            btnScrapeActiveTab.innerHTML = `<span class="btn-icon">⚠️</span> Retrying scrape...`;
            setTimeout(() => {
              btnScrapeActiveTab.disabled = false;
              btnScrapeActiveTab.innerHTML = `<span class="btn-icon">📸</span> GRAB THIS LISTING & TAGS (1-CLICK)`;
            }, 1500);
          }
        });
      } catch (err) {
        console.warn("Scraper message error:", err);
        btnScrapeActiveTab.disabled = false;
        btnScrapeActiveTab.innerHTML = `<span class="btn-icon">📸</span> GRAB THIS LISTING & TAGS (1-CLICK)`;
      }
    });
  }

  // ===================================================================
  // 5. RENDER COLLECTED DESIGNS LIST & STATS
  // ===================================================================
  async function renderScrapedDesignsList(list) {
    const designs = Array.isArray(list) ? list : [];

    // Update badges & stats
    if (scraperBadge) scraperBadge.textContent = designs.length;
    if (scrapedListCountBadge) scrapedListCountBadge.textContent = `${designs.length} item${designs.length === 1 ? '' : 's'}`;
    if (statScrapedTotal) statScrapedTotal.textContent = designs.length;

    // Calculate unique tags and stores
    const allTags = new Set();
    const storeCountMap = {};
    designs.forEach(d => {
      if (Array.isArray(d.tags)) {
        d.tags.forEach(t => allTags.add(t.toLowerCase().trim()));
      }
      const s = (d.store || "Independent Store").trim();
      storeCountMap[s] = (storeCountMap[s] || 0) + 1;
    });

    if (statUniqueTagsTotal) statUniqueTagsTotal.textContent = allTags.size;
    if (statArtistStoresTotal) statArtistStoresTotal.textContent = Object.keys(storeCountMap).length;

    // Render Store Badge Counters in storeQuotasList (Unlimited batching)
    if (storeQuotasList) {
      const storeEntries = Object.entries(storeCountMap);
      if (storeEntries.length > 0) {
        storeQuotasList.style.display = "flex";
        storeQuotasList.innerHTML = storeEntries.map(([sName, count]) => {
          return `<span class="store-quota-chip" title="${escapeHtml(sName)}">🏪 ${escapeHtml(sName)}: ${count} design${count === 1 ? '' : 's'}</span>`;
        }).join("");
      } else {
        storeQuotasList.style.display = "none";
      }
    }

    // Toggle Empty State vs List
    if (designs.length === 0) {
      if (emptyScraperState) emptyScraperState.style.display = "flex";
      // Clear cards
      const cards = scrapedCardsScroll.querySelectorAll(".scraped-card");
      cards.forEach(c => c.remove());
      return;
    }

    if (emptyScraperState) emptyScraperState.style.display = "none";

    // Clear previous cards
    const existingCards = scrapedCardsScroll.querySelectorAll(".scraped-card");
    existingCards.forEach(c => c.remove());

    // Render numbered cards in order (#1, #2, #3...)
    designs.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "scraped-card";
      card.dataset.id = item.id || `item_${index}`;

      const title = item.title || "Untitled TeePublic Design";
      const store = item.store || "Independent Store";
      const storeCount = storeCountMap[store] || 1;
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const itemNum = index + 1;

      // Card Header
      const header = document.createElement("div");
      header.className = "scraped-card-header";

      const titleGroup = document.createElement("div");
      titleGroup.className = "scraped-card-title-group";
      titleGroup.innerHTML = `
        <span class="scraped-num-badge">#${itemNum}</span>
        <span class="scraped-card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
      `;

      const actionsGroup = document.createElement("div");
      actionsGroup.className = "scraped-card-actions";

      // Copy Title Button
      const btnCopyTitle = document.createElement("button");
      btnCopyTitle.className = "scraped-btn-icon";
      btnCopyTitle.title = "Copy Title";
      btnCopyTitle.innerHTML = "📋";
      btnCopyTitle.addEventListener("click", () => {
        copyTextToClipboard(title);
        btnCopyTitle.innerHTML = "✓";
        setTimeout(() => btnCopyTitle.innerHTML = "📋", 1200);
      });

      // Copy All Tags for this Design Button
      const btnCopyDesignTags = document.createElement("button");
      btnCopyDesignTags.className = "scraped-btn-icon";
      btnCopyDesignTags.title = "Copy All Artist Tags (Comma-separated)";
      btnCopyDesignTags.innerHTML = "🏷️";
      btnCopyDesignTags.addEventListener("click", () => {
        copyTextToClipboard(tags.join(", "));
        btnCopyDesignTags.innerHTML = "✓";
        setTimeout(() => btnCopyDesignTags.innerHTML = "🏷️", 1200);
      });

      // Delete Button
      const btnDelete = document.createElement("button");
      btnDelete.className = "scraped-btn-icon btn-delete";
      btnDelete.title = "Delete this design";
      btnDelete.innerHTML = "✕";
      btnDelete.addEventListener("click", async () => {
        const store = await chrome.storage.local.get({ scrapedCompetitorDesigns: [] });
        const cur = store.scrapedCompetitorDesigns || [];
        cur.splice(index, 1);
        await chrome.storage.local.set({ scrapedCompetitorDesigns: cur });
        renderScrapedDesignsList(cur);
      });

      actionsGroup.appendChild(btnCopyTitle);
      actionsGroup.appendChild(btnCopyDesignTags);
      actionsGroup.appendChild(btnDelete);

      header.appendChild(titleGroup);
      header.appendChild(actionsGroup);
      card.appendChild(header);

      // Card Meta Row with Store Designs Count
      const metaRow = document.createElement("div");
      metaRow.className = "scraped-card-meta";
      metaRow.innerHTML = `
        <span class="scraped-meta-store">🏪 <strong>${escapeHtml(store)}</strong> (${storeCount} design${storeCount === 1 ? '' : 's'})</span>
        <span class="scraped-meta-count">${tags.length} artist tags</span>
      `;
      card.appendChild(metaRow);

      // Tags Pills Container (Matching Image 2 style)
      if (tags.length > 0) {
        const tagsContainer = document.createElement("div");
        tagsContainer.className = "scraped-tags-list";

        tags.forEach(tag => {
          const pill = document.createElement("span");
          pill.className = "scraped-tag-pill";
          pill.textContent = tag;
          pill.title = `Click to copy "${tag}"`;
          pill.addEventListener("click", () => {
            copyTextToClipboard(tag);
            const orig = pill.textContent;
            pill.textContent = "✓ Copied!";
            setTimeout(() => pill.textContent = orig, 1000);
          });
          tagsContainer.appendChild(pill);
        });

        card.appendChild(tagsContainer);
      }

      scrapedCardsScroll.appendChild(card);
    });
  }

  // ===================================================================
  // 6. CSV GENERATION & EXPORT LOGIC
  // ===================================================================

  function escapeCsvCell(cell) {
    if (cell === null || cell === undefined) return '""';
    const str = String(cell);
    return `"${str.replace(/"/g, '""')}"`;
  }

  async function getStoredScrapedDesigns() {
    const store = await chrome.storage.local.get(["scrapedCompetitorDesigns", "scrapedListings"]);
    const arr1 = Array.isArray(store.scrapedCompetitorDesigns) ? store.scrapedCompetitorDesigns : [];
    const arr2 = Array.isArray(store.scrapedListings) ? store.scrapedListings : [];

    const combined = [];
    const seen = new Set();
    for (const item of [...arr1, ...arr2]) {
      if (!item) continue;
      if (!Array.isArray(item.tags) && Array.isArray(item.allTags)) {
        item.tags = item.allTags;
      }
      const key = (item.url || item.title || "").trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(item);
      } else if (!key) {
        combined.push(item);
      }
    }
    return combined;
  }

  // 1. Download Magic Listing Format CSV (matches magic_listings_export_YYYY-MM-DD.csv)
  btnDownloadMagicCsv.addEventListener("click", async () => {
    const designs = await getStoredScrapedDesigns();

    if (designs.length === 0) {
      alert("No designs collected yet! Open TeePublic competitor tabs and click 'Grab Listing' or press Alt+S.");
      return;
    }

    const headers = [
      "Design ID",
      "File Name",
      "Platform",
      "Title",
      "Tags / Keywords",
      "Description"
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

      const row = [
        escapeCsvCell(designId),
        escapeCsvCell(fileName),
        escapeCsvCell(platform),
        escapeCsvCell(title),
        escapeCsvCell(tagsStr),
        escapeCsvCell(description)
      ];
      lines.push(row.join(","));
    });

    const csvContent = lines.join("\r\n");
    const today = new Date().toISOString().split("T")[0];
    triggerFileDownload(csvContent, `magic_listings_export_${today}.csv`, btnDownloadMagicCsv);
  });

  // 2. Download 2-Row Format CSV (Exact format shown in user's Image 3: Row 1 = Title, Row 2 = Tags)
  btnDownloadTwoRowCsv.addEventListener("click", async () => {
    const designs = await getStoredScrapedDesigns();

    if (designs.length === 0) {
      alert("No designs collected yet! Open TeePublic competitor tabs and click 'Grab Listing' or press Alt+S.");
      return;
    }

    const lines = [];
    designs.forEach(item => {
      // Row 1: Title
      lines.push(escapeCsvCell(item.title || ""));
      // Row 2: Supporting tags (space-separated as shown in Image 3)
      const tags = Array.isArray(item.tags) ? item.tags : [];
      lines.push(escapeCsvCell(tags.join(" ")));
    });

    const csvContent = lines.join("\r\n");
    const today = new Date().toISOString().split("T")[0];
    triggerFileDownload(csvContent, `teepublic_competitor_tags_2row_${today}.csv`, btnDownloadTwoRowCsv);
  });

  function triggerFileDownload(content, filename, btnElement) {
    const bom = "\uFEFF";
    const fullContent = bom + content;
    let success = false;

    // Strategy 1: HTML5 <a> with Blob URL (Universal in Firefox, Tor, Chrome)
    try {
      const blob = new Blob([fullContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);

      // Dispatch click event (Firefox / Tor compatible)
      a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

      // Keep blob URL alive in memory for 30s so Firefox never cancels the download mid-save
      setTimeout(() => {
        try {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 30000);
      success = true;
    } catch (err1) {
      console.warn("Blob download error:", err1);
    }

    // Strategy 2: HTML5 <a> with Data URI fallback (if Blob is blocked by Tor)
    if (!success) {
      try {
        const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(fullContent);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = dataUri;
        a.download = filename;
        document.body.appendChild(a);
        a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        setTimeout(() => {
          try { if (a.parentNode) a.parentNode.removeChild(a); } catch (_) {}
        }, 5000);
        success = true;
      } catch (err2) {
        console.warn("Data URI download error:", err2);
      }
    }

    // Visual button feedback
    if (btnElement) {
      const orig = btnElement.innerHTML;
      btnElement.innerHTML = `<span>✓</span> Downloaded!`;
      setTimeout(() => {
        btnElement.innerHTML = orig;
      }, 2500);
    }

    return success;
  }

  // ===================================================================
  // 7. CLIPBOARD UTILITIES & BULK ACTIONS
  // ===================================================================

  btnCopyAllTags.addEventListener("click", async () => {
    const store = await chrome.storage.local.get({ scrapedCompetitorDesigns: [] });
    const designs = store.scrapedCompetitorDesigns || [];
    if (designs.length === 0) {
      alert("No designs collected yet!");
      return;
    }

    const allTags = [];
    designs.forEach(d => {
      if (Array.isArray(d.tags)) {
        d.tags.forEach(t => allTags.push(t.trim()));
      }
    });

    const text = allTags.join(", ");
    copyTextToClipboard(text);
    btnCopyAllTags.innerHTML = `<span>✓</span> Copied ${allTags.length} Tags!`;
    setTimeout(() => btnCopyAllTags.innerHTML = `<span>📋</span> Copy All Tags`, 1500);
  });

  btnCopyAllTitles.addEventListener("click", async () => {
    const store = await chrome.storage.local.get({ scrapedCompetitorDesigns: [] });
    const designs = store.scrapedCompetitorDesigns || [];
    if (designs.length === 0) {
      alert("No designs collected yet!");
      return;
    }

    const titles = designs.map(d => d.title || "").filter(Boolean);
    copyTextToClipboard(titles.join("\n"));
    btnCopyAllTitles.innerHTML = `<span>✓</span> Copied ${titles.length} Titles!`;
    setTimeout(() => btnCopyAllTitles.innerHTML = `<span>📝</span> Copy Titles`, 1500);
  });

  btnClearScrapedList.addEventListener("click", async () => {
    const designs = await getStoredScrapedDesigns();
    const count = designs.length;
    if (count === 0) return;

    if (confirm(`Are you sure you want to clear all ${count} collected competitor designs?`)) {
      await chrome.storage.local.set({ scrapedCompetitorDesigns: [], scrapedListings: [] });
      renderScrapedDesignsList([]);
    }
  });

  function copyTextToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // ===================================================================
  // 8. STORAGE SYNC & INITIALIZATION
  // ===================================================================

  // Load initial stored state
  const data = await chrome.storage.local.get({
    extensionEnabled: true,
    scraperEnabled: true,
    activePopupTab: "autopilot",
    activeDesignIndex: 0,
    prefColorMode: "dark",
    prefPrintLocation: "front",
    prefMature: "no",
    prefDefaultColor: "Black",
    cachedDesigns: [],
    scrapedCompetitorDesigns: []
  });

  updateAutopilotToggleUI(data.extensionEnabled);
  updateScraperToggleUI(data.scraperEnabled !== false);
  const initialScraped = await getStoredScrapedDesigns();
  renderScrapedDesignsList(initialScraped);

  prefColorMode.value = data.prefColorMode;
  prefPrintLocation.value = data.prefPrintLocation;
  prefMature.value = data.prefMature;
  prefDefaultColor.value = data.prefDefaultColor;

  updateQueueUI(data.cachedDesigns, data.activeDesignIndex);

  // Restore active tab
  if (data.activePopupTab === "scraper") {
    switchTab("scraper");
  } else {
    switchTab("autopilot");
  }

  // Live storage changes listener across tabs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.extensionEnabled !== undefined) {
        updateAutopilotToggleUI(Boolean(changes.extensionEnabled.newValue));
      }
      if (changes.scraperEnabled !== undefined) {
        updateScraperToggleUI(Boolean(changes.scraperEnabled.newValue));
      }
      if (changes.scrapedCompetitorDesigns !== undefined || changes.scrapedListings !== undefined) {
        getStoredScrapedDesigns().then(d => renderScrapedDesignsList(d));
      }
      if (changes.cachedDesigns !== undefined || changes.activeDesignIndex !== undefined) {
        chrome.storage.local.get(["cachedDesigns", "activeDesignIndex"], res => {
          updateQueueUI(res.cachedDesigns || [], res.activeDesignIndex || 0);
        });
      }
    }
  });

  // Check Local Studio Server
  await checkLocalServer();

  // Event Listeners for Autopilot
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

  // Autopilot Triggers
  btnFillDesign.addEventListener("click", async () => {
    await triggerAutopilot(true);
  });

  btnFillNext.addEventListener("click", async () => {
    await triggerAutopilot(true);
  });

  // Queue UI updater
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
