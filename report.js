"use strict";

/* ─── utilities ─────────────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseDollar(s) {
  if (s == null) return NaN;
  const raw = String(s).trim();
  const negParen = /^\$?\(.+\)$/.test(raw);
  const cleaned = raw.replace(/[$,\s()]/g, "");
  const n = Number(cleaned);
  if (!isFinite(n)) return NaN;
  return negParen ? -n : n;
}

function fmtDollar(n) {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const out = "$" + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? "−" + out : out;
}

function fmtMonths(n) {
  if (!isFinite(n) || n <= 0) return "";
  const total = Math.round(n);
  const yr = Math.floor(total / 12);
  const mo = total % 12;
  if (yr === 0) return `${mo} mo`;
  if (mo === 0) return `${yr} yr`;
  return `${yr} yr ${mo} mo`;
}

function fmtIssued(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date} · ${time}`;
}

function getRow(scenario, key) {
  return scenario.rows?.values?.[key] || "";
}

function getPITI(scenario) {
  const v = getRow(scenario, "Monthly P&I / PITI");
  const parts = v.split("/").map((s) => s.trim());
  return parseDollar(parts[1] || parts[0]);
}

function getPI(scenario) {
  const v = getRow(scenario, "Monthly P&I / PITI");
  const parts = v.split("/").map((s) => s.trim());
  return parseDollar(parts[0]);
}

function getCash(scenario) {
  return parseDollar(getRow(scenario, "Cash (to) / from"));
}

function getRate(scenario) {
  return getRow(scenario, "Interest rate");
}

function programLabel(scenario) {
  const title = scenario.title || "Loan";
  const rate = getRate(scenario);
  return rate ? `${title} @ ${rate}` : title;
}

function getPayment(scenario, label) {
  const lines = scenario.paymentBreakdown?.lines || [];
  const ln = lines.find((l) => l.type === "kv" && l.label === label);
  return ln ? ln.value : "";
}

/* ─── icons ─────────────────────────────────────────────────────────────── */

const ICON_INFO = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

const ICON_WARN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

/* ─── grid helpers ──────────────────────────────────────────────────────── */

function gridTemplate(n) {
  // 38% label column then n equal columns. Two scenarios -> 38 / 31 / 31.
  const rest = ((100 - 38) / n).toFixed(4);
  return `38% ${("1fr ").repeat(n).trim()}`.replace(/1fr/g, `${rest}%`);
}

function colgroup(n) {
  const rest = ((100 - 38) / n).toFixed(4);
  let html = `<colgroup><col style="width:38%">`;
  for (let i = 0; i < n; i++) html += `<col style="width:${rest}%">`;
  return html + `</colgroup>`;
}

/* ─── decision card ─────────────────────────────────────────────────────── */

function buildOptionHeaders(scenarios, winners) {
  const tmpl = gridTemplate(scenarios.length);
  const compact = scenarios.length > 2;
  let row = `<div class="opt-headers" style="grid-template-columns:${tmpl}"><div></div>`;
  scenarios.forEach((s, i) => {
    const letter = String.fromCharCode(65 + i);
    const cls = letter === "A" ? "opt-A" : "opt-B";
    let pillHtml = "";
    if (winners) {
      if (winners.monthly === i && winners.cash === i) {
        pillHtml = `<span class="pill win">Best overall</span>`;
      } else if (winners.monthly === i) {
        pillHtml = `<span class="pill win">Lower payment</span>`;
      } else if (winners.cash === i) {
        pillHtml = `<span class="pill win">Less cash up front</span>`;
      } else {
        pillHtml = `<span class="pill ghost">—</span>`;
      }
    }
    const label = compact
      ? `Option ${letter} · ${escapeHtml(getRate(s) || "")}`
      : `Option ${letter} · ${escapeHtml(programLabel(s))}`;
    row += `<div class="opt-header ${cls}"><span class="swatch"></span><span class="opt-label">${label}</span>${pillHtml}</div>`;
  });
  return row + `</div>`;
}

