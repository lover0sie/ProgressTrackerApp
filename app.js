import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "./firebase.js";

const periodPicker = document.getElementById("periodPicker");
const periodLabel = document.getElementById("periodLabel");

const refreshBtn = document.getElementById("refreshBtn");

const selectedTypeText = document.getElementById("selectedTypeText");
const selectedDescText = document.getElementById("selectedDescText");
const targetText = document.getElementById("targetText");
const actualText = document.getElementById("actualText");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");
const lastUpdateText = document.getElementById("lastUpdateText");

const progressTitle = document.getElementById("progressTitle");
const progressSubTitle = document.getElementById("progressSubTitle");
const targetFooter = document.getElementById("targetFooter");
const actualFooter = document.getElementById("actualFooter");
const actualNoteText = document.getElementById("actualNoteText");
const progressNoteText = document.getElementById("progressNoteText");

const targetLabel = document.getElementById("targetLabel");
const actualLabel = document.getElementById("actualLabel");

let selectedType = "PV";
let selectedView = "monthly";
let autoRefreshTimer = null;
let lastDashboardUpdateAt = null;
let relativeUpdateTimer = null;

const TYPE_LABEL = {
  PV: "Pressure Vessel",
  AC: "Air-Cooled Chiller",
  WC: "Water-Cooled Chiller"
};

function getCurrentDateKey() {
  const now = new Date();
  return now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kuala_Lumpur"
  });
}

function countWorkingDaysInMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  let count = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();

    // Monday to Friday only
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      count++;
    }
  }

  return count;
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatRelativeTime(date) {
  if (!date) return "-";

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSeconds < 60) return "Just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function updateLastUpdateText() {
  lastUpdateText.textContent = formatRelativeTime(lastDashboardUpdateAt);
}

function startRelativeUpdateTimer() {
  if (relativeUpdateTimer) {
    clearInterval(relativeUpdateTimer);
  }

  relativeUpdateTimer = setInterval(updateLastUpdateText, 30000);
}

function getDateRange(dateKey) {
  return {
    startDate: dateKey,
    nextDate: dateKey
  };
}

function getRange(periodKey, viewMode) {
  if (viewMode === "daily") {
    return {
      startDate: periodKey,
      nextDate: periodKey,
      isDaily: true
    };
  }

  return {
    ...getMonthRange(periodKey),
    isDaily: false
  };
}

function getMonthRange(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  return { startDate, nextDate };
}

async function getTarget(monthKey, type) {
  const ref = doc(db, "productionTargets", monthKey);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return { target: 0, updatedAt: null };
  }

  const data = snap.data();

  return {
    target: Number(data[type] || 0),
    updatedAt: data.updatedAt || null
  };
}

function isProcess14A(processName = "") {
  return String(processName).trim().toUpperCase().startsWith("14A");
}

function isProcess14B(processName = "") {
  return String(processName).trim().toUpperCase().startsWith("14B");
}

function isProcessH1(processName = "") {
  return String(processName).trim().toUpperCase().startsWith("H1");
}

function normalizeCoolingType(coolingType = "") {
  const value = String(coolingType).trim().toUpperCase();

  if (value.includes("AIR")) return "AC";
  if (value.includes("WATER")) return "WC";

  return "";
}

async function getPVActual(periodKey, viewMode) {
  const { startDate, nextDate, isDaily } = getRange(periodKey, viewMode);

  const dateFilters = isDaily
  ? [where("runDate", "==", startDate)]
  : [
      where("runDate", ">=", startDate),
      where("runDate", "<", nextDate)
    ];

  const q = query(
    collectionGroup(db, "runs"),
    where("qrKind", "==", "PV"),
    where("status", "==", "completed"),
    ...dateFilters
  );

  const snap = await getDocs(q);
  const pvMap = {};

  snap.forEach((docSnap) => {
    const run = docSnap.data();

    const pvSerial = run.pvSerialNumber || run.serialNumber;
    const processName = run.processName || "";

    if (!pvSerial) return;

    if (!pvMap[pvSerial]) {
      pvMap[pvSerial] = {
        has14A: false,
        has14B: false
      };
    }

    if (isProcess14A(processName)) {
      pvMap[pvSerial].has14A = true;
    }

    if (isProcess14B(processName)) {
      pvMap[pvSerial].has14B = true;
    }
  });

  return Object.values(pvMap).filter(item => item.has14A && item.has14B).length;
}


async function getChillerActual(periodKey, type, viewMode) {
  const { startDate, nextDate, isDaily } = getRange(periodKey, viewMode);

  const dateFilters = isDaily
    ? [where("runDate", "==", startDate)]
    : [
        where("runDate", ">=", startDate),
        where("runDate", "<", nextDate)
      ];

  const q = query(
    collectionGroup(db, "runs"),
    where("qrKind", "==", "CHILLER"),
    where("status", "==", "completed"),
    ...dateFilters
  );

  const snap = await getDocs(q);

  let count = 0;
  const counted = [];

  snap.forEach((docSnap) => {
    const run = docSnap.data();

    const processName = run.processName || "";
    const coolingType = normalizeCoolingType(run.coolingType);

    if (coolingType !== type) return;
    if (!isProcessH1(processName)) return;

    count++;

    counted.push({
      serial: run.chillerSerialNumber || run.serialNumber,
      project: run.projectName,
      process: processName,
      coolingType: run.coolingType
    });
  });

  console.table(counted);

  return count;
}

