/**
 * TeePublic Bulk Uploader — Studio Edition (Frontend JS)
 * Reverse-Engineered Native TeePublic Upload Studio
 * Sections: Metadata, Apparel Table & Canvas, Swatch Palette Matrix, Configure Other Products
 */

const state = {
  designs: [],
  currentIndex: -1,
  activeView: 'listings', // 'listings' | 'designs'
  activeFilter: 'all',    // 'all' | 'matched' | 'missing'
  activeApparelId: 'T-Shirt', // 'T-Shirt' | 'Hoodie' | etc.
  summary: { total: 0, matched: 0, missing: 0 },
  isRunningAutomation: false
};

// 9 TeePublic Apparel Items (Screenshot 3)
const APPAREL_ITEMS = [
  { id: "T-Shirt", name: "T-Shirt", hasPrintRadios: true, defaultColor: "Black" },
  { id: "Hoodie", name: "Hoodie", defaultColor: "Black" },
  { id: "Tank", name: "Tank", defaultColor: "Black" },
  { id: "Crewneck", name: "Crewneck", defaultColor: "Black" },
  { id: "Long Sleeve T-Shirt", name: "Long Sleeve T-Shirt", defaultColor: "Black" },
  { id: "Baseball Tee", name: "Baseball Tee", defaultColor: "Black" },
  { id: "Kids", name: "Kids", defaultColor: "Black" },
  { id: "Kids Hoodie", name: "Kids Hoodie", defaultColor: "Black" },
  { id: "Kids Long Sleeve T-Shirt", name: "Kids Long Sleeve T-Shirt", defaultColor: "Black" }
];

// 14 TeePublic Other Products (Screenshot 4)
const OTHER_PRODUCTS = [
  { id: "Apparel", name: "Apparel", icon: "👕" },
  { id: "Socks", name: "Socks", icon: "🧦" },
  { id: "Bags", name: "Bags", icon: "🎒" },
  { id: "Shorts", name: "Shorts", icon: "🩳" },
  { id: "Hats", name: "Hats", icon: "🧢" },
  { id: "Stickers", name: "Stickers", icon: "🏷️" },
  { id: "Cases", name: "Cases", icon: "📱" },
  { id: "Mugs", name: "Mugs", icon: "☕" },
  { id: "Wall Art", name: "Wall Art", icon: "🖼️" },
  { id: "Pillows", name: "Pillows", icon: "🛋️" },
  { id: "Totes", name: "Totes", icon: "👜" },
  { id: "Tapestries", name: "Tapestries", icon: "🎨" },
  { id: "Pins", name: "Pins", icon: "📌" },
  { id: "Magnets", name: "Magnets", icon: "🧲" }
];

// Complete 42 TeePublic Apparel Colors List (Matches TeePublic uploader options from Black to Gold)
const APPAREL_COLORS = [
  "Black",
  "White",
  "Heather Grey",
  "Charcoal",
  "Dark Heather",
  "Asphalt",
  "Slate",
  "Silver",
  "Natural Heather",
  "Creme",
  "Tan",
  "Brown",
  "Navy",
  "Dark Navy",
  "Classic Blue",
  "Royal Blue",
  "Sky Blue",
  "Baby Blue",
  "Aqua",
  "Turquoise",
  "Forest Green",
  "Olive",
  "Army Green",
  "Kelly Green",
  "Lime",
  "Mint",
  "Red",
  "Cardinal",
  "Maroon",
  "Coral",
  "Light Pink",
  "Pink",
  "Magenta",
  "Mauve",
  "Lavender",
  "Purple",
  "Deep Purple",
  "Plum",
  "Lemon",
  "Yellow",
  "Gold",
  "Orange"
];

// 42 TeePublic Swatch Matrix Colors
const TEEPUBLIC_PALETTE = [
  { name: "White", hex: "#FFFFFF", isLight: true },
  { name: "Creme", hex: "#FEF3C7", isLight: true },
  { name: "Natural Heather", hex: "#E2E8F0", isLight: true },
  { name: "Lemon", hex: "#FEF08A", isLight: true },
  { name: "Yellow", hex: "#FACC15", isLight: true },
  { name: "Gold", hex: "#EAB308", isLight: true },
  { name: "Orange", hex: "#F97316", isLight: false },
  { name: "Coral", hex: "#FB7185", isLight: true },
  { name: "Light Pink", hex: "#FBCFE8", isLight: true },
  { name: "Pink", hex: "#F472B6", isLight: true },
  { name: "Mauve", hex: "#C084FC", isLight: true },
  { name: "Magenta", hex: "#D946EF", isLight: false },
  { name: "Red", hex: "#DC2626", isLight: false },
  { name: "Cardinal", hex: "#B91C1C", isLight: false },

  { name: "Maroon", hex: "#800020", isLight: false },
  { name: "Mint", hex: "#A7F3D0", isLight: true },
  { name: "Lime", hex: "#84CC16", isLight: true },
  { name: "Kelly Green", hex: "#16A34A", isLight: false },
  { name: "Army Green", hex: "#4D7C0F", isLight: false },
  { name: "Olive", hex: "#3F6212", isLight: false },
  { name: "Forest Green", hex: "#166534", isLight: false },
  { name: "Turquoise", hex: "#2DD4BF", isLight: true },
  { name: "Aqua", hex: "#06B6D4", isLight: true },
  { name: "Sky Blue", hex: "#38BDF8", isLight: true },
  { name: "Baby Blue", hex: "#BAE6FD", isLight: true },
  { name: "Royal Blue", hex: "#2563EB", isLight: false },
  { name: "Classic Blue", hex: "#1D4ED8", isLight: false },
  { name: "Navy", hex: "#1E293B", isLight: false },

  { name: "Dark Navy", hex: "#0F172A", isLight: false },
  { name: "Lavender", hex: "#DDD6FE", isLight: true },
  { name: "Purple", hex: "#9333EA", isLight: false },
  { name: "Deep Purple", hex: "#6B21A8", isLight: false },
  { name: "Plum", hex: "#581C87", isLight: false },
  { name: "Tan", hex: "#D6D3D1", isLight: true },
  { name: "Brown", hex: "#78350F", isLight: false },
  { name: "Silver", hex: "#CBD5E1", isLight: true },
  { name: "Heather Grey", hex: "#94A3B8", isLight: true },
  { name: "Slate", hex: "#64748B", isLight: false },
  { name: "Charcoal", hex: "#334155", isLight: false },
  { name: "Asphalt", hex: "#1E293B", isLight: false },
  { name: "Dark Heather", hex: "#1F2937", isLight: false },
  { name: "Black", hex: "#111111", isLight: false }
];

const COLOR_MAP = {};
TEEPUBLIC_PALETTE.forEach(c => COLOR_MAP[c.name] = c.hex);
// Aliases for compatibility
COLOR_MAP["Kelly"] = "#16A34A";
COLOR_MAP["Heather"] = "#94A3B8";
COLOR_MAP["Vintage Royal"] = "#2563EB";
COLOR_MAP["Mauvealous"] = "#F472B6";

let targetSingleUploadIndex = -1;
window.state = state;

document.addEventListener("DOMContentLoaded", () => {
  setupMagicFabricaTheme();
  setupSidebarNavRail();
  setupRefreshButton();
  setupPageRefreshButton();
  setupClipboardPaste();
  setupViewModeSwitcher();
  setupImportButtons();
  setupFileInputs();
  setupGlobalDragDrop();
  setupButtons();
  setupFilters();
  setupMetadataInputs();
  setupScaleSlider();
  setupColorPresetButtons();
  setupTerminalDrawer();
  setupCanvasArtworkUploader();
  preloadTShirtAssets();

  // Render static structures
  renderApparelTable();
  renderSwatchMatrix();
  renderOtherProductsGrid();

  // Connect live SSE logs
  connectSSE();

  // Fetch initial state
  fetchState();
});

// ===================================================================
// MAGIC FABRICA DESIGN SYSTEM: THEME, RAIL, & CLIPBOARD INTEGRATION
// ===================================================================