function metricRow(label, sublabel, scenarios, valueFn, winnerIdx, deltaFn) {
  const tmpl = gridTemplate(scenarios.length);
  const sub = sublabel ? `<span class="lbl-sub">${escapeHtml(sublabel)}</span>` : "";
  let html = `<div class="metric-row" style="grid-template-columns:${tmpl}"><div class="lbl">${escapeHtml(label)}${sub}</div>`;
  scenarios.forEach((s, i) => {
    const cls = winnerIdx === i ? "metric win" : "metric";
    const letter = String.fromCharCode(65 + i);
    const val = valueFn(s);
    const delta = deltaFn ? deltaFn(s, i) : "";
    html += `<div class="${cls}"><div class="opt-name">Option ${letter}</div><div class="val">${escapeHtml(val)}</div>${delta ? `<div class="delta">${escapeHtml(delta)}</div>` : ""}</div>`;
  });
  return html + `</div>`;
}

function buildDecisionCard(scenarios) {
  if (scenarios.length < 2) return "";

  const piti = scenarios.map(getPITI);
  const cash = scenarios.map(getCash);

  const minPiti = Math.min(...piti);
  const minCash = Math.min(...cash);
  const winners = {
    monthly: scenarios.length === 2 ? piti.findIndex((v) => v === minPiti) : -1,
    cash: scenarios.length === 2 ? cash.findIndex((v) => v === minCash) : -1,
  };

  let breakEvenHtml = "";
  if (scenarios.length === 2 && winners.monthly !== -1 && winners.cash !== -1 && winners.monthly !== winners.cash) {
    const cashWinner = scenarios[winners.cash];
    const monthlyWinner = scenarios[winners.monthly];
    const cashDiff = getCash(monthlyWinner) - getCash(cashWinner);
    const monthlyDiff = getPITI(cashWinner) - getPITI(monthlyWinner);
    if (cashDiff > 0 && monthlyDiff > 0) {
      const months = cashDiff / monthlyDiff;
      const monthlyWinLetter = String.fromCharCode(65 + winners.monthly);
      breakEvenHtml = `<div class="break-even">${ICON_INFO}<div><strong>Break-even ≈ ${escapeHtml(fmtMonths(months))}.</strong> Option ${monthlyWinLetter} costs ${escapeHtml(fmtDollar(cashDiff))} more at closing but saves ${escapeHtml(fmtDollar(monthlyDiff))} per month. If you stay past ~${Math.round(months)} months, ${monthlyWinLetter} is cheaper overall.</div></div>`;
    }
  }

  const monthlyDelta = (s, i) => {
    if (winners.monthly === -1) return "";
    if (i === winners.monthly) {
      const other = piti.filter((_, j) => j !== i);
      const diff = Math.min(...other) - piti[i];
      return diff > 0 ? `↓ ${fmtDollar(diff)} / mo lower` : "";
    }
    const diff = piti[i] - piti[winners.monthly];
    return diff === 0 ? "— baseline" : `+${fmtDollar(diff)} / mo`;
  };

  const cashDelta = (s, i) => {
    if (winners.cash === -1) return "";
    if (i === winners.cash) {
      const other = cash.filter((_, j) => j !== i);
      const diff = Math.min(...other) - cash[i];
      return diff > 0 ? `↓ ${fmtDollar(diff)} less to bring` : "";
    }
    const diff = cash[i] - cash[winners.cash];
    return diff === 0 ? "— baseline" : `+ ${fmtDollar(diff)} more up front`;
  };

  const headersRow = scenarios.length === 2 ? buildOptionHeaders(scenarios, winners) : "";

  return `<div class="decision">
    ${headersRow}
    ${metricRow("Monthly payment", "PITI", scenarios, (s) => getRow(s, "Monthly P&I / PITI").split("/").map((x) => x.trim()).pop() || fmtDollar(getPITI(s)), winners.monthly, monthlyDelta)}
    ${metricRow("Cash to close", "", scenarios, (s) => getRow(s, "Cash (to) / from") || fmtDollar(getCash(s)), winners.cash, cashDelta)}
    ${breakEvenHtml}
  </div>`;
}

/* ─── header / footer ───────────────────────────────────────────────────── */

