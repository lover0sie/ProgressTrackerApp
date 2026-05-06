import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "./firebase.js";

const monthPicker = document.getElementById("monthPicker");
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

let selectedType = "PV";

const TYPE_LABEL = {
  PV: "Pressure Vessel",
  AC: "Air-Cooled Chiller",
  WC: "Water-Cooled Chiller"
};

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(date = new Date()) {
  return date
    .toLocaleString("en-GB", {
      timeZone: "Asia/Kuala_Lumpur",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    })
    .replace("am", "AM")
    .replace("pm", "PM");
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

async function getPVActual(monthKey) {
  const { startDate, nextDate } = getMonthRange(monthKey);

  const q = query(
    collectionGroup(db, "runs"),
    where("qrKind", "==", "PV"),
    where("status", "==", "completed"),
    where("runDate", ">=", startDate),
    where("runDate", "<", nextDate)
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

async function getActual(monthKey, type) {
  if (type === "PV") {
    return await getPVActual(monthKey);
  }

  // Leave AC and WC empty first because actual data is not ready yet.
  return null;
}

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  refreshBtn.textContent = isLoading ? "Loading..." : "Refresh";
}

function updateTypeButtons() {
  document.querySelectorAll(".segment").forEach(btn => {
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
  progressBar.style.width = `${Math.min(percent, 100)}%`;

  progressTitle.textContent = `${type} Progress`;

  if (type === "PV") {
    progressSubTitle.textContent = "Actual is counted when PV completed both process 14A and 14B.";
  
  } else {
    progressSubTitle.textContent = "Actual data is not available yet.";

  }

  targetFooter.textContent = `Target: ${target}`;
  actualFooter.textContent = `Actual: ${hasActual ? actual : "-"}`;

  lastUpdateText.textContent = formatDateTime();
}

async function loadDashboard() {
  try {
    setLoading(true);

    const monthKey = monthPicker.value || getCurrentMonthKey();
    const { target } = await getTarget(monthKey, selectedType);
    const actual = await getActual(monthKey, selectedType);

    render({
      type: selectedType,
      target,
      actual
    });
  } catch (error) {
    console.error(error);
    alert("Failed to load dashboard data. Please check Firebase config, Firestore rules, or required index.");
  } finally {
    setLoading(false);
  }
}

monthPicker.value = getCurrentMonthKey();

document.querySelectorAll(".segment").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedType = btn.dataset.type;
    updateTypeButtons();
    loadDashboard();
  });
});

monthPicker.addEventListener("change", loadDashboard);
refreshBtn.addEventListener("click", loadDashboard);

loadDashboard();
