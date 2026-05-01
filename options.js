"use strict";

const FIELDS = ["officerName", "officerNmls", "officerPhone", "officerEmail"];

function load() {
  chrome.storage.sync.get(
    Object.fromEntries(FIELDS.map((k) => [k, ""])),
    (vals) => {
      for (const k of FIELDS) document.getElementById(k).value = vals[k] || "";
    }
  );
}

function save() {
  const payload = {};
  for (const k of FIELDS) payload[k] = document.getElementById(k).value.trim();
  chrome.storage.sync.set(payload, () => {
    const note = document.getElementById("saved");
    note.hidden = false;
    setTimeout(() => (note.hidden = true), 1500);
  });
}

document.getElementById("save").addEventListener("click", save);
load();
