"use strict";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return false;

  if (msg.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "getOfficerInfo") {
    chrome.storage.sync.get(
      { officerName: "", officerNmls: "", officerPhone: "", officerEmail: "" },
      (v) =>
        sendResponse({
          name: v.officerName,
          nmls: v.officerNmls,
          phone: v.officerPhone,
          email: v.officerEmail,
        })
    );
    return true;
  }

  if (msg.type === "saveReportPayload") {
    chrome.storage.local.set({ zhlReportPayload: msg.payload }, () =>
      sendResponse({ ok: true })
    );
    return true;
  }

  if (msg.type === "getReportPayload") {
    chrome.storage.local.get("zhlReportPayload", (v) =>
      sendResponse(v.zhlReportPayload || null)
    );
    return true;
  }

  return false;
});
