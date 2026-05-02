"use strict";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "openOptions") {
    chrome.runtime.openOptionsPage();
  }
});