function setupMagicFabricaTheme() {
  const btnToggle = document.getElementById("btnThemeToggle");
  const darkIcon = document.querySelector(".theme-icon-dark");
  const lightIcon = document.querySelector(".theme-icon-light");

  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("mf_theme", theme); } catch (e) {}
    if (darkIcon && lightIcon) {
      if (theme === "light") {
        darkIcon.style.display = "none";
        lightIcon.style.display = "block";
      } else {
        darkIcon.style.display = "block";
        lightIcon.style.display = "none";
      }
    }
  };

  let savedTheme = "dark";
  try { savedTheme = localStorage.getItem("mf_theme") || "dark"; } catch (e) {}
  applyTheme(savedTheme);

  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }
}

function setupSidebarNavRail() {
  const railListings = document.getElementById("railNavListings");
  const railDesigns = document.getElementById("railNavDesigns");
  const railTerminal = document.getElementById("railNavTerminal");

  if (railListings) {
    railListings.addEventListener("click", () => {
      if (window.setView) window.setView("listings");
    });
  }

  if (railDesigns) {
    railDesigns.addEventListener("click", () => {
      if (window.setView) window.setView("designs");
    });
  }

  if (railTerminal) {
    railTerminal.addEventListener("click", () => {
      const drawer = document.getElementById("terminalDrawer");
      if (drawer) {
        drawer.classList.toggle("open");
        const chevron = document.getElementById("logChevron");
        if (chevron) chevron.textContent = drawer.classList.contains("open") ? "▼" : "▲";
      }
    });
  }
}

// Floating Toast Notification
function showToast({ title, message, type = "success", duration = 3200 }) {
  let container = document.getElementById("tpToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "tpToastContainer";
    container.className = "tp-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "tp-toast";
  const icon = type === "success" ? "✓" : (type === "error" ? "✕" : "ℹ");
  const iconBg = type === "success" ? "rgba(34, 197, 94, 0.2)" : (type === "error" ? "rgba(239, 68, 68, 0.2)" : "rgba(56, 189, 248, 0.2)");
  const iconColor = type === "success" ? "#22C55E" : (type === "error" ? "#EF4444" : "#38BDF8");

  toast.innerHTML = `
    <div class="tp-toast-icon" style="background: ${iconBg}; color: ${iconColor};">${icon}</div>
    <div style="display: flex; flex-direction: column; gap: 1px;">
      <span class="tp-toast-title">${title}</span>
      ${message ? `<span class="tp-toast-msg">${message}</span>` : ""}
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-hide");
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 250);
  }, duration);
}

function setupRefreshButton() {
  const btnRefresh = document.getElementById("btnRefreshState");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      // 1. Prevent concurrent clicks and trigger smooth spin animation
      btnRefresh.style.pointerEvents = "none";
      btnRefresh.classList.add("is-syncing");
      btnRefresh.classList.remove("is-synced");

      appendLog("INFO", "Synchronizing studio state with backend...");

      try {
        // 2. Call the dedicated full backend synchronization endpoint
        const res = await fetch("/api/sync", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          applyStateData(data);

          // 3. Visual success confirmation on the button
          btnRefresh.classList.remove("is-syncing");
          btnRefresh.classList.add("is-synced");
          const originalHtml = btnRefresh.innerHTML;
          btnRefresh.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Synced!
          `;

          const total = state.designs.length;
          const matched = state.summary.matched || 0;
          const missing = state.summary.missing || 0;

          // 4. Prominent floating Toast Notification
          showToast({
            title: "Studio Synchronized",
            message: total > 0
              ? `${matched} Confirmed · ${missing} Awaiting Image`
              : "Backend verified · Ready for import",
            type: "success"
          });

          // 5. Restore button state after 1.5s
          setTimeout(() => {
            btnRefresh.classList.remove("is-synced");
            btnRefresh.innerHTML = originalHtml;
            btnRefresh.style.pointerEvents = "auto";
          }, 1500);
        } else {
          throw new Error(`Server returned HTTP ${res.status}`);
        }
      } catch (err) {
        btnRefresh.classList.remove("is-syncing");
        btnRefresh.style.pointerEvents = "auto";
        appendLog("ERROR", `Sync failed: ${err.message}`);
        showToast({
          title: "Sync Error",
          message: err.message,
          type: "error"
        });
      }
    });
  }
}

function setupPageRefreshButton() {
  const btnPageRefresh = document.getElementById("btnPageRefresh");
  if (btnPageRefresh) {
    btnPageRefresh.addEventListener("click", () => {
      btnPageRefresh.classList.add("is-reloading");
      btnPageRefresh.style.pointerEvents = "none";
      appendLog("INFO", "Refreshing studio application and reloading page...");
      showToast({
        title: "Refreshing Studio",
        message: "Reloading application...",
        type: "info",
        duration: 1000
      });
      setTimeout(() => {
        window.location.reload();
      }, 350);
    });
  }
}

function setupClipboardPaste() {
  window.addEventListener("paste", async (e) => {
    const active = document.activeElement;
    const isTextInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");

    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    if (!items || items.length === 0) return;

    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.startsWith("image/")) {
        hasImage = true;
        const blob = items[i].getAsFile();
        if (blob) {
          e.preventDefault();
          triggerPasteGlow();
          appendLog("INFO", `Clipboard paste: Image (${blob.type}, ${(blob.size / 1024).toFixed(1)} KB)`);

          const formData = new FormData();
          const fileName = `clipboard_${Date.now()}.png`;
          const file = new File([blob], fileName, { type: blob.type || "image/png" });

          if (state.activeView === "designs" && state.currentIndex >= 0) {
            formData.append("index", state.currentIndex);
            formData.append("file", file);
            try {
              const res = await fetch("/api/upload-single-image", { method: "POST", body: formData });
              if (res.ok) {
                applyStateData(await res.json());
                appendLog("SUCCESS", `Attached pasted image to Design #${state.currentIndex + 1}!`);
              }
            } catch (err) {
              appendLog("ERROR", `Failed to attach pasted image: ${err.message}`);
            }
          } else {
            formData.append("files", file);
            formData.append("file", file);
            try {
              const res = await fetch("/api/upload-images", { method: "POST", body: formData });
              if (res.ok) {
                applyStateData(await res.json());
                appendLog("SUCCESS", `Imported pasted artwork image: ${fileName}`);
              }
            } catch (err) {
              appendLog("ERROR", `Failed to upload pasted image: ${err.message}`);
            }
          }
          break;
        }
      }
    }

    if (!hasImage && !isTextInput) {
      const text = clipboardData.getData("text");
      if (text && text.includes(",") && (text.toLowerCase().includes("title") || text.split("\n").length > 1)) {
        e.preventDefault();
        triggerPasteGlow();
        appendLog("INFO", "Clipboard paste: CSV listing text detected");
        const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
        const file = new File([blob], `clipboard_import_${Date.now()}.csv`, { type: "text/csv" });
        await uploadCsvFiles([file], true);
      }
    }
  });
}

function triggerPasteGlow() {
  const target = document.querySelector(".design-editor-card") || document.body;
  target.classList.add("paste-glow-active");
  setTimeout(() => {
    target.classList.remove("paste-glow-active");
  }, 900);
}

// ===================================================================
// SERVER COMMUNICATION & REST API
// ===================================================================

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return;
    const data = await res.json();
    applyStateData(data);
  } catch (err) {
    console.error("Failed to fetch state:", err);
  }
}

function applyStateData(data) {
  state.designs = data.designs || [];
  state.summary = data.summary || { total: state.designs.length, matched: 0, missing: 0 };
  state.isRunningAutomation = !!data.is_running_automation;

  updateStats();
  renderSidebarListings();
  renderListingsTable();
  renderSidebarDesigns();
  renderDotPagination();

  // Update CSV metadata labels
  const csvName = (data.summary && data.summary.csv_filename) || "No CSV loaded";
  const nameEl = document.getElementById("sidebarCsvName");
  const countEl = document.getElementById("sidebarCsvCount");
  if (nameEl) nameEl.textContent = csvName;
  if (countEl) countEl.textContent = `${state.designs.length} listings loaded`;

  if (state.designs.length > 0) {
    const targetIdx = state.currentIndex >= 0 && state.currentIndex < state.designs.length ? state.currentIndex : 0;
    selectDesign(targetIdx);
  } else {
    state.currentIndex = -1;
    clearEditor();
  }

  if (data.progress) {
    updateProgressBar(data.progress.current, data.progress.total);
  }

  updateRunButton();
}