function buildDocHead(payload) {
  const b = payload.borrower || {};
  const o = payload.officer || {};
  const summary = payload.scenarios[0]?.summary || "";
  const subParts = [b.location, b.tag, summary].filter(Boolean);

  const meta = [];
  if (payload.generatedAt) meta.push(`<div class="meta-row"><span class="lbl">Issued</span><span class="val">${escapeHtml(fmtIssued(payload.generatedAt))}</span></div>`);
  if (o.name) meta.push(`<div class="meta-row"><span class="lbl">Loan officer</span><span class="val">${escapeHtml(o.name)}</span></div>`);
  if (o.nmls) meta.push(`<div class="meta-row"><span class="lbl">NMLS</span><span class="val">#${escapeHtml(o.nmls)}</span></div>`);

  return `<header class="doc-head">
    <div class="left">
      <div class="eyebrow">Loan comparison</div>
      <h1>${escapeHtml(b.name || "Loan comparison")}</h1>
      ${subParts.length ? `<div class="sub">${escapeHtml(subParts.join(" · "))}</div>` : ""}
    </div>
    <div class="right">${meta.join("")}</div>
  </header>`;
}

function buildDisclaimer() {
  return `<div class="disclaimer">${ICON_WARN}<span>Your actual rate, payment and costs could be higher. Get an official Loan Estimate before choosing a loan.</span></div>`;
}

function buildFooter(payload) {
  const o = payload.officer || {};
  const lo = [];
  if (o.name) lo.push(`<div class="name">${escapeHtml(o.name)} · Loan Officer</div>`);
  if (o.nmls) lo.push(`<div>NMLS #${escapeHtml(o.nmls)}</div>`);
  const contact = [];
  if (o.phone) contact.push(`<a href="tel:${escapeHtml(o.phone.replace(/[^+\d]/g, ""))}">${escapeHtml(o.phone)}</a>`);
  if (o.email) contact.push(`<a href="mailto:${escapeHtml(o.email)}">${escapeHtml(o.email)}</a>`);
  if (contact.length) lo.push(`<div>${contact.join(" · ")}</div>`);

  return `<footer class="doc-foot">
    <div class="lo">${lo.join("")}</div>
    <div class="legal">Mortgage interest rates can change daily. This document is illustrative and not a commitment to lend. An official Loan Estimate will be provided.<br/>Zillow Home Loans, LLC NMLS #10287 · Equal Housing Lender.</div>
  </footer>`;
}

/* ─── loan terms ────────────────────────────────────────────────────────── */

const TERM_FIELDS = [
  { label: "Purpose", key: "Loan purpose" },
  { label: "Purchase price", key: "Purchase price" },
  { label: "Down payment", key: "Down payment" },
  { label: "Loan amount", key: "Total loan amount" },
  { label: "LTV", key: "LTV" },
  { label: "Lock period", key: "Lock period" },
  { label: "Credit score", key: "Credit score" },
  { label: "Program", get: (s) => s.title || "" },
];

function valuesIdentical(scenarios, getter) {
  const vals = scenarios.map(getter);
  return vals.every((v) => v === vals[0]);
}

function buildLoanTerms(scenarios) {
  const get = (f) => (s) => f.get ? f.get(s) : getRow(s, f.key);
  const allIdentical = TERM_FIELDS.every((f) => valuesIdentical(scenarios, get(f)));

  const cells = TERM_FIELDS.map((f) => {
    const getter = get(f);
    const same = valuesIdentical(scenarios, getter);
    let valueHtml;
    if (same) {
      valueHtml = escapeHtml(getter(scenarios[0]) || "—");
    } else {
      valueHtml = scenarios
        .map((s, i) => {
          const letter = String.fromCharCode(65 + i);
          return `<div class="v-row"><span class="v-tag">${letter}</span>${escapeHtml(getter(s) || "—")}</div>`;
        })
        .join("");
    }
    return `<div class="term"><span class="k">${escapeHtml(f.label)}</span><span class="v">${valueHtml}</span></div>`;
  }).join("");

  const hint = scenarios.length === 1
    ? ""
    : allIdentical
      ? "Identical across all options"
      : "Some values differ between options";

  return `<section class="section">
    <div class="head"><h2>Loan terms</h2>${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}</div>
    <div class="terms-grid">${cells}</div>
  </section>`;
}

/* ─── comparison table shells ───────────────────────────────────────────── */

function buildCmpHeaders(scenarios) {
  const tmpl = gridTemplate(scenarios.length);
  let row = `<div class="cmp-headers" style="grid-template-columns:${tmpl}"><div></div>`;
  scenarios.forEach((_, i) => {
    const letter = String.fromCharCode(65 + i);
    const cls = letter === "A" ? "opt-A" : "opt-B";
    row += `<div class="opt-header ${cls}" style="justify-content:flex-end;"><span class="swatch"></span><span>Option ${letter}</span></div>`;
  });
  return row + `</div>`;
}

