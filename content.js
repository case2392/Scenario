"use strict";

const BUTTON_ID = "zhl-detailed-pdf-btn";
const STATUS_ID = "zhl-status-overlay";
const TOP_HEADERS = new Set(["Loan costs", "Other costs", "Credits", "Mortgage insurance"]);

function findGenerateBtn() {
  return [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Generate PDF"
  );
}

function injectButton() {
  if (document.getElementById(BUTTON_ID)) return;
  const genBtn = findGenerateBtn();
  if (!genBtn) return;

  const myBtn = document.createElement("button");
  myBtn.id = BUTTON_ID;
  myBtn.type = "button";
  myBtn.className = "zhl-detailed-pdf-btn";
  myBtn.textContent = "Detailed PDF";
  myBtn.addEventListener("click", handleClick);

  genBtn.parentElement.insertBefore(myBtn, genBtn);
}

const obs = new MutationObserver(() => injectButton());
obs.observe(document.body, { childList: true, subtree: true });
injectButton();

async function handleClick() {
  const btn = document.getElementById(BUTTON_ID);
  const checkboxes = [
    ...document.querySelectorAll('input[name="selectScenario"]'),
  ].filter((c) => c.checked);

  if (checkboxes.length === 0) {
    alert("Select at least one scenario (use the checkbox on the card) before generating a detailed PDF.");
    return;
  }

  const officer = await getOfficerInfo();
  if (!officerIsConfigured(officer)) {
    alert(
      "Please fill in your loan officer info first. Opening the settings page now."
    );
    chrome.runtime.sendMessage({ type: "openOptions" });
    return;
  }

  document.body.classList.add("zhl-scraping");
  showStatus("Collecting scenario data…");
  btn.disabled = true;

  try {
    const borrower = scrapeBorrower();
    const scenarios = [];

    for (let i = 0; i < checkboxes.length; i++) {
      showStatus(`Collecting scenario ${i + 1} of ${checkboxes.length}…`);
      const card = checkboxes[i].closest('div[class*="StyledCard"]');
      if (!card) continue;
      scenarios.push(await scrapeScenario(card));
    }

    const payload = {
      borrower,
      officer,
      scenarios,
      generatedAt: new Date().toISOString(),
      sourceUrl: location.href,
    };

    await saveReportPayload(payload);
    const reportUrl = chrome.runtime.getURL("report.html");
    window.open(reportUrl, "_blank");
  } catch (err) {
    console.error("[Detailed PDF]", err);
    alert("Failed to generate report: " + (err && err.message ? err.message : err));
  } finally {
    document.body.classList.remove("zhl-scraping");
    hideStatus();
    btn.disabled = false;
  }
}