function connectSSE() {
  const evtSource = new EventSource("/api/stream-logs");

  evtSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "log" && msg.data) {
        appendLog(msg.data.level, msg.data.message, msg.data.ts);
      } else if (msg.type === "progress" && msg.data) {
        updateProgressBar(msg.data.current, msg.data.total);
      }
    } catch (err) {
      console.error("SSE parse error:", err);
    }
  };
}

async function postJSON(url, payload = {}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error(`POST ${url} failed:`, err);
    return null;
  }
}

// ===================================================================
// DUAL VIEW MODE SWITCHER (Listings vs Designs)
// ===================================================================

function setupViewModeSwitcher() {
  const btnListings = document.getElementById("btnViewListings");
  const btnDesigns = document.getElementById("btnViewDesigns");
  const secListings = document.getElementById("viewSectionListings");
  const secDesigns = document.getElementById("viewSectionDesigns");
  const railListings = document.getElementById("railNavListings");
  const railDesigns = document.getElementById("railNavDesigns");

  const setView = (view) => {
    state.activeView = view;
    if (view === "listings") {
      if (btnListings) btnListings.classList.add("active");
      if (btnDesigns) btnDesigns.classList.remove("active");
      if (secListings) secListings.classList.add("active");
      if (secDesigns) secDesigns.classList.remove("active");
      if (railListings) railListings.classList.add("active");
      if (railDesigns) railDesigns.classList.remove("active");
    } else {
      if (btnListings) btnListings.classList.remove("active");
      if (btnDesigns) btnDesigns.classList.add("active");
      if (secListings) secListings.classList.remove("active");
      if (secDesigns) secDesigns.classList.add("active");
      if (railListings) railListings.classList.remove("active");
      if (railDesigns) railDesigns.classList.add("active");
      if (state.currentIndex >= 0) selectDesign(state.currentIndex);
    }
  };
  window.setView = setView;

  if (btnListings) btnListings.addEventListener("click", () => setView("listings"));
  if (btnDesigns) btnDesigns.addEventListener("click", () => setView("designs"));

  const btnGoToDesigns = document.getElementById("btnGoToDesigns");
  if (btnGoToDesigns) btnGoToDesigns.addEventListener("click", () => setView("designs"));

  const btnBackToListings = document.getElementById("btnBackToListings");
  if (btnBackToListings) btnBackToListings.addEventListener("click", () => setView("listings"));
}

// ===================================================================
// FILE ACCESS & IMPORT BUTTONS
// ===================================================================

let isAppendMode = true;

function setupImportButtons() {
  const btnCsv = document.getElementById("btnImportCSV");
  const csvInput = document.getElementById("csvFileInput");
  const btnImages = document.getElementById("btnImportFolder");
  const folderInput = document.getElementById("folderFileInput");

  if (btnCsv && csvInput) {
    btnCsv.addEventListener("click", () => {
      if (state.designs.length > 0) {
        const ok = confirm(`You currently have ${state.designs.length} listings loaded.\n\n• Click OK to APPEND new listings to your current batch.\n• Click Cancel to START FRESH (replace current batch).`);
        isAppendMode = ok;
      } else {
        isAppendMode = false;
      }
      csvInput.value = "";
      csvInput.click();
    });
  }

  if (btnImages && folderInput) {
    btnImages.addEventListener("click", () => {
      folderInput.value = "";
      folderInput.click();
    });
  }
}

function setupCanvasArtworkUploader() {
  const boundary = document.getElementById("artworkBoundary");
  const placeholder = document.getElementById("garmentPlaceholder");
  const artImg = document.getElementById("garmentArtworkImg");

  if (placeholder) {
    placeholder.addEventListener("click", () => {
      if (state.currentIndex >= 0 && state.currentIndex < state.designs.length) {
        triggerSingleUpload(state.currentIndex);
      } else {
        document.getElementById("btnImportFolder")?.click();
      }
    });
  }

  if (artImg) {
    artImg.title = "Click to replace artwork for this design";
    artImg.style.cursor = "pointer";
    artImg.addEventListener("click", () => {
      if (state.currentIndex >= 0 && state.currentIndex < state.designs.length) {
        triggerSingleUpload(state.currentIndex);
      }
    });
  }

  // Drag and Drop directly onto the T-Shirt print boundary
  if (boundary) {
    boundary.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      boundary.classList.add("drag-over");
    });

    boundary.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      boundary.classList.remove("drag-over");
    });

    boundary.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      boundary.classList.remove("drag-over");

      const files = Array.from(e.dataTransfer?.files || []);
      const imageFiles = files.filter(f => f.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|svg)$/i.test(f.name));
      if (imageFiles.length === 0) return;

      const targetIdx = state.currentIndex >= 0 ? state.currentIndex : 0;
      if (targetIdx >= 0 && targetIdx < state.designs.length) {
        const file = imageFiles[0];
        appendLog("INFO", `Attaching dropped artwork (${file.name}) to Design #${targetIdx + 1}...`);
        const formData = new FormData();
        formData.append("index", targetIdx);
        formData.append("file", file);

        try {
          const res = await fetch("/api/upload-single-image", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json();
            state.currentIndex = targetIdx;
            applyStateData(data);
            selectDesign(targetIdx);
            appendLog("SUCCESS", `Attached artwork image (${file.name}) to Design #${targetIdx + 1} - Confirmed ✓!`);
          } else {
            appendLog("ERROR", `Failed to attach dropped image: ${res.statusText}`);
          }
        } catch (err) {
          appendLog("ERROR", `Upload error: ${err.message}`);
        }
      }
    });
  }
}


function triggerSingleUpload(index) {
  targetSingleUploadIndex = index;
  const singleInput = document.getElementById("singleImageInput");
  if (singleInput) {
    singleInput.value = "";
    singleInput.click();
  }
}

async function uploadCsvFiles(files, append = isAppendMode) {
  if (!files || files.length === 0) return;
  const actionName = append ? "Appending" : "Loading fresh batch of";
  appendLog("INFO", `${actionName} ${files.length} CSV listing file(s)...`);
  const formData = new FormData();
  files.forEach(f => {
    formData.append("files", f);
    formData.append("file", f);
  });
  formData.append("append", append ? "true" : "false");

  try {
    const res = await fetch(`/api/upload-csv?append=${append ? 'true' : 'false'}`, { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      applyStateData(data);
      if (append) {
        appendLog("SUCCESS", `Appended CSV listings! Total listings: ${state.designs.length}`);
      } else {
        appendLog("SUCCESS", `Fresh batch loaded with ${state.designs.length} listing(s). All awaiting images.`);
      }
    } else {
      appendLog("ERROR", `Failed to upload CSV: ${res.statusText}`);
    }
  } catch (err) {
    appendLog("ERROR", `CSV upload error: ${err.message}`);
  }
}

async function uploadImageFiles(files) {
  if (!files || files.length === 0) return;
  appendLog("INFO", `Uploading ${files.length} artwork images from your files...`);
  const formData = new FormData();
  files.forEach(f => {
    formData.append("files", f);
    formData.append("file", f);
  });

  try {
    const res = await fetch("/api/upload-images", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      applyStateData(data);
      appendLog("SUCCESS", `Imported ${files.length} artwork images and updated matches!`);
    } else {
      appendLog("ERROR", `Failed to upload images: ${res.statusText}`);
    }
  } catch (err) {
    appendLog("ERROR", `Image upload error: ${err.message}`);
  }
}

async function processMixedFiles(files) {
  if (!files || files.length === 0) return;

  const csvFiles = [];
  const imageFiles = [];

  const imageRegex = /\.(png|jpe?g|webp|bmp|svg|gif|tiff?|jfif)$/i;

  files.forEach(f => {
    const name = f.name.toLowerCase();
    if (name.endsWith(".csv")) {
      csvFiles.push(f);
    } else if (imageRegex.test(name)) {
      imageFiles.push(f);
    }
  });

  if (csvFiles.length > 0) {
    await uploadCsvFiles(csvFiles);
  }

  if (imageFiles.length > 0) {
    await uploadImageFiles(imageFiles);
  }

  if (csvFiles.length === 0 && imageFiles.length === 0) {
    appendLog("WARNING", "No supported CSV or image files detected in selection.");
  }
}

function setupFileInputs() {
  const csvInput = document.getElementById("csvFileInput");
  const folderInput = document.getElementById("folderFileInput");
  const singleInput = document.getElementById("singleImageInput");

  // CSV Selected via browser
  if (csvInput) {
    csvInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) await uploadCsvFiles(files, isAppendMode);
      csvInput.value = "";
      isAppendMode = true;
    });
  }

  // Multiple Artwork Images Selected via browser (Import Images)
  if (folderInput) {
    folderInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) await uploadImageFiles(files);
      folderInput.value = "";
    });
  }

  // Single or Multi-Image Upload via Design Card/Row
  if (singleInput) {
    singleInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const targetIdx = targetSingleUploadIndex;
      if (files.length === 1 && targetIdx >= 0) {
        const file = files[0];
        appendLog("INFO", `Attaching artwork image (${file.name}) to Design #${targetIdx + 1}...`);
        const formData = new FormData();
        formData.append("index", targetIdx);
        formData.append("file", file);

        try {
          const res = await fetch("/api/upload-single-image", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json();
            state.currentIndex = targetIdx;
            applyStateData(data);
            selectDesign(targetIdx);
            appendLog("SUCCESS", `Attached artwork image to Design #${targetIdx + 1} - Confirmed ✓!`);
          } else {
            appendLog("ERROR", `Failed to attach image: ${res.statusText}`);
          }
        } catch (err) {
          appendLog("ERROR", `Upload error: ${err.message}`);
        }
      } else if (files.length > 1 && targetIdx >= 0) {
        // Multi-file upload starting from targetIdx
        appendLog("INFO", `Attaching ${files.length} artwork images starting at Design #${targetIdx + 1}...`);
        const formData = new FormData();
        formData.append("index", targetIdx);
        files.forEach(f => formData.append("files", f));

        try {
          const res = await fetch("/api/upload-single-image", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json();
            state.currentIndex = targetIdx;
            applyStateData(data);
            selectDesign(targetIdx);
            appendLog("SUCCESS", `Attached ${files.length} artwork images starting at Design #${targetIdx + 1} - Confirmed ✓!`);
          } else {
            appendLog("ERROR", `Failed to attach images: ${res.statusText}`);
          }
        } catch (err) {
          appendLog("ERROR", `Upload error: ${err.message}`);
        }
      } else {
        await uploadImageFiles(files);
      }
      singleInput.value = "";
    });
  }
}