async function getActual(periodKey, type, viewMode) {
  if (type === "PV") {
    return await getPVActual(periodKey, viewMode);
  }

  if (type === "AC" || type === "WC") {
    return await getChillerActual(periodKey, type, viewMode);
  }

  return null;
}

function startAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }

  autoRefreshTimer = setInterval(async () => {
    try {
      await loadDashboard();
    } catch (err) {
      console.error("Auto refresh failed", err);
    }
  }, 60000);
}

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  refreshBtn.textContent = isLoading ? "Loading..." : "Refresh";
}

function updateTypeButtons() {
  document.querySelectorAll("[data-type]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === selectedType);
  });
}

function render({ type, target, actual }) {
  selectedTypeText.textContent = type;
  selectedDescText.textContent = TYPE_LABEL[type];

  targetText.textContent = target;

  const hasActual = actual !== null && actual !== undefined;

  actualText.textContent = hasActual ? actual : "-";

  const percent = target > 0 && hasActual
    ? Math.round((actual / target) * 100)
    : 0;

  progressText.textContent = hasActual ? `${percent}%` : "-";

  progressText.classList.remove(
    "text-red",
    "text-orange",
    "text-green"
  );

  if (percent < 50) {
    progressText.classList.add("text-red");
  } else if (percent < 80) {
    progressText.classList.add("text-orange");
  } else {
    progressText.classList.add("text-green");
  }

  progressBar.style.width = `${Math.min(percent, 100)}%`;

  progressBar.classList.remove("progress-red", "progress-orange", "progress-green");

  if (percent < 50) {
    progressBar.classList.add("progress-red");
  } else if (percent < 80) {
    progressBar.classList.add("progress-orange");
  } else {
    progressBar.classList.add("progress-green");
  }

  progressTitle.textContent = `${type} Progress`;

  if (type === "PV") {
    progressSubTitle.textContent = "Actual is counted when PV completed both process 14A and 14B.";
  } else if (type === "AC") {
    progressSubTitle.textContent = "Actual is counted when Air-Cooled Chiller completed process H1.";
  } else if (type === "WC") {
    progressSubTitle.textContent = "Actual is counted when Water-Cooled Chiller completed process H1.";
  }

  if (selectedView === "daily") {
    targetFooter.textContent = `Daily Target: ${target}`;
    actualFooter.textContent = `Daily Actual: ${hasActual ? actual : "-"}`;
    targetLabel.textContent = "Daily Target";
    actualLabel.textContent = "Daily Actual";
  } else {
    targetFooter.textContent = `Monthly Target: ${target}`;
    actualFooter.textContent = `Monthly Actual: ${hasActual ? actual : "-"}`;
    targetLabel.textContent = "Monthly Target";
    actualLabel.textContent = "Monthly Actual";
  }

  lastDashboardUpdateAt = new Date();
  updateLastUpdateText();
}

async function loadDashboard() {
  try {
    setLoading(true);

    const periodKey = periodPicker.value;

    const targetKey = selectedView === "monthly"
      ? periodKey
      : periodKey.slice(0, 7);

    const { target: monthlyTarget } = await getTarget(targetKey, selectedType);

    let displayTarget = monthlyTarget;

    if (selectedView === "daily") {
      const workingDays = countWorkingDaysInMonth(targetKey);
      displayTarget = workingDays > 0
        ? Math.floor(monthlyTarget / workingDays)
        : 0;
    }

    const actual = await getActual(periodKey, selectedType, selectedView);

    render({
      type: selectedType,
      target: displayTarget,
      actual
    });
  } catch (error) {
    console.error(error);
    alert("Failed to load dashboard data. Please check Firebase config, Firestore rules, or required index.");
  } finally {
    setLoading(false);
  }
}

periodPicker.value = getCurrentMonthKey();

document.querySelectorAll("[data-type]").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedType = btn.dataset.type;
    updateTypeButtons();
    loadDashboard();
  });
});

document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedView = btn.dataset.view;

    document.querySelectorAll("[data-view]").forEach(b => {
      b.classList.toggle("active", b.dataset.view === selectedView);
    });

    if (selectedView === "daily") {
      periodPicker.type = "date";
      periodPicker.value = getCurrentDateKey();
      periodLabel.textContent = "Date";
    } else {
      periodPicker.type = "month";
      periodPicker.value = getCurrentMonthKey();
      periodLabel.textContent = "Month";
    }

    loadDashboard();
  });
});

periodPicker.addEventListener("change", loadDashboard);
refreshBtn.addEventListener("click", loadDashboard);

loadDashboard();

// Auto refresh every minute
startAutoRefresh();
startRelativeUpdateTimer();
