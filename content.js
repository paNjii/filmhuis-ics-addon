/* Filmhuis Den Haag → Calendar – content.js
 *
 * Injected by the browser on any filmhuisdenhaag.nl page.
 * Exits silently if this is not an order history page.
 */
// noinspection SpellCheckingInspection

(function () {
"use strict";

// Support both the English and Dutch page title so the extension works
// regardless of the site's language setting.
const bodyText = document.body.innerText;
if (!bodyText.includes("Order history") && !bodyText.includes("Bestelgeschiedenis")) {
  return;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCATION = "Filmhuis Den Haag\\, Spui 191\\, 2511 BN Den Haag\\, Netherlands";
const TZID     = "Europe/Amsterdam";
const DURATION = 120; // assumed screening length in minutes

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pad2(n) { return String(n).padStart(2, "0"); }

// Format a local Date as an iCalendar datetime string (no Z suffix — the
// TZID parameter on DTSTART/DTEND carries the timezone context).
function fmtDt(d) {
  return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}` +
         `T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
}

// DTSTAMP must always be in UTC (RFC 5545 §3.7.4).
function dtstamp() {
  const n = new Date();
  return `${n.getUTCFullYear()}${pad2(n.getUTCMonth()+1)}${pad2(n.getUTCDate())}` +
         `T${pad2(n.getUTCHours())}${pad2(n.getUTCMinutes())}${pad2(n.getUTCSeconds())}Z`;
}

// Stable UID derived from title + date so re-importing the same event does
// not create a duplicate in the calendar.
function buildUID(title, start) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "") +
         "-" + fmtDt(start).substring(0, 8) + "@filmhuis-ics";
}

// Escape iCalendar text characters that would break the SUMMARY value.
function escSummary(s) { return s.replace(/,/g, "\\,").replace(/;/g, "\\;"); }

// ---------------------------------------------------------------------------
// ICS generation
// ---------------------------------------------------------------------------

function buildICS(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//filmhuis-ics//OrderHistory//EN",
    "X-WR-CALNAME:Filmhuis Den Haag",
    // VTIMEZONE block for Europe/Amsterdam.
    // RRULE makes the DST transitions recur correctly for every year, so
    // events are never off by an hour regardless of when they take place.
    // DTSTART anchors are the first occurrences of each rule after 1970:
    //   CET  (UTC+1): last Sunday of October  → 1970-10-25 03:00
    //   CEST (UTC+2): last Sunday of March    → 1970-03-29 02:00
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Amsterdam",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ];
  for (const ev of events) {
    const end = new Date(ev.start.getTime() + DURATION * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${buildUID(ev.title, ev.start)}`,
      `DTSTAMP:${dtstamp()}`,
      `DTSTART;TZID=${TZID}:${fmtDt(ev.start)}`,
      `DTEND;TZID=${TZID}:${fmtDt(end)}`,
      `SUMMARY:${escSummary(ev.title)}`,
      `LOCATION:${LOCATION}`,
      `DESCRIPTION:${ev.zaal}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function downloadICS(filename, icsContent) {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ---------------------------------------------------------------------------
// DOM parsing
// ---------------------------------------------------------------------------

// Extract a calendar event from a single order-history table row.
// Returns null if the row lacks the expected structure.
function parseRow(tr) {
  const titleEl      = tr.querySelector("td.at-order-title .at-table-value");
  const title        = (titleEl ? titleEl.innerText.trim() : null) || "Film";

  // The table has two date cells: [0] order date, [1] screening date.
  // Fall back to the first cell when only one is present.
  const dateCells    = tr.querySelectorAll("td.at-order-date");
  const showDateCell = dateCells.length >= 2 ? dateCells[1] : dateCells[0];
  if (!showDateCell) return null;

  const dateSpan = showDateCell.querySelector(".at-date");
  const timeSpan = showDateCell.querySelector(".at-time");
  if (!dateSpan || !timeSpan) return null;

  // Date format on the page is dd/mm/yyyy.
  const [dd, mm, yyyy] = dateSpan.innerText.trim().split("/").map(Number);
  const [hh, min]      = timeSpan.innerText.trim().split(":").map(Number);
  // Construct using local-time components so the Date reflects Amsterdam wall
  // time (the data originates from the Amsterdam venue and is always local).
  const start = new Date(yyyy, mm - 1, dd, hh, min);

  const zaalEl = tr.querySelector("td.at-order-location .at-table-value");
  const zaal   = (zaalEl ? zaalEl.innerText.trim() : null) || "Zaal ?";
  return { title, start, zaal };
}

// ---------------------------------------------------------------------------
// UI injection
// ---------------------------------------------------------------------------

function makeBtn(label, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.className   = "fhics-btn";
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

// Walk all order rows, skip already-processed ones, and append a Calendar
// button to each. Caches event data in data-* attributes so collectAllEvents()
// can gather them later without re-parsing the DOM.
function injectButtons() {
  const allRows = document.querySelectorAll("#OrderHistory tr.at-order");
  let injectedCount = 0;
  for (const tr of allRows) {
    if (tr.dataset.fhicsInjected) continue;
    const ev = parseRow(tr);
    if (!ev) continue;

    tr.dataset.fhicsInjected = "1";
    tr.dataset.fhicsTitle    = ev.title;
    tr.dataset.fhicsStart    = ev.start.toISOString();
    tr.dataset.fhicsZaal     = ev.zaal;

    const td = document.createElement("td");
    td.className = "fhics-cell";
    td.appendChild(makeBtn("📅 Calendar", () => {
      const ics  = buildICS([ev]);
      const safe = ev.title.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
      downloadICS(`${safe}.ics`, ics);
    }));
    tr.appendChild(td);

    // Add the "Calendar" column header once per table.
    const thead = tr.closest("table")?.querySelector("thead tr");
    if (thead && !thead.dataset.fhicsHeaderInjected) {
      thead.dataset.fhicsHeaderInjected = "1";
      const th = document.createElement("th");
      th.textContent = "Calendar";
      th.className   = "fhics-cell";
      thead.appendChild(th);
    }
    injectedCount++;
  }
  if (injectedCount > 0) ensureImportAllBar();
}

// Collect all events cached in data-* attributes by injectButtons().
function collectAllEvents() {
  return [...document.querySelectorAll("#OrderHistory tr[data-fhics-injected]")].map(tr => ({
    title: tr.dataset.fhicsTitle,
    start: new Date(tr.dataset.fhicsStart),
    zaal:  tr.dataset.fhicsZaal,
  }));
}

// Insert the "Import all" toolbar above the order history table (once only).
function ensureImportAllBar() {
  if (document.getElementById("fhics-import-all-bar")) return;
  const bar = document.createElement("div");
  bar.id = "fhics-import-all-bar";
  const label = document.createElement("span");
  label.textContent = "Filmhuis → Calendar";
  const btn = makeBtn("⬇ Import all as .ics", () => {
    const events = collectAllEvents();
    if (!events.length) { alert("No events found on this page."); return; }
    downloadICS("filmhuis_all.ics", buildICS(events));
  });
  bar.appendChild(label);
  bar.appendChild(btn);
  const anchor = document.querySelector("#OrderHistory") ||
                 document.querySelector("h2") ||
                 document.body;
  anchor.parentNode.insertBefore(bar, anchor);
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

// Observe the order history container for dynamically loaded rows (the site
// renders order rows lazily when the user switches year tabs).
const observer = new MutationObserver(() => injectButtons());
observer.observe(document.getElementById("OrderHistory") || document.body, {
  childList: true,
  subtree:   true,
});
injectButtons();
}());