// ===================================================================
// GLOBAL DRAG & DROP ANYWHERE ON WINDOW
// ===================================================================

function setupGlobalDragDrop() {
  const overlay = document.getElementById("globalDropOverlay");
  let dragCounter = 0;

  // Prevent browser default file open behavior
  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
    document.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  window.addEventListener("dragenter", (e) => {
    dragCounter++;
    if (overlay) overlay.classList.add("active");
  });

  window.addEventListener("dragleave", (e) => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (overlay) overlay.classList.remove("active");
    }
  });

  window.addEventListener("drop", async (e) => {
    dragCounter = 0;
    if (overlay) overlay.classList.remove("active");

    const dt = e.dataTransfer;
    if (!dt) return;

    appendLog("INFO", "Scanning dropped items from File Explorer...");
    const extractedFiles = await extractFilesFromDataTransfer(dt);
    if (extractedFiles.length > 0) {
      appendLog("INFO", `Received ${extractedFiles.length} dropped file(s). Processing...`);
      await processMixedFiles(extractedFiles);
    }
  });
}

async function extractFilesFromDataTransfer(dataTransfer) {
  const files = [];
  const items = dataTransfer.items;

  if (items && items.length > 0 && items[0].webkitGetAsEntry) {
    const queue = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) queue.push(entry);
    }

    while (queue.length > 0) {
      const entry = queue.shift();
      if (entry.isFile) {
        const file = await new Promise((resolve) => entry.file(resolve, () => resolve(null)));
        if (file) files.push(file);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await new Promise((resolve) => {
          reader.readEntries((results) => resolve(results || []), () => resolve([]));
        });
        for (const child of entries) {
          queue.push(child);
        }
      }
    }
  } else if (dataTransfer.files) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      files.push(dataTransfer.files[i]);
    }
  }

  return files;
}

// ===================================================================
// BUTTONS & ACTIONS
// ===================================================================

function setupButtons() {
  // Delete All Button
  document.getElementById("btnDeleteAll").addEventListener("click", async () => {
    if (state.designs.length === 0) {
      appendLog("INFO", "Workspace is already empty.");
      return;
    }
    if (confirm("Are you sure you want to delete all listings and designs? This will completely reset the workspace, clearing all loaded listings, cached CSVs, and uploaded artwork for a fresh start.")) {
      appendLog("WARNING", "Clearing all listings, designs, and artwork cache...");
      const res = await postJSON("/api/delete-all");
      if (res) applyStateData(res);
    }
  });

  // Navigation Pager (Prev / Next)
  document.getElementById("btnPrevDesign").addEventListener("click", () => {
    if (state.designs.length === 0) return;
    const prev = (state.currentIndex - 1 + state.designs.length) % state.designs.length;
    selectDesign(prev);
  });

  document.getElementById("btnNextDesign").addEventListener("click", () => {
    if (state.designs.length === 0) return;
    const next = (state.currentIndex + 1) % state.designs.length;
    selectDesign(next);
  });

  // Copy Settings to All Designs
  const btnCopy = document.getElementById("btnCopySettingsAll");
  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      if (state.currentIndex < 0 || state.designs.length === 0) {
        showToast({
          title: "Copy Settings",
          message: "No designs loaded in studio",
          type: "info"
        });
        return;
      }

      if (state.designs.length === 1) {
        showToast({
          title: "Copy Settings",
          message: "Only 1 design in batch. Import more designs to replicate settings.",
          type: "info"
        });
        return;
      }

      const curIdx = state.currentIndex;
      const cur = state.designs[curIdx];

      btnCopy.style.pointerEvents = "none";
      const originalHtml = btnCopy.innerHTML;
      btnCopy.innerHTML = `⏳ Copying...`;

      appendLog("INFO", `Replicating colors & product settings from Design #${curIdx + 1} to all...`);
      const res = await postJSON("/api/copy-settings-all", { index: curIdx });
      if (res && res.success) {
        state.designs.forEach((d, idx) => {
          if (idx !== curIdx) {
            d.color_preference = cur.color_preference;
            d.product_colors = Object.assign({}, cur.product_colors);
            d.product_toggles = Object.assign({}, cur.product_toggles);
            d.apparel_settings = JSON.parse(JSON.stringify(cur.apparel_settings || {}));
            d.available_colors = Array.from(cur.available_colors || []);
            d.print_placement = cur.print_placement;
            d.scale = cur.scale;
            d.mature_content = cur.mature_content;
            d.default_color = cur.default_color || cur.apparel_settings?.["T-Shirt"]?.defaultColor || "Black";
            d.album = cur.album;
          }
        });

        btnCopy.classList.add("btn-copy-success");
        btnCopy.innerHTML = `✓ Copied to All (${state.designs.length})!`;

        showToast({
          title: "Settings Replicated to All",
          message: `Applied colors, products & placement from #${String(curIdx + 1).padStart(2, "0")} to all ${state.designs.length} designs.`,
          type: "success"
        });

        appendLog("SUCCESS", `Replicated all settings across ${state.designs.length} designs!`);

        setTimeout(() => {
          btnCopy.classList.remove("btn-copy-success");
          btnCopy.innerHTML = originalHtml;
          btnCopy.style.pointerEvents = "auto";
        }, 1800);
      } else {
        btnCopy.innerHTML = originalHtml;
        btnCopy.style.pointerEvents = "auto";
        showToast({
          title: "Copy Error",
          message: "Failed to replicate settings to backend",
          type: "error"
        });
      }
    });
  }

  // Launch Autopilot Button — Unified with Extension Architecture
  const btnRun = document.getElementById("btnRunAutomation");
  btnRun.addEventListener("click", async () => {
    // 1. Sync current listing settings to backend state
    try {
      await saveCurrentListingState();
    } catch (_) {}

    appendLog("SUCCESS", "Queue synchronized! Opening TeePublic Bulk Uploader for 1-Click Autopilot...");
    window.open("https://www.teepublic.com/designs/bulk_uploader", "_blank");
    showToast("🚀 TeePublic tab opened! Use 'START AUTOPILOT' in the Extension or press Alt+F.", "success");
  });
}