function showStatus(text) {
  let el = document.getElementById(STATUS_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = STATUS_ID;
    el.className = "zhl-status-overlay";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = "flex";
}

function hideStatus() {
  const el = document.getElementById(STATUS_ID);
  if (el) el.style.display = "none";
}

async function scrapeScenario(card) {
  const allParas = [...card.querySelectorAll("p")];
  const title = (allParas[0]?.textContent || "").trim();
  let summary = "";
  let pricedAt = "";
  for (const p of allParas) {
    const t = p.textContent.trim();
    if (!summary && /\$/.test(t) && /(Purchase|Refinance)/i.test(t)) summary = t;
    if (t.startsWith("Priced:")) pricedAt = t.replace(/^Priced:\s*/, "");
  }
  const assigned = [...card.querySelectorAll("span")].some((s) =>
    s.textContent.includes("ASSIGNED TO LOAN")
  );

  const rows = scrapeCardRows(card);

  const ccBtn = findRowButton(card, "Total closing costs");
  let closingCosts = null;
  if (ccBtn) {
    closingCosts = await openAndScrape(ccBtn, "Detailed cost summary", scrapeClosingCostsModal);
  }

  const pmtBtn = findRowButton(card, "Monthly P&I / PITI");
  let paymentBreakdown = null;
  if (pmtBtn) {
    paymentBreakdown = await openAndScrape(pmtBtn, "Payment breakdown", scrapePaymentBreakdownModal);
  }

  return { title, summary, pricedAt, assigned, rows, closingCosts, paymentBreakdown };
}

function scrapeCardRows(card) {
  const values = {};
  const order = [];
  card.querySelectorAll("div").forEach((el) => {
    const ch = [...el.children];
    if (
      ch.length === 2 &&
      ch[0].tagName === "SPAN" &&
      ch[1].tagName === "DIV"
    ) {
      const label = ch[0].textContent.trim();
      const value = ch[1].textContent.trim();
      if (label && value && !(label in values)) {
        values[label] = value;
        order.push(label);
      }
    }
  });
  return { values, order };
}

function findRowButton(card, label) {
  const rows = [...card.querySelectorAll("div")].filter((d) => {
    const ch = [...d.children];
    return (
      ch.length === 2 &&
      ch[0].tagName === "SPAN" &&
      ch[0].textContent.trim() === label
    );
  });
  for (const row of rows) {
    const btn = row.querySelector("button");
    if (btn) return btn;
  }
  return null;
}

async function openAndScrape(triggerBtn, dialogTitle, scrapeFn) {
  triggerBtn.click();
  const dialog = await waitFor(() => findDialogByTitle(dialogTitle), 4000);
  await sleep(150);
  const data = scrapeFn(dialog);
  const closeBtn =
    dialog.querySelector('button[aria-label="Close"]') ||
    dialog.querySelector('[class*="CloseButton"]') ||
    dialog.querySelector("footer button");
  if (closeBtn) closeBtn.click();
  await waitFor(
    () => !document.body.contains(dialog) || !findDialogByTitle(dialogTitle),
    3000
  ).catch(() => {});
  await sleep(80);
  return data;
}

function findDialogByTitle(title) {
  for (const d of document.querySelectorAll('section[role="dialog"]')) {
    const h = d.querySelector("h1, h2, h3, h4, h5, h6");
    if (h && h.textContent.trim() === title) return d;
  }
  return null;
}

function scrapeClosingCostsModal(dialog) {
  const panels = [...dialog.querySelectorAll('[role="tabpanel"]')];
  const closingPanel =
    panels.find((p) => /closing-costs/i.test(p.id || "")) || panels[0] || dialog;
  const miPanel = panels.find((p) => /mortgage/i.test(p.id || ""));

  const lines = walkLines(closingPanel);
  const mi = miPanel ? walkLines(miPanel) : [];

  const meta = [];
  dialog.querySelectorAll("span").forEach((s) => {
    const t = s.textContent.trim();
    if (
      /^\*?Closing corp quote ID:/i.test(t) ||
      /^Mortgage insurance vendor:/i.test(t) ||
      /^Mortgage insurance quote ID:/i.test(t)
    ) {
      meta.push(t);
    }
  });

  return { lines, mi, meta };
}

function scrapePaymentBreakdownModal(dialog) {
  const body = dialog.querySelector('[class*="DialogBody"]') || dialog;
  return { lines: walkLines(body) };
}

function walkLines(root) {
  const lines = [];
  function visit(el) {
    const ch = [...el.children];
    if (ch.length === 1 && ch[0].tagName === "SPAN") {
      const text = ch[0].textContent.trim();
      if (text) {
        const level = TOP_HEADERS.has(text) ? 1 : 2;
        lines.push({ type: "header", text, level });
      }
      return;
    }
    if (
      ch.length === 2 &&
      ch[0].tagName === "SPAN" &&
      ch[1].tagName === "SPAN"
    ) {
      const label = ch[0].textContent.trim();
      const value = ch[1].textContent.trim();
      let kind = "item";
      if (label === "Total") kind = "subtotal";
      else if (/^Total /.test(label)) kind = "grandtotal";
      lines.push({ type: "kv", kind, label, value });
      return;
    }
    for (const c of ch) visit(c);
  }
  visit(root);
  return lines;
}

function scrapeBorrower() {
  const sfLink = document.querySelector('a[aria-label="Open in Salesforce"]');
  if (!sfLink) return { name: "", location: "", tag: "" };
  const container = sfLink.parentElement;
  const spans = [...container.querySelectorAll("span")]
    .map((s) => s.textContent.trim())
    .filter(Boolean);
  const name = spans[0] || "";
  const location = spans.find((s, i) => i > 0 && /,\s*[A-Z]{2}$/.test(s)) || "";
  const tag = spans.find((s) => /pre-approval/i.test(s)) || "";
  return { name, location, tag };
}

async function getOfficerInfo() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getOfficerInfo" }, (info) => {
      if (chrome.runtime.lastError || !info) {
        resolve({ name: "", nmls: "", phone: "", email: "" });
      } else {
        resolve(info);
      }
    });
  });
}

async function saveReportPayload(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "saveReportPayload", payload }, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(resp);
      }
    });
  });
}

function officerIsConfigured(o) {
  return !!(o && (o.name || o.nmls || o.phone || o.email));
}

function waitFor(predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      const r = predicate();
      if (r) return resolve(r);
      if (Date.now() - start > timeout)
        return reject(new Error("Timed out waiting for element"));
      requestAnimationFrame(check);
    })();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
