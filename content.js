/* Filmhuis Den Haag → Calendar – content.js */
"use strict";

const bodyText = document.body.innerText;
if (!bodyText.includes("Order history") && !bodyText.includes("Bestelgeschiedenis")) {
  // Not an order history page — nothing to do.
  return;
}

const LOCATION = "Filmhuis Den Haag\\, Spui 191\\, 2511 BN Den Haag\\, Netherlands";
const TZID     = "Europe/Amsterdam";
const DURATION = 120;

function pad2(n) { return String(n).padStart(2, "0"); }

function fmtDt(d) {
  return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}` +
         `T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
}

function dtstamp() {
  const n = new Date();
  return `${n.getUTCFullYear()}${pad2(n.getUTCMonth()+1)}${pad2(n.getUTCDate())}` +
         `T${pad2(n.getUTCHours())}${pad2(n.getUTCMinutes())}${pad2(n.getUTCSeconds())}Z`;
}

function buildUID(title, start) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "") +
         "-" + fmtDt(start).substring(0, 8) + "@filmhuis-ics";
}

function escSummary(s) { return s.replace(/,/g, "\\,").replace(/;/g, "\\;"); }

function buildICS(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//filmhuis-ics//OrderHistory//EN",
    "X-WR-CALNAME:Filmhuis Den Haag",
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

function downloadICS(filename, icsContent) {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function parseRow(tr) {
  const titleEl      = tr.querySelector("td.at-order-title .at-table-value");
  const title        = (titleEl ? titleEl.innerText.trim() : null) || "Film";
  const dateCells    = tr.querySelectorAll("td.at-order-date");
  const showDateCell = dateCells.length >= 2 ? dateCells[1] : dateCells[0];
  if (!showDateCell) return null;
  const dateSpan = showDateCell.querySelector(".at-date");
  const timeSpan = showDateCell.querySelector(".at-time");
  if (!dateSpan || !timeSpan) return null;
  const [dd, mm, yyyy] = dateSpan.innerText.trim().split("/").map(Number);
  const [hh, min]      = timeSpan.innerText.trim().split(":").map(Number);
  const start = new Date(yyyy, mm - 1, dd, hh, min);
  const zaalEl = tr.querySelector("td.at-order-location .at-table-value");
  const zaal   = (zaalEl ? zaalEl.innerText.trim() : null) || "Zaal ?";
  return { title, start, zaal };
}

function makeBtn(label, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.className   = "fhics-btn";
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

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

function collectAllEvents() {
  return [...document.querySelectorAll("#OrderHistory tr[data-fhics-injected]")].map(tr => ({
    title: tr.dataset.fhicsTitle,
    start: new Date(tr.dataset.fhicsStart),
    zaal:  tr.dataset.fhicsZaal,
  }));
}

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

const observer = new MutationObserver(() => injectButtons());
observer.observe(document.getElementById("OrderHistory") || document.body, {
  childList: true,
  subtree:   true,
});
injectButtons();