function updateRunButton() {
  const btn = document.getElementById("btnRunAutomation");
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> LAUNCH AUTOPILOT`;
  btn.style.backgroundColor = "var(--accent)";
}

async function deleteDesignItem(idx, e) {
  if (e) e.stopPropagation();
  appendLog("INFO", `Deleting listing #${idx + 1}...`);
  const res = await postJSON("/api/delete-design", { index: idx });
  if (res) applyStateData(res);
}

// ===================================================================
// SECTION 1: LISTINGS VIEW (Sidebar + Table)
// ===================================================================

function updateStats() {
  document.getElementById("statTotal").textContent = state.summary.total || state.designs.length;
  document.getElementById("statMatched").textContent = state.summary.matched || 0;
  document.getElementById("statMissing").textContent = state.summary.missing || 0;
}

function updateProgressBar(current, total) {
  const statusEl = document.getElementById("progressStatusText");
  const valEl = document.getElementById("progressValText");
  const fillEl = document.getElementById("progressBarFill");

  if (total <= 0) {
    statusEl.textContent = "0 / 0 designs configured";
    valEl.textContent = "0%";
    fillEl.style.width = "0%";
    return;
  }

  const pct = Math.min(100, Math.round((current / total) * 100));
  statusEl.textContent = `${current} / ${total} designs configured`;
  valEl.textContent = `${pct}%`;
  fillEl.style.width = `${pct}%`;
}

function renderSidebarListings() {
  const container = document.getElementById("listingsSidebarList");
  container.innerHTML = "";

  const filtered = filterDesigns(state.designs);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <div class="empty-text">No listings match filter</div>
        <div class="empty-hint">Try selecting 'All' above</div>
      </div>
    `;
    return;
  }

  filtered.forEach((design) => {
    const isSelected = design.index === state.currentIndex + 1;
    const card = document.createElement("div");
    card.className = `queue-card ${isSelected ? "selected" : ""}`;
    card.dataset.index = design.index - 1;

    const isApproved = design.is_matched && design.has_thumbnail;
    const thumbHtml = isApproved
      ? `<img src="/api/thumbnail/${design.index - 1}?t=${Date.now()}" alt="thumb" onerror="this.onerror=null; this.parentElement.innerHTML='🎨';">`
      : `📄`;

    const statusBadge = isApproved
      ? `<span class="card-status-badge confirmed">✓ APPROVED</span>
         <button class="btn-card-upload-art" title="Replace image for this listing">🔄 Replace</button>`
      : `<span class="card-status-badge awaiting">AWAITING ART</span>
         <button class="btn-card-upload-art" title="Upload image for this listing">➕ Upload</button>`;

    card.innerHTML = `
      <span class="card-tracker-tag">${design.tracker_id || `#${design.index}`}</span>
      <div class="card-thumb-box">${thumbHtml}</div>
      <div class="card-info">
        <span class="card-filename" title="${escapeHtml(design.file_name)}">${escapeHtml(design.file_name)}</span>
        <span class="card-title" title="${escapeHtml(design.title)}">${escapeHtml(design.title || "Untitled")}</span>
        ${statusBadge}
      </div>
      <button class="btn-delete-card" title="Delete listing">✕</button>
    `;

    card.addEventListener("click", () => selectDesign(design.index - 1));

    const uploadBtn = card.querySelector(".btn-card-upload-art");
    if (uploadBtn) {
      uploadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerSingleUpload(design.index - 1);
      });
    }

    card.querySelector(".btn-delete-card").addEventListener("click", (e) => deleteDesignItem(design.index - 1, e));

    container.appendChild(card);
  });
}

function renderListingsTable() {
  const tbody = document.getElementById("listingsTableBody");
  const emptyNotice = document.getElementById("tableEmptyNotice");
  tbody.innerHTML = "";

  if (state.designs.length === 0) {
    emptyNotice.style.display = "flex";
    return;
  }

  emptyNotice.style.display = "none";

  state.designs.forEach((design, i) => {
    const tr = document.createElement("tr");

    const isApproved = design.is_matched && design.has_thumbnail;
    const statusHtml = isApproved
      ? `<span class="card-status-badge confirmed">✓ APPROVED</span><span style="font-size:10px; color:var(--color-ready); display:block; margin-top:2px; font-weight:600;">● Art Ready</span>`
      : `<span class="card-status-badge awaiting">AWAITING ART</span><span style="font-size:10px; color:var(--color-caution); display:block; margin-top:2px;">○ Missing Image</span>`;

    const thumbPreview = isApproved
      ? `<img src="/api/thumbnail/${i}?t=${Date.now()}" style="width:28px; height:28px; object-fit:contain; border-radius:4px; background:rgba(255,255,255,0.06); border:1px solid var(--color-panel-border); flex-shrink:0;" alt="thumbnail" />`
      : `<div style="width:28px; height:28px; border-radius:4px; background:rgba(255,255,255,0.03); border:1px dashed var(--color-ink-20); display:flex; align-items:center; justify-content:center; color:var(--color-ink-60); font-size:12px; flex-shrink:0;">🖼</div>`;

    const artBtnLabel = isApproved ? "🔄 Replace" : "➕ Art";
    const artBtnTitle = isApproved ? "Replace artwork image for this listing" : "Attach artwork image to this listing";

    tr.innerHTML = `
      <td><span class="card-tracker-tag">${design.tracker_id || `#${i+1}`}</span></td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${thumbPreview}
          <span style="font-family: var(--font-mono); font-weight: 600;">${escapeHtml(design.file_name)}</span>
        </div>
      </td>
      <td><strong>${escapeHtml(design.title || "-")}</strong></td>
      <td><span style="color: var(--color-ion);">${escapeHtml(design.main_tag || "-")}</span></td>
      <td><span style="color: var(--color-ink-60);">${escapeHtml(design.supporting_tags || "-")}</span></td>
      <td>${statusHtml}</td>
      <td style="text-align: center; white-space: nowrap;">
        <button class="btn btn-sm btn-secondary btn-table-art" title="${artBtnTitle}">${artBtnLabel}</button>
        <button class="btn btn-sm btn-secondary btn-table-open" title="Open in Design Editor">🎨</button>
        <button class="btn btn-sm btn-danger-outline btn-table-del" title="Delete listing">✕</button>
      </td>
    `;

    tr.querySelector(".btn-table-art").addEventListener("click", (e) => {
      e.stopPropagation();
      triggerSingleUpload(i);
    });

    tr.querySelector(".btn-table-open").addEventListener("click", () => {
      selectDesign(i);
      document.getElementById("btnViewDesigns").click();
    });

    tr.querySelector(".btn-table-del").addEventListener("click", (e) => deleteDesignItem(i, e));

    tbody.appendChild(tr);
  });
}

// ===================================================================
// SECTION 2: DESIGNS & MOCKUP VIEW
// ===================================================================

function renderSidebarDesigns() {
  const container = document.getElementById("designsSidebarList");
  container.innerHTML = "";

  const filtered = filterDesigns(state.designs);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎨</div>
        <div class="empty-text">No designs loaded</div>
        <div class="empty-hint">Import listings and upload artwork images</div>
      </div>
    `;
    return;
  }

  filtered.forEach((design) => {
    const isSelected = design.index === state.currentIndex + 1;
    const card = document.createElement("div");
    card.className = `queue-card ${isSelected ? "selected" : ""}`;
    card.dataset.index = design.index - 1;

    const isApproved = design.is_matched && design.has_thumbnail;
    const thumbHtml = isApproved
      ? `<img src="/api/thumbnail/${design.index - 1}?t=${Date.now()}" alt="thumb" onerror="this.onerror=null; this.parentElement.innerHTML='🎨';">`
      : `🎨`;

    const statusBadge = isApproved
      ? `<span class="card-status-badge confirmed">✓ APPROVED</span>
         <button class="btn-card-upload-art" title="Replace image for this design">🔄 Replace</button>`
      : `<span class="card-status-badge awaiting">AWAITING IMAGE</span>
         <button class="btn-card-upload-art" title="Upload image for this design">➕ Upload</button>`;

    card.innerHTML = `
      <span class="card-tracker-tag">${design.tracker_id || `#${design.index}`}</span>
      <div class="card-thumb-box">${thumbHtml}</div>
      <div class="card-info">
        <span class="card-filename" title="${escapeHtml(design.file_name)}">${escapeHtml(design.file_name)}</span>
        <span class="card-title" title="${escapeHtml(design.title)}">${escapeHtml(design.title || "Untitled")}</span>
        ${statusBadge}
      </div>
      <button class="btn-delete-card" title="Delete design">✕</button>
    `;

    card.addEventListener("click", () => selectDesign(design.index - 1));

    const uploadBtn = card.querySelector(".btn-card-upload-art");
    if (uploadBtn) {
      uploadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerSingleUpload(design.index - 1);
      });
    }

    card.querySelector(".btn-delete-card").addEventListener("click", (e) => deleteDesignItem(design.index - 1, e));

    container.appendChild(card);
  });
}

function renderDotPagination() {
  const container = document.getElementById("dotPagination");
  container.innerHTML = "";
  const total = Math.min(state.designs.length, 12);
  for (let i = 0; i < total; i++) {
    const dot = document.createElement("div");
    dot.className = `page-dot ${i === state.currentIndex ? "active" : ""}`;
    dot.title = `Go to Design #${i + 1}`;
    dot.addEventListener("click", () => selectDesign(i));
    container.appendChild(dot);
  }
}

