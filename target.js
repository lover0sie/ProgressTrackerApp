import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "./firebase.js";

const typeSelect = document.getElementById("typeSelect");
const monthPicker = document.getElementById("monthPicker");
const targetInput = document.getElementById("targetInput");
const saveBtn = document.getElementById("saveBtn");
const statusText = document.getElementById("statusText");
const targetError = document.getElementById("targetError");


function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function loadExistingTarget() {
  const monthKey = monthPicker.value;
  const type = typeSelect.value;

  if (!monthKey || !type) return;

  const ref = doc(db, "productionTargets", monthKey);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    targetInput.value = data[type] ?? "";
  } else {
    targetInput.value = "";
  }
}

function validateTarget() {
  const value = targetInput.value.trim();

  targetError.textContent = "";
  targetInput.classList.remove("input-error");

  // Empty check
  if (value === "") {
    targetError.textContent = "Please fill in the target.";
    targetInput.classList.add("input-error");
    return false;
  }

  // Integer check
  if (!/^\d+$/.test(value)) {
    targetError.textContent = "Target must be an integer number.";
    targetInput.classList.add("input-error");
    return false;
  }

  return true;
}

async function saveTarget() {

  if (!validateTarget()) {
    return;
  }

  const monthKey = monthPicker.value;
  const type = typeSelect.value;
  const target = Number(targetInput.value);

  if (!monthKey) {
    statusText.textContent = "Please select month.";
    statusText.className = "status-text error";
    return;
  }

  if (!Number.isInteger(target) || target < 0) {
    statusText.textContent = "Please enter a valid integer target.";
    statusText.className = "status-text error";
    return;
  }

  try {
    saveBtn.disabled = true;
    loadingOverlay.classList.remove("hidden");

    const ref = doc(db, "productionTargets", monthKey);

    await setDoc(ref, {
      month: monthKey,
      [type]: target,
      updatedAt: serverTimestamp()
    }, { merge: true });

    window.location.href = "index.html";

  } catch (error) {
    console.error(error);
    loadingOverlay.classList.add("hidden");
    saveBtn.disabled = false;

    statusText.textContent = "Failed to save target. Please check Firebase config or Firestore rules.";
    statusText.className = "status-text error";
  }
}

monthPicker.value = getCurrentMonthKey();

typeSelect.addEventListener("change", loadExistingTarget);
monthPicker.addEventListener("change", loadExistingTarget);
saveBtn.addEventListener("click", saveTarget);
targetInput.addEventListener("input", validateTarget);


loadExistingTarget();