function buildCmpSection(title, hint, scenarios, rows, footRows = []) {
  const cg = colgroup(scenarios.length);
  const body = rows
    .map((r) => {
      const trCls = r.bold ? ' class="bold"' : "";
      const cells = scenarios.map((s) => `<td>${escapeHtml(r.get(s) || "—")}</td>`).join("");
      return `<tr${trCls}><th>${escapeHtml(r.label)}</th>${cells}</tr>`;
    })
    .join("");
  const foot = footRows
    .map((r) => {
      const cells = scenarios.map((s) => `<td>${escapeHtml(r.get(s) || "—")}</td>`).join("");
      return `<tr class="${r.cls || ""}"><th>${escapeHtml(r.label)}</th>${cells}</tr>`;
    })
    .join("");
  return `<section class="section">
    <div class="head"><h2>${escapeHtml(title)}</h2>${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}</div>
    ${buildCmpHeaders(scenarios)}
    <table class="cmp">${cg}<tbody>${body}${foot}</tbody></table>
  </section>`;
}

/* ─── rate & payment / monthly breakdown / borrower ─────────────────────── */

function buildRateAndPayment(scenarios) {
  const rows = [
    { label: "Interest rate", get: (s) => getRow(s, "Interest rate") },
    { label: "APR", get: (s) => getRow(s, "APR") },
    { label: "Discount points", get: (s) => getRow(s, "Points / Price") },
    { label: "Monthly P&I", get: (s) => fmtDollar(getPI(s)) },
    { label: "Total monthly (PITI)", get: (s) => fmtDollar(getPITI(s)), bold: true },
  ];
  return buildCmpSection("Rate & payment", scenarios.length > 1 ? "The reason these options differ" : "", scenarios, rows);
}

function buildMonthlyBreakdown(scenarios) {
  const rows = [
    { label: "Principal & interest", get: (s) => getPayment(s, "First mortgage (P&I)") },
    { label: "Homeowner's insurance", get: (s) => getPayment(s, "Homeowner's insurance") },
    { label: "Property taxes", get: (s) => getPayment(s, "Property taxes") },
    { label: "Mortgage insurance", get: (s) => getPayment(s, "Mortgage insurance") },
    { label: "HOA / Other", get: (s) => {
        const hoa = parseDollar(getPayment(s, "HOA"));
        const other = parseDollar(getPayment(s, "Other"));
        const sum = (isFinite(hoa) ? hoa : 0) + (isFinite(other) ? other : 0);
        return fmtDollar(sum);
      } },
    { label: "Total monthly", get: (s) => getPayment(s, "Total monthly payment") || fmtDollar(getPITI(s)), bold: true },
  ];
  return buildCmpSection("Monthly payment breakdown", scenarios.length > 1 ? "Most components are identical" : "", scenarios, rows);
}

function buildBorrowerProfile(scenarios) {
  const rows = [
    { label: "DTI (front / back)", get: (s) => getRow(s, "DTI") },
    { label: "Credit score", get: (s) => getRow(s, "Credit score") },
  ];
  return buildCmpSection("Borrower profile", scenarios.length > 1 ? "DTI varies slightly by payment" : "", scenarios, rows);
}

/* ─── closing costs ─────────────────────────────────────────────────────── */

const COST_GROUP_MAP = {
  "Lender costs": "Lender costs",
  "Fees you cannot shop for": "Third-party & required",
  "Third-party costs": "Third-party & required",
  "Prepaids": "Prepaids & escrow",
  "Initial escrow payment at closing": "Prepaids & escrow",
  "Taxes and other government fees": "Taxes & other",
  "Other": "Taxes & other",
  "Credits": "Credits",
};

const COST_GROUP_ORDER = [
  "Lender costs",
  "Third-party & required",
  "Prepaids & escrow",
  "Taxes & other",
  "Credits",
];

function normalizeCostLabel(label, currentSubgroup) {
  if (/^\d+(\.\d+)?% of Loan Amount$/i.test(label)) return "Discount points";
  const stripped = label.replace(/\*$/, "");
  const m = stripped.match(/^Pre-paid interest \(\$[\d.]+ per day for (\d+) days?\)/);
  if (m) return `Pre-paid interest (${m[1]} day${m[1] === "1" ? "" : "s"})`;
  if (stripped === "Settlement fee") return "Settlement";
  if (stripped === "Deed") return "Government recording fee — deed";
  if (stripped === "Mortgage / deed of trust") return "Government recording fee — mortgage";
  return stripped;
}