function selectDesign(idx) {
  if (idx < 0 || idx >= state.designs.length) return;
  state.currentIndex = idx;
  const design = state.designs[idx];

  // Highlight selected cards in sidebars
  document.querySelectorAll(".queue-card").forEach((c) => {
    if (parseInt(c.dataset.index, 10) === idx) {
      c.classList.add("selected");
      c.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else {
      c.classList.remove("selected");
    }
  });

  // Highlight active dot
  document.querySelectorAll(".page-dot").forEach((dot, dIdx) => {
    dot.classList.toggle("active", dIdx === idx);
  });

  // Update Header Badges
  document.getElementById("headerTrackerId").textContent = design.tracker_id || `#${String(idx + 1).padStart(2, "0")}`;
  document.getElementById("headerDesignCounter").textContent = `Design ${idx + 1} of ${state.designs.length}`;

  const statusBadge = document.getElementById("headerStatusBadge");
  const isApproved = design.is_matched && design.has_thumbnail;
  if (isApproved) {
    statusBadge.className = "status-pill stat-matched";
    statusBadge.textContent = "✓ APPROVED";
  } else {
    statusBadge.className = "status-pill stat-missing";
    statusBadge.textContent = "AWAITING IMAGE";
  }

  // Update Artwork Graphic
  const img = document.getElementById("garmentArtworkImg");
  const placeholder = document.getElementById("garmentPlaceholder");

  if (design.has_thumbnail) {
    img.style.display = "block";
    img.src = `/api/thumbnail/${idx}?t=${Date.now()}`;
    placeholder.style.display = "none";
  } else {
    img.style.display = "none";
    placeholder.style.display = "flex";
  }

  // Update Scale
  const currentScale = design.scale || 100;
  const slider = document.getElementById("inputScaleSlider");
  const label = document.getElementById("scaleValLabel");
  const boundary = document.getElementById("artworkBoundary");
  if (slider) slider.value = currentScale;
  if (label) label.textContent = `${currentScale}.0%`;
  if (boundary) boundary.style.transform = `scale(${currentScale / 100})`;

  // Fill Section A: Metadata inputs
  document.getElementById("inputTitle").value = design.title || "";
  document.getElementById("inputMainTag").value = design.main_tag || "";
  document.getElementById("inputSupportingTags").value = design.supporting_tags || "";
  document.getElementById("inputDescription").value = design.description || "";

  // Mature Content Radio
  const isMature = design.mature_content === "yes" || design.mature_content === true;
  document.getElementById("radioMatureYes").checked = isMature;
  document.getElementById("radioMatureNo").checked = !isMature;

  // Initialize apparel_settings if missing
  if (!design.apparel_settings) {
    design.apparel_settings = {};
    APPAREL_ITEMS.forEach(item => {
      design.apparel_settings[item.id] = {
        enabled: true,
        defaultColor: item.defaultColor
      };
    });
  }

  // Sync Apparel Table Rows UI
  updateApparelTableRows();

  // Sync Silhouette and Canvas Color with active apparel item
  syncActiveApparelPreview();

  // Sync Swatch Matrix (Active checkmarks)
  syncSwatchMatrixUI();

  // Sync Configure Other Products Grid
  syncOtherProductsUI();
}

function clearEditor() {
  document.getElementById("headerTrackerId").textContent = "#00";
  document.getElementById("headerDesignCounter").textContent = "Design 0 of 0";
  document.getElementById("headerStatusBadge").className = "status-pill status-pill-neutral";
  document.getElementById("headerStatusBadge").textContent = "STANDBY";

  document.getElementById("garmentArtworkImg").style.display = "none";
  document.getElementById("garmentPlaceholder").style.display = "flex";

  setGarmentColor("#111111");

  document.getElementById("inputTitle").value = "";
  document.getElementById("inputMainTag").value = "";
  document.getElementById("inputSupportingTags").value = "";
  document.getElementById("inputDescription").value = "";
  document.getElementById("radioMatureNo").checked = true;
}

// ===================================================================
// SECTION A: METADATA & TAGS SETUP
// ===================================================================

function setupMetadataInputs() {
  const fields = [
    { id: "inputTitle", key: "title" },
    { id: "inputMainTag", key: "main_tag" },
    { id: "inputSupportingTags", key: "supporting_tags" },
    { id: "inputDescription", key: "description" }
  ];

  fields.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const sync = () => {
      if (state.currentIndex < 0 || state.currentIndex >= state.designs.length) return;
      const val = el.value;
      state.designs[state.currentIndex][key] = val;

      if (key === "title") {
        renderSidebarListings();
        renderListingsTable();
        renderSidebarDesigns();
      }

      postJSON("/api/update-design-field", {
        index: state.currentIndex,
        field: key,
        value: val
      });
    };
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
  });

  // Mature Content Radios
  document.querySelectorAll('input[name="matureContent"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (state.currentIndex < 0 || state.currentIndex >= state.designs.length) return;
      const val = e.target.value;
      state.designs[state.currentIndex].mature_content = val;
      postJSON("/api/update-design-field", {
        index: state.currentIndex,
        field: "mature_content",
        value: val
      });
    });
  });
}

// ===================================================================
// SECTION B: APPAREL TABLE & SCALE SLIDER (Screenshot 3)
// ===================================================================

function setupScaleSlider() {
  const slider = document.getElementById("inputScaleSlider");
  const label = document.getElementById("scaleValLabel");
  const boundary = document.getElementById("artworkBoundary");

  if (!slider) return;

  slider.addEventListener("input", () => {
    const val = slider.value;
    label.textContent = `${val}.0%`;
    boundary.style.transform = `scale(${val / 100})`;

    if (state.currentIndex >= 0 && state.currentIndex < state.designs.length) {
      state.designs[state.currentIndex].scale = parseInt(val, 10);
      postJSON("/api/update-design-field", {
        index: state.currentIndex,
        field: "scale",
        value: parseInt(val, 10)
      });
    }
  });
}

