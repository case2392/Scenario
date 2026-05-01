# Zillow Scenarios — Detailed PDF (Chrome extension)

Adds a **Detailed PDF** button next to the existing **Generate PDF** on the
Pricing & Scenarios page. The detailed PDF includes a full closing-cost
breakdown (the same data shown in the "Detailed cost summary" modal), so the
buyer sees exactly where their closing costs come from.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this folder.
4. Right-click the extension's icon → **Options** to fill in your loan officer
   footer info (name, NMLS ID, phone, email). This appears in the
   "Questions?" footer of every PDF.

## Usage

1. Open the Scenarios page (`.../pricing-and-scenarios/scenarios`).
2. Tick the checkbox on each scenario you want to compare.
3. Click **Detailed PDF** at the bottom-right of the page.
4. The extension opens each selected scenario's "Detailed cost summary" and
   "Payment breakdown" modals briefly, scrapes them, then opens a printable
   report tab and triggers the print dialog. Choose **Save as PDF**.

## What's in the PDF

- Brand header with borrower name and location
- Side-by-side comparison table for all selected scenarios:
  - Loan terms (loan purpose, purchase price, down payment, total loan, LTV)
  - Rate & payment (interest rate, APR, points/price, lock period, P&I/PITI)
  - Costs & cash (seller credit, total closing costs, cash to/from)
  - Borrower (DTI, credit score)
  - Estimated monthly payment (P&I, taxes, insurance, MI, HOA, other, total)
- Detailed closing-cost breakdown side-by-side per scenario, with
  Loan costs (Lender / Fees you cannot shop for / Third-party), Other costs
  (Taxes, Prepaids, Initial escrow, Other), Credits, and the grand
  Total closing costs highlighted at the bottom.
- Loan officer "Questions?" footer pulled from the options page.
- Standard Zillow Home Loans legal footer.

## Files

- `manifest.json` — MV3 manifest
- `content.js` / `content.css` — injects the button, scrapes selected
  scenarios + modals, hands data to the report tab via `chrome.storage.local`
- `report.html` / `report.js` / `report.css` — printable report
- `options.html` / `options.js` — loan-officer info form

## Notes / known limitations

- Scraping uses structural DOM patterns rather than the randomized
  `c11n-...` class names, so it should survive minor styling changes. If
  Zillow restructures the cards or modals, the selectors in `content.js`
  (`scrapeCardRows`, `walkLines`, `findRowButton`) may need updating.
- The extension briefly opens the cost / payment modals to scrape them; an
  overlay hides them while this happens, so the user only sees a "Collecting
  scenario X of N" status.
- Loan officer footer info is stored in `chrome.storage.sync` per-user. If
  you'd rather pull it from the page (e.g. from an `/api/me` response), open
  an issue and share the network call.