function getScenarioCostGroups(scenario) {
  const lines = scenario.closingCosts?.lines || [];
  const groups = {}; // groupName -> Map(label -> value)
  let currentSub = null;

  for (const ln of lines) {
    if (ln.type === "header") {
      currentSub = ln.text;
      continue;
    }
    if (ln.type !== "kv") continue;

    if (currentSub === "Initial escrow payment at closing") {
      if (ln.kind === "subtotal") {
        const gName = COST_GROUP_MAP[currentSub];
        if (!gName) continue;
        const g = (groups[gName] = groups[gName] || new Map());
        g.set("Initial escrow", ln.value);
      }
      continue;
    }
    if (ln.kind !== "item") continue;

    const gName = COST_GROUP_MAP[currentSub];
    if (!gName) continue;
    const g = (groups[gName] = groups[gName] || new Map());
    const label = normalizeCostLabel(ln.label, currentSub);
    if (!g.has(label)) g.set(label, ln.value);
  }
  return groups;
}

function buildClosingCosts(scenarios) {
  const cg = colgroup(scenarios.length);
  const allGroups = scenarios.map(getScenarioCostGroups);

  let body = "";
  for (const groupName of COST_GROUP_ORDER) {
    const labels = [];
    const seen = new Set();
    for (const sg of allGroups) {
      const g = sg[groupName];
      if (!g) continue;
      for (const lbl of g.keys()) {
        if (!seen.has(lbl)) {
          labels.push(lbl);
          seen.add(lbl);
        }
      }
    }
    if (labels.length === 0) continue;
    body += `<tr class="subhead"><th>${escapeHtml(groupName)}</th>${"<td></td>".repeat(scenarios.length)}</tr>`;
    for (const lbl of labels) {
      const cells = allGroups
        .map((sg) => `<td>${escapeHtml(sg[groupName]?.get(lbl) || "—")}</td>`)
        .join("");
      body += `<tr><th>${escapeHtml(lbl)}</th>${cells}</tr>`;
    }
  }

  body += `<tr class="total-cc"><th>Total closing costs</th>${scenarios
    .map((s) => `<td>${escapeHtml(getRow(s, "Total closing costs") || "—")}</td>`)
    .join("")}</tr>`;
  body += `<tr class="total-cash"><th>Cash to close</th>${scenarios
    .map((s) => `<td>${escapeHtml(getRow(s, "Cash (to) / from") || "—")}</td>`)
    .join("")}</tr>`;

  return `<section class="section">
    <div class="head"><h2>Closing costs</h2>${scenarios.length > 1 ? `<div class="hint">Where the up-front difference comes from</div>` : ""}</div>
    ${buildCmpHeaders(scenarios)}
    <table class="cmp">${cg}<tbody>${body}</tbody></table>
  </section>`;
}

/* ─── render ────────────────────────────────────────────────────────────── */

function render(payload) {
  const root = document.getElementById("root");
  const scenarios = payload.scenarios || [];

  root.innerHTML = `<main class="doc">
    ${buildDocHead(payload)}
    ${buildDecisionCard(scenarios)}
    ${buildDisclaimer()}
    ${buildLoanTerms(scenarios)}
    ${buildRateAndPayment(scenarios)}
    ${buildMonthlyBreakdown(scenarios)}
    ${buildClosingCosts(scenarios)}
    ${buildBorrowerProfile(scenarios)}
    ${buildFooter(payload)}
  </main>`;

  document.title = `Loan Comparison${payload.borrower?.name ? " — " + payload.borrower.name : ""}`;
}

document.getElementById("printBtn").addEventListener("click", () => window.print());

function loadPayload() {
  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.get("zhlReportPayload", ({ zhlReportPayload }) =>
        resolve(zhlReportPayload || null)
      );
      return;
    }
    chrome.runtime.sendMessage({ type: "getReportPayload" }, (payload) =>
      resolve(payload || null)
    );
  });
}

loadPayload().then((payload) => {
  if (!payload) {
    document.getElementById("root").textContent =
      "No data found. Open the Scenarios page, select scenarios, and click Detailed PDF.";
    return;
  }
  render(payload);
});