function renderApparelTable() {
  const tbody = document.getElementById("apparelTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  APPAREL_ITEMS.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = `tp-apparel-row ${item.id === state.activeApparelId ? "active" : ""}`;
    tr.dataset.itemId = item.id;

    // Item Column
    let itemHtml = `<div class="tp-item-title-box"><span class="tp-item-title">${item.name}</span>`;
    if (item.hasPrintRadios) {
      itemHtml += `
        <div class="tp-nested-print-radios" onclick="event.stopPropagation()">
          <label class="tp-nested-radio">
            <input type="radio" name="printPlacement" value="front" checked />
            <span>Print on Front</span>
          </label>
          <label class="tp-nested-radio">
            <input type="radio" name="printPlacement" value="back" />
            <span>Print on Back</span>
          </label>
          <label class="tp-nested-radio">
            <input type="radio" name="printPlacement" value="both" />
            <span>Print on Front &amp; Back</span>
          </label>
        </div>
      `;
    }
    itemHtml += `</div>`;

    // Enable Column
    const enableHtml = `
      <div style="text-align: center;" onclick="event.stopPropagation()">
        <input type="checkbox" id="chkApparel_${sanitizeId(item.id)}" checked style="accent-color: #3B82F6; width: 16px; height: 16px; cursor: pointer;" />
      </div>
    `;

    // Default Color Select Dropdown
    const colorSelectHtml = `
      <div onclick="event.stopPropagation()">
        <select class="tp-select" id="selectColor_${sanitizeId(item.id)}" style="padding: 4px 8px; font-size: 12px; width: 100%;">
          ${APPAREL_COLORS.map(c => `<option value="${c}">${c}</option>`).join("")}
        </select>
      </div>
    `;

    tr.innerHTML = `
      <td>${itemHtml}</td>
      <td>${enableHtml}</td>
      <td>${colorSelectHtml}</td>
    `;

    // Row Click highlights row and sets preview silhouette
    tr.addEventListener("click", () => {
      state.activeApparelId = item.id;
      document.querySelectorAll(".tp-apparel-row").forEach(r => r.classList.remove("active"));
      tr.classList.add("active");
      syncActiveApparelPreview();
    });

    // Checkbox Toggle
    const chk = tr.querySelector(`#chkApparel_${sanitizeId(item.id)}`);
    chk.addEventListener("change", (e) => {
      if (state.currentIndex < 0) return;
      const design = state.designs[state.currentIndex];
      if (!design.apparel_settings) design.apparel_settings = {};
      if (!design.apparel_settings[item.id]) design.apparel_settings[item.id] = {};
      design.apparel_settings[item.id].enabled = e.target.checked;

      postJSON("/api/update-design-field", {
        index: state.currentIndex,
        field: "apparel_settings",
        value: design.apparel_settings
      });
    });

    // Color Dropdown Change
    const sel = tr.querySelector(`#selectColor_${sanitizeId(item.id)}`);
    sel.addEventListener("change", (e) => {
      const chosenColor = e.target.value;
      if (state.currentIndex >= 0) {
        const design = state.designs[state.currentIndex];
        if (!design.apparel_settings) design.apparel_settings = {};
        if (!design.apparel_settings[item.id]) design.apparel_settings[item.id] = {};
        design.apparel_settings[item.id].defaultColor = chosenColor;

        // Also sync product_colors for backward compatibility
        if (!design.product_colors) design.product_colors = {};
        design.product_colors[item.id] = chosenColor;

        if (item.id === "T-Shirt") {
          design.default_color = chosenColor;
        }

        postJSON("/api/update-design-field", {
          index: state.currentIndex,
          field: "apparel_settings",
          value: design.apparel_settings
        });
      }

      // If this row is T-Shirt or currently the active selected item, update garment preview color immediately!
      if (item.id === "T-Shirt" || state.activeApparelId === item.id) {
        setGarmentColor(COLOR_MAP[chosenColor] || "#111111");
      }
    });

    // Print placement radio change (T-Shirt)
    if (item.hasPrintRadios) {
      tr.querySelectorAll('input[name="printPlacement"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
          if (state.currentIndex < 0) return;
          state.designs[state.currentIndex].print_placement = e.target.value;
          postJSON("/api/update-design-field", {
            index: state.currentIndex,
            field: "print_placement",
            value: e.target.value
          });
        });
      });
    }

    tbody.appendChild(tr);
  });
}

function updateApparelTableRows() {
  if (state.currentIndex < 0 || state.currentIndex >= state.designs.length) return;
  const design = state.designs[state.currentIndex];
  const settings = design.apparel_settings || {};

  APPAREL_ITEMS.forEach(item => {
    const itemData = settings[item.id] || { enabled: true, defaultColor: item.defaultColor };
    const chk = document.getElementById(`chkApparel_${sanitizeId(item.id)}`);
    const sel = document.getElementById(`selectColor_${sanitizeId(item.id)}`);

    if (chk) chk.checked = itemData.enabled !== false;
    if (sel && itemData.defaultColor) sel.value = itemData.defaultColor;
  });

  // T-Shirt Print Radios
  const placement = design.print_placement || "front";
  const r = document.querySelector(`input[name="printPlacement"][value="${placement}"]`);
  if (r) r.checked = true;
}

function syncActiveApparelPreview() {
  const activeItem = APPAREL_ITEMS.find(it => it.id === state.activeApparelId) || APPAREL_ITEMS[0];
  let defaultColorName = activeItem.defaultColor;

  if (state.currentIndex >= 0 && state.currentIndex < state.designs.length) {
    const design = state.designs[state.currentIndex];
    if (design.apparel_settings && design.apparel_settings[activeItem.id]) {
      defaultColorName = design.apparel_settings[activeItem.id].defaultColor || defaultColorName;
    } else if (activeItem.id === "T-Shirt" && design.default_color) {
      defaultColorName = design.default_color;
    }
  }

  setGarmentColor(COLOR_MAP[defaultColorName] || "#111111");
  renderGarmentSilhouette(activeItem.id);
}

let tshirtMaskImg = null;
let tshirtShadingImg = null;
let tshirtWhiteImg = null;
let currentTShirtColor = "#111111";

function preloadTShirtAssets() {
  tshirtMaskImg = new Image();
  tshirtMaskImg.src = "tshirt_mask.png";
  tshirtMaskImg.onload = () => renderRealisticTShirt(currentTShirtColor);

  tshirtShadingImg = new Image();
  tshirtShadingImg.src = "tshirt_shading.png";
  tshirtShadingImg.onload = () => renderRealisticTShirt(currentTShirtColor);

  tshirtWhiteImg = new Image();
  tshirtWhiteImg.src = "tshirt_white.png";
  tshirtWhiteImg.onload = () => renderRealisticTShirt(currentTShirtColor);
}

