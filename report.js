"use strict";

const COMPARE_ROWS = [
  { key: "Loan purpose", section: "Loan terms" },
  { key: "Purchase price" },
  { key: "Down payment" },
  { key: "Total loan amount" },
  { key: "LTV" },
  { key: "Interest rate", section: "Rate & payment" },
  { key: "APR" },
  { key: "Points / Price" },
  { key: "Lock period" },
  { key: "Monthly P&I / PITI", label: "Monthly P&I / PITI" },
  { key: "Seller credit", section: "Costs & cash" },
  { key: "Total closing costs" },
  { key: "Cash (to) / from" },
  { key: "DTI", section: "Borrower" },
  { key: "Credit score" },
];

const PAYMENT_KEYS = [
  "First mortgage (P&I)",
  "Homeowner's insurance",
  "Property taxes",
  "Mortgage insurance",
  "HOA",
  "Other",
  "Total monthly payment",
];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtIssued(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `Issued ${date} ${time}`;
}

function buildBrand(payload) {
  const b = payload.borrower || {};
  return `
    <div class="brand">
      <div class="logo"><span class="z">Zillow</span> <span class="home">Home Loans</span></div>
      <div class="borrower">
        ${b.name ? `<div class="name">${escapeHtml(b.name)}</div>` : ""}
        ${b.location || b.tag ? `<div class="meta">${escapeHtml([b.location, b.tag].filter(Boolean).join(" · "))}</div>` : ""}
      </div>
    </div>`;
}

function buildTitleRow(payload) {
  return `
    <div class="title-row">
      <h1>Loan Comparison</h1>
      <div class="issued">${escapeHtml(fmtIssued(payload.generatedAt))}</div>
    </div>
    <div class="disclaimer">Your actual rate, payment and costs could be higher: get an official loan estimate before choosing a loan.</div>`;
}

function buildCompareTable(scenarios) {
  const cols = scenarios.length;
  const colWidth = `${(76 / cols).toFixed(2)}%`;
  let html = `<table class="compare"><colgroup><col style="width:24%">${"<col style='width:" + colWidth + "'>".repeat(cols)}</colgroup>`;

  html += `<thead><tr><th>Loan program</th>${scenarios
    .map((s) => `<td><strong>${escapeHtml(s.title || "")}</strong>${s.assigned ? '<div style="font-size:9px;color:#0a8f3c;font-weight:700;letter-spacing:0.3px;">ASSIGNED TO LOAN</div>' : ""}${s.summary ? `<div style="font-size:9.5px;color:#4a4a4a;font-weight:400;">${escapeHtml(s.summary)}</div>` : ""}${s.pricedAt ? `<div style="font-size:9px;color:#6c7383;font-weight:400;">Priced: ${escapeHtml(s.pricedAt)}</div>` : ""}</td>`)
    .join("")}</tr></thead><tbody>`;

  let lastSection = null;
  for (const row of COMPARE_ROWS) {
    if (row.section && row.section !== lastSection) {
      html += `<tr class="section-row"><th>${escapeHtml(row.section)}</th>${"<td></td>".repeat(cols)}</tr>`;
      lastSection = row.section;
    }
    const label = row.label || row.key;
    const isClosingTotal = row.key === "Total closing costs";
    const cls = isClosingTotal ? "total" : "";
    html += `<tr class="${cls}"><th>${escapeHtml(label)}</th>${scenarios
      .map((s) => `<td>${escapeHtml(s.rows?.values?.[row.key] || "—")}</td>`)
      .join("")}</tr>`;
  }

  html += `<tr class="section-row"><th>Estimated monthly payment</th>${"<td></td>".repeat(cols)}</tr>`;
  for (const k of PAYMENT_KEYS) {
    const isTotal = k === "Total monthly payment";
    html += `<tr class="${isTotal ? "total" : "subitem"}"><th>${escapeHtml(k)}</th>${scenarios
      .map((s) => {
        const line = (s.paymentBreakdown?.lines || []).find(
          (l) => l.type === "kv" && l.label === k
        );
        return `<td>${escapeHtml(line ? line.value : "—")}</td>`;
      })
      .join("")}</tr>`;
  }

  html += `</tbody></table>`;
  return html;
}

function buildBreakdownGrid(scenarios) {
  const cols = scenarios.length;
  const grid = `repeat(${cols}, minmax(0, 1fr))`;
  const cards = scenarios.map((s) => buildBreakdownCard(s)).join("");
  return `
    <div class="section-title">Detailed closing-cost breakdown</div>
    <div class="breakdown-grid" style="grid-template-columns:${grid}">
      ${cards}
    </div>`;
}

function buildBreakdownCard(scenario) {
  const cc = scenario.closingCosts;
  if (!cc) {
    return `<div class="breakdown-card"><div class="head">${escapeHtml(scenario.title || "")}</div><div class="body"><em>No detailed breakdown captured.</em></div></div>`;
  }

  const lines = cc.lines || [];
  const meta = cc.meta || [];
  const total = scenario.rows?.values?.["Total closing costs"] || "";

  let body = "";
  for (const ln of lines) {
    if (ln.type === "header") {
      body += ln.level === 1
        ? `<div class="bd-h1">${escapeHtml(ln.text)}</div>`
        : `<div class="bd-h2">${escapeHtml(ln.text)}</div>`;
      continue;
    }
    if (ln.type === "kv") {
      let cls = "bd-row";
      if (ln.kind === "subtotal") cls += " subtotal";
      else if (ln.kind === "grandtotal") {
        cls += " grandtotal";
        if (/^Total closing costs$/i.test(ln.label)) cls += " final";
      }
      body += `<div class="${cls}"><span class="lbl">${escapeHtml(ln.label)}</span><span class="val">${escapeHtml(ln.value)}</span></div>`;
    }
  }

  const metaHtml = meta.length
    ? `<div class="meta-line">${meta.map(escapeHtml).join(" · ")}</div>`
    : "";

  return `
    <div class="breakdown-card">
      <div class="head">
        <span>${escapeHtml(scenario.title || "Scenario")}</span>
        <span class="sub">${escapeHtml(total)}</span>
      </div>
      <div class="body">
        ${metaHtml}
        ${body}
      </div>
    </div>`;
}

function buildQuestions(officer) {
  const o = officer || {};
  if (!o.name && !o.email && !o.phone) {
    return `<div class="questions"><strong>Questions?</strong> Configure your loan-officer info in the extension's options page.</div>`;
  }
  const parts = [];
  if (o.name) parts.push(`<strong>Questions?</strong> ${escapeHtml(o.name)}`);
  if (o.nmls) parts.push(`NMLS ID# ${escapeHtml(o.nmls)}`);
  if (o.phone) parts.push(`P ${escapeHtml(o.phone)}`);
  if (o.email) parts.push(`E ${escapeHtml(o.email)}`);
  return `<div class="questions">${parts.join(" | ")}<div style="margin-top:4px;font-size:10px;color:#4a4a4a;">Mortgage interest rates can change daily, sometimes hourly. Contact your loan officer today!</div></div>`;
}

function buildLegalese() {
  return `<div class="legalese">
    Zillow Home Loans, LLC NMLS # 10287 | 2600 Michelson Drive, Suite 1201, Irvine, CA 92612. An Equal Housing Lender. This is not a commitment to lend. Not licensed in the state of New York.
    About Zillow Home Loans, LLC https://www.zillowhomeloans.com/ | (888) 852-2212. At Zillow Home Loans, we're committed to delivering best-in-class and local market expertise, with communication and transparency every step of the way. Zillow Home Loans is a part of Zillow Group, which houses a portfolio of the largest and most vibrant real estate and home-related brands on the web and mobile.
  </div>`;
}

function render(payload) {
  const root = document.getElementById("root");
  const scenarios = payload.scenarios || [];

  const html = `
    <div class="page">
      ${buildBrand(payload)}
      ${buildTitleRow(payload)}
      ${buildCompareTable(scenarios)}
      ${buildBreakdownGrid(scenarios)}
      ${buildQuestions(payload.officer)}
      ${buildLegalese()}
      <div class="page-num">Generated ${escapeHtml(fmtIssued(payload.generatedAt))}</div>
    </div>`;

  root.innerHTML = html;
  document.title = `Loan Comparison${payload.borrower?.name ? " — " + payload.borrower.name : ""}`;
}

document.getElementById("printBtn").addEventListener("click", () => window.print());

chrome.storage.local.get("zhlReportPayload", ({ zhlReportPayload }) => {
  if (!zhlReportPayload) {
    document.getElementById("root").textContent =
      "No data found. Open the Scenarios page, select scenarios, and click Detailed PDF.";
    return;
  }
  render(zhlReportPayload);
  setTimeout(() => window.print(), 600);
});