function renderRealisticTShirt(hexColor) {
  currentTShirtColor = hexColor || "#111111";
  const canvas = document.getElementById("tshirtCanvasEl");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const hexNorm = currentTShirtColor.toUpperCase();
  const isBrightWhite = hexNorm === "#FFFFFF" || hexNorm === "#FFF" || currentTShirtColor.toLowerCase() === "white";

  // Dedicated Ultra-Crisp Bright White Fabric Renderer (eliminates dark grey shadows)
  if (isBrightWhite && tshirtWhiteImg && tshirtWhiteImg.complete) {
    ctx.drawImage(tshirtWhiteImg, 0, 0, w, h);
    return;
  }

  if (tshirtMaskImg && tshirtMaskImg.complete && tshirtShadingImg && tshirtShadingImg.complete) {
    // 1. Draw mask & base color
    ctx.save();
    ctx.drawImage(tshirtMaskImg, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = currentTShirtColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 2. Multiply realistic shading, wrinkles, and collar ribbing
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(tshirtShadingImg, 0, 0, w, h);
    ctx.restore();
  }
}

function setGarmentColor(hex) {
  currentTShirtColor = hex || "#111111";
  renderRealisticTShirt(currentTShirtColor);
}

function renderGarmentSilhouette(itemId) {
  renderRealisticTShirt(currentTShirtColor);
}

// ===================================================================
// SECTION C: PRODUCT COLORS SWATCH MATRIX (Screenshot 1)
// ===================================================================

function renderSwatchMatrix() {
  const container = document.getElementById("tpSwatchMatrix");
  if (!container) return;
  container.innerHTML = "";

  TEEPUBLIC_PALETTE.forEach((color) => {
    const tile = document.createElement("div");
    tile.className = `tp-matrix-tile ${color.isLight ? "light-color" : ""}`;
    tile.style.backgroundColor = color.hex;
    tile.title = `${color.name} (${color.hex})`;
    tile.dataset.colorName = color.name;

    tile.addEventListener("click", () => {
      toggleSwatchColor(color);
    });

    container.appendChild(tile);
  });
}

function syncSwatchMatrixUI() {
  const container = document.getElementById("tpSwatchMatrix");
  if (!container) return;
  if (state.currentIndex < 0 || state.currentIndex >= state.designs.length) return;
  const design = state.designs[state.currentIndex];

  // Default: if available_colors not set, activate all
  if (!design.available_colors || !Array.isArray(design.available_colors)) {
    design.available_colors = TEEPUBLIC_PALETTE.map(c => c.name);
  }

  const activeSet = new Set(design.available_colors);

  document.querySelectorAll(".tp-matrix-tile").forEach(tile => {
    const cName = tile.dataset.colorName;
    const isActive = activeSet.has(cName);
    tile.classList.toggle("active", isActive);
    tile.classList.toggle("inactive", !isActive);
  });

  // Highlight active preset button if matches
  updatePresetButtonsState();
}

function toggleSwatchColor(color) {
  if (state.currentIndex < 0 || state.currentIndex >= state.designs.length) return;
  const design = state.designs[state.currentIndex];

  if (!design.available_colors) {
    design.available_colors = TEEPUBLIC_PALETTE.map(c => c.name);
  }

  const idx = design.available_colors.indexOf(color.name);
  if (idx > -1) {
    design.available_colors.splice(idx, 1);
  } else {
    design.available_colors.push(color.name);
  }

  // Also change garment canvas color so user previews their art on this exact color!
  setGarmentColor(color.hex);

  syncSwatchMatrixUI();

  postJSON("/api/update-design-field", {
    index: state.currentIndex,
    field: "available_colors",
    value: design.available_colors
  });
}

function setupColorPresetButtons() {
  const btnAll = document.getElementById("btnColorPresetAll");
  const btnLight = document.getElementById("btnColorPresetLight");
  const btnDark = document.getElementById("btnColorPresetDark");
  const btnNone = document.getElementById("btnColorPresetNone");
  if (btnAll) btnAll.addEventListener("click", () => applyColorPreset("all"));
  if (btnLight) btnLight.addEventListener("click", () => applyColorPreset("light"));
  if (btnDark) btnDark.addEventListener("click", () => applyColorPreset("dark"));
  if (btnNone) btnNone.addEventListener("click", () => applyColorPreset("none"));
}

function applyColorPreset(preset) {
  if (state.currentIndex < 0 || state.currentIndex >= state.designs.length) return;
  const design = state.designs[state.currentIndex];

  if (preset === "all") {
    design.available_colors = TEEPUBLIC_PALETTE.map(c => c.name);
    setGarmentColor("#111111");
  } else if (preset === "none") {
    design.available_colors = [];
  } else if (preset === "light") {
    design.available_colors = TEEPUBLIC_PALETTE.filter(c => c.isLight).map(c => c.name);
    setGarmentColor("#FFFFFF");
  } else if (preset === "dark") {
    design.available_colors = TEEPUBLIC_PALETTE.filter(c => !c.isLight).map(c => c.name);
    setGarmentColor("#111111");
  }

  design.color_preference = preset;
  syncSwatchMatrixUI();

  postJSON("/api/update-design-field", {
    index: state.currentIndex,
    field: "available_colors",
    value: design.available_colors
  });

  postJSON("/api/update-design-field", {
    index: state.currentIndex,
    field: "color_preference",
    value: preset
  });

  appendLog("SUCCESS", `Applied '${preset.toUpperCase()}' color preset to Design #${state.currentIndex + 1}`);
}

function updatePresetButtonsState() {
  const curDesign = state.designs[state.currentIndex] || {};
  const pref = (curDesign.color_preference || "dark").toLowerCase();

  const btns = {
    all: document.getElementById("btnColorPresetAll"),
    light: document.getElementById("btnColorPresetLight"),
    dark: document.getElementById("btnColorPresetDark"),
    none: document.getElementById("btnColorPresetNone")
  };

  Object.keys(btns).forEach(key => {
    if (btns[key]) btns[key].classList.toggle("active", key === pref);
  });
}

// ===================================================================
// SECTION D: CONFIGURE OTHER PRODUCTS (Screenshot 4)
// ===================================================================

function renderOtherProductsGrid() {
  const container = document.getElementById("tpOtherGrid");
  if (!container) return;
  container.innerHTML = "";

  OTHER_PRODUCTS.forEach(prod => {
    const card = document.createElement("div");
    card.className = "tp-other-card enabled";
    card.dataset.prodId = prod.id;

    card.innerHTML = `
      <div class="tp-other-thumb-box">
        <img class="tp-other-thumb-art" id="thumbArt_${sanitizeId(prod.id)}" alt="${escapeHtml(prod.name)}" style="display: none;" />
        <span class="tp-other-icon" id="thumbIcon_${sanitizeId(prod.id)}" style="font-size: 24px;">${prod.icon}</span>
      </div>
      <span class="tp-other-card-title">${prod.name}</span>
      <input type="checkbox" id="chkOther_${sanitizeId(prod.id)}" checked style="accent-color: #3B82F6; cursor: pointer;" />
    `;

    // Click card to toggle enabled state
    card.addEventListener("click", () => {
      const chk = card.querySelector("input[type='checkbox']");
      chk.checked = !chk.checked;
      toggleOtherProduct(prod.id, chk.checked);
    });

    const chk = card.querySelector("input[type='checkbox']");
    chk.addEventListener("click", (e) => e.stopPropagation());
    chk.addEventListener("change", (e) => {
      toggleOtherProduct(prod.id, e.target.checked);
    });

    container.appendChild(card);
  });
}

function syncOtherProductsUI() {
  if (state.currentIndex < 0 || state.currentIndex >= state.designs.length) return;
  const design = state.designs[state.currentIndex];
  const toggles = design.product_toggles || {};

  OTHER_PRODUCTS.forEach(prod => {
    const card = document.querySelector(`.tp-other-card[data-prod-id="${prod.id}"]`);
    const isEnabled = toggles[prod.id] !== false;
    const chk = document.getElementById(`chkOther_${sanitizeId(prod.id)}`);
    const img = document.getElementById(`thumbArt_${sanitizeId(prod.id)}`);
    const icon = document.getElementById(`thumbIcon_${sanitizeId(prod.id)}`);

    if (card) {
      card.classList.toggle("enabled", isEnabled);
      card.classList.toggle("disabled", !isEnabled);
    }
    if (chk) chk.checked = isEnabled;

    if (design.has_thumbnail && img && icon) {
      img.src = `/api/thumbnail/${state.currentIndex}?t=${Date.now()}`;
      img.style.display = "block";
      icon.style.display = "none";
    } else if (img && icon) {
      img.style.display = "none";
      icon.style.display = "block";
    }
  });
}

function toggleOtherProduct(prodId, isEnabled) {
  if (state.currentIndex < 0 || state.currentIndex >= state.designs.length) return;
  const design = state.designs[state.currentIndex];
  if (!design.product_toggles) design.product_toggles = {};
  design.product_toggles[prodId] = isEnabled;

  const card = document.querySelector(`.tp-other-card[data-prod-id="${prodId}"]`);
  if (card) {
    card.classList.toggle("enabled", isEnabled);
    card.classList.toggle("disabled", !isEnabled);
  }

  postJSON("/api/update-design-field", {
    index: state.currentIndex,
    field: "product_toggles",
    value: design.product_toggles
  });
}

// ===================================================================
// FILTERS & UTILITY
// ===================================================================

function setupFilters() {
  const tabs = document.querySelectorAll(".filter-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      state.activeFilter = tab.dataset.filter;
      renderSidebarListings();
      renderSidebarDesigns();
    });
  });
}

function filterDesigns(list) {
  const f = state.activeFilter;
  if (f === "matched") return list.filter(d => d.is_matched);
  if (f === "missing") return list.filter(d => !d.is_matched);
  return list;
}

// ===================================================================
// ACTIVITY TERMINAL DRAWER
// ===================================================================

function setupTerminalDrawer() {
  const btnToggle = document.getElementById("btnToggleTerminal");
  const drawer = document.getElementById("terminalDrawer");
  const chevron = document.getElementById("logChevron");

  btnToggle.addEventListener("click", () => {
    drawer.classList.toggle("open");
    chevron.textContent = drawer.classList.contains("open") ? "▼" : "▲";
  });

  document.getElementById("btnCopyLogs").addEventListener("click", () => {
    const text = Array.from(document.querySelectorAll("#logTerminalBody .log-line"))
      .map(e => e.textContent.trim())
      .join("\n");
    navigator.clipboard.writeText(text);
    appendLog("INFO", "Copied activity logs to clipboard.");
  });

  document.getElementById("btnClearLogs").addEventListener("click", () => {
    document.getElementById("logTerminalBody").innerHTML = "";
  });
}

function appendLog(level, message, timestamp) {
  const body = document.getElementById("logTerminalBody");
  if (!body) return;
  const ts = timestamp || new Date().toTimeString().slice(0, 8);
  const lvl = (level || "INFO").toUpperCase();

  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML = `
    <span class="log-ts">[${ts}]</span>
    <span class="log-lvl log-lvl-${lvl}">[${lvl}]</span>
    <span class="log-msg">${escapeHtml(message)}</span>
  `;

  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

function sanitizeId(str) {
  return String(str).replace(/[^a-zA-Z0-9]/g, "_");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
