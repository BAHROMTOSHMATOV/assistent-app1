"use strict";
/*
 * Mein Assistent – Aufgaben, Termine und Projekte.
 * Alle Daten bleiben lokal auf dem Gerät (localStorage).
 */

// ---------- Speicher ----------
const KEY = "assistent-data-v1";
const DEFAULT_STATE = {
  items: [],
  projects: [],
  settings: { name: "", defaultRemind: 15, briefingTime: "08:00", lastBriefing: "" },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        items: data.items || [],
        projects: data.projects || [],
        settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
      };
    }
  } catch (e) {
    console.warn("Daten konnten nicht geladen werden", e);
  }
  return structuredClone(DEFAULT_STATE);
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    toast("⚠️ Speichern fehlgeschlagen: " + e.message);
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Datum & Zeit ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const tomorrow = () => ymd(addDays(new Date(), 1));
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dueDate = (it) => (it.date ? new Date(`${it.date}T${it.time || "23:59"}`) : null);

function fmtDate(s) {
  if (!s) return "";
  if (s === today()) return "Heute";
  if (s === tomorrow()) return "Morgen";
  if (s === ymd(addDays(new Date(), -1))) return "Gestern";
  return parseYmd(s).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function fmtRelative(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "jetzt";
  if (min < 60) return `in ${min} Min.`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return `in ${h} Std.${m ? ` ${m} Min.` : ""}`;
  const d = Math.round(h / 24);
  return `in ${d} ${d === 1 ? "Tag" : "Tagen"}`;
}

function remindLabel(min) {
  if (min === null || min === undefined) return "";
  if (min === 0) return "zur Uhrzeit";
  if (min >= 1440) return `${min / 1440} Tag vorher`;
  if (min >= 60) return `${min / 60} Std. vorher`;
  return `${min} Min. vorher`;
}

const isLate = (it) => !it.done && it.date && dueDate(it) < new Date() && (it.time || it.date < today());

// ---------- Schnelleingabe (deutsche Sprache verstehen) ----------
const WEEKDAYS = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
const TERMIN_WORDS = /(gespräch|termin|meeting|call|treffen|besprechung|arzt|interview|telefonat|anruf|sitzung)/i;

function parseQuick(text) {
  let s = ` ${text} `;
  const r = { title: "", date: null, time: null, priority: 2, projectName: null, type: "task" };

  s = s.replace(/\s#([\p{L}\p{N}_-]+)/u, (_, p) => { r.projectName = p; return " "; });
  s = s.replace(/\s!(hoch|wichtig|dringend|!|3)(?=\s)/i, () => { r.priority = 3; return " "; });
  s = s.replace(/\s!(niedrig|egal|1)(?=\s)/i, () => { r.priority = 1; return " "; });

  // Uhrzeit: "um 14 Uhr", "14:30 Uhr", "um 9.15 Uhr", "14:30"
  const setTime = (h, m) => {
    h = Number(h); m = Number(m || 0);
    if (h > 23 || m > 59) return false;
    r.time = `${pad(h)}:${pad(m)}`;
    return true;
  };
  s = s.replace(/\s(?:um\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*uhr(?=\s)/i, (all, h, m) => (setTime(h, m) ? " " : all));
  if (!r.time) s = s.replace(/\s(?:um\s+)?(\d{1,2}):(\d{2})(?=\s)/, (all, h, m) => (setTime(h, m) ? " " : all));

  // Datum
  const now = new Date();
  s = s.replace(/\s(?:am\s+|ab\s+)?(heute|übermorgen|uebermorgen|morgen)(?=\s)/i, (_, w) => {
    w = w.toLowerCase();
    r.date = w === "heute" ? today() : w === "morgen" ? tomorrow() : ymd(addDays(now, 2));
    return " ";
  });
  if (!r.date) {
    const re = new RegExp(`\\s(?:am\\s+|nächsten\\s+|naechsten\\s+|kommenden\\s+)?(${WEEKDAYS.join("|")})(?=\\s)`, "i");
    s = s.replace(re, (_, w) => {
      const target = WEEKDAYS.indexOf(w.toLowerCase());
      let diff = (target - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      r.date = ymd(addDays(now, diff));
      return " ";
    });
  }
  if (!r.date) {
    s = s.replace(/\s(?:am\s+|bis\s+)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/, (all, d, m, y) => {
      d = Number(d); m = Number(m);
      if (d < 1 || d > 31 || m < 1 || m > 12) return all;
      let year = y ? Number(y.length === 2 ? "20" + y : y) : now.getFullYear();
      let date = new Date(year, m - 1, d);
      if (!y && ymd(date) < today()) date = new Date(year + 1, m - 1, d);
      r.date = ymd(date);
      return " ";
    });
  }
  if (r.time && !r.date) {
    // Nur Uhrzeit: heute, oder morgen falls schon vorbei
    r.date = new Date(`${today()}T${r.time}`) > now ? today() : tomorrow();
  }

  r.title = s.replace(/\s+/g, " ").replace(/\s(um|am|bis)$/i, "").trim();
  if (TERMIN_WORDS.test(r.title)) r.type = "termin";
  return r;
}

function describeParsed(p) {
  const parts = [];
  if (p.type === "termin") parts.push("🗓️ Termin");
  if (p.date) parts.push(`📅 ${fmtDate(p.date)}${p.time ? ", " + p.time : ""}`);
  if (p.projectName) parts.push(`📁 ${p.projectName}`);
  if (p.priority === 3) parts.push("⚡ Hoch");
  if (p.priority === 1) parts.push("Niedrig");
  if (p.time && state.settings.defaultRemind !== null) parts.push(`🔔 ${remindLabel(state.settings.defaultRemind)}`);
  return parts.join(" · ");
}

function findOrCreateProject(name) {
  if (!name) return null;
  let p = state.projects.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!p) {
    p = { id: uid(), name, goal: "", deadline: "", color: randomColor(), createdAt: Date.now() };
    state.projects.push(p);
  }
  return p.id;
}

const COLORS = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#dc2626", "#0d9488"];
const randomColor = () => COLORS[state.projects.length % COLORS.length];

// ---------- Hilfen für Ansichten ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const projectOf = (it) => state.projects.find((p) => p.id === it.projectId);
const open = () => state.items.filter((i) => !i.done);

function sortItems(list) {
  return list.slice().sort((a, b) => {
    const da = a.date || "9999", db = b.date || "9999";
    if (da !== db) return da < db ? -1 : 1;
    const ta = a.time || "99", tb = b.time || "99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return b.priority - a.priority;
  });
}

function itemHtml(it, { showDate = true } = {}) {
  const p = projectOf(it);
  const meta = [];
  if (it.type === "termin") meta.push(`<span class="tag termin">Termin</span>`);
  if (isLate(it)) meta.push(`<span class="tag late">überfällig</span>`);
  if (it.date && (showDate || it.time)) meta.push(`<span>${showDate ? fmtDate(it.date) : ""}${it.time ? (showDate ? ", " : "") + it.time : ""}</span>`);
  if (it.priority === 3) meta.push(`<span class="tag prio">⚡ wichtig</span>`);
  if (p) meta.push(`<span class="tag proj" style="background:${esc(p.color)}">${esc(p.name)}</span>`);
  if (it.remind !== null && it.remind !== undefined && it.time && !it.done) meta.push(`<span>🔔 ${remindLabel(it.remind)}</span>`);
  const cl = it.checklist || [];
  if (cl.length) meta.push(`<span>☑️ ${cl.filter((c) => c.done).length}/${cl.length}</span>`);

  const checklist = cl.length && !it.done
    ? `<ul class="checklist">${cl.map((c, i) => `<li class="${c.done ? "ok" : ""}"><input type="checkbox" data-action="check-sub" data-id="${it.id}" data-i="${i}" ${c.done ? "checked" : ""}>${esc(c.text)}</li>`).join("")}</ul>`
    : "";

  return `<div class="item ${it.done ? "done" : ""}" data-action="edit" data-id="${it.id}">
    <button class="check" data-action="toggle" data-id="${it.id}" title="Erledigt">${it.done ? "✓" : ""}</button>
    <div class="body"><div class="t">${esc(it.title)}</div><div class="meta">${meta.join("")}</div>${checklist}</div>
  </div>`;
}

const listHtml = (items, opts, emptyText = "Nichts hier.") =>
  items.length ? `<div class="list">${items.map((i) => itemHtml(i, opts)).join("")}</div>` : `<div class="empty">${emptyText}</div>`;

// ---------- Projekt-Analyse: wo braucht ein Projekt Hilfe? ----------
function projectStats(p) {
  const items = state.items.filter((i) => i.projectId === p.id);
  const openItems = sortItems(items.filter((i) => !i.done));
  const done = items.length - openItems.length;
  const hints = [];
  const late = openItems.filter(isLate).length;
  if (late) hints.push(`${late} überfällig`);
  if (!openItems.length) hints.push("Kein nächster Schritt geplant");
  else if (!openItems.some((i) => i.date)) hints.push("Keine Aufgabe hat ein Datum");
  if (p.deadline) {
    const days = Math.round((parseYmd(p.deadline) - parseYmd(today())) / 86400000);
    if (days < 0) hints.push(`Deadline seit ${-days} Tagen vorbei`);
    else if (days <= 7 && openItems.length) hints.push(`Deadline in ${days} Tagen, noch ${openItems.length} offen`);
  }
  return { items, openItems, done, progress: items.length ? Math.round((done / items.length) * 100) : 0, next: openItems[0], hints };
}

// ---------- Tagesbriefing ----------
function briefing() {
  const now = new Date();
  const h = now.getHours();
  const name = state.settings.name ? `, ${state.settings.name}` : "";
  const greet = (h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend") + name + "!";

  const todays = sortItems(open().filter((i) => i.date === today()));
  const termine = todays.filter((i) => i.type === "termin");
  const tasks = todays.filter((i) => i.type !== "termin");
  const late = open().filter((i) => isLate(i) && i.date !== today());
  const nextTermin = sortItems(open().filter((i) => i.type === "termin" && i.time && dueDate(i) > now))[0];

  const lines = [];
  if (!todays.length && !late.length) lines.push("Für heute steht nichts an. 🎉");
  else lines.push(`Heute: ${termine.length} ${termine.length === 1 ? "Termin" : "Termine"} und ${tasks.length} ${tasks.length === 1 ? "Aufgabe" : "Aufgaben"}.`);

  if (nextTermin) {
    const when = nextTermin.date === today() ? `Um ${nextTermin.time}` : `${fmtDate(nextTermin.date)} um ${nextTermin.time}`;
    lines.push(`${when} hast du: <b>${esc(nextTermin.title)}</b> (${fmtRelative(dueDate(nextTermin) - now)}).`);
  }
  if (late.length) lines.push(`⚠️ ${late.length} ${late.length === 1 ? "Aufgabe ist" : "Aufgaben sind"} überfällig.`);

  const tips = [];
  // Vorbereitung für Termine heute/morgen
  open()
    .filter((i) => i.type === "termin" && (i.date === today() || i.date === tomorrow()))
    .forEach((i) => {
      const cl = i.checklist || [];
      const left = cl.filter((c) => !c.done).length;
      if (left) tips.push(`Vorbereitung für „${esc(i.title)}“: noch ${left} von ${cl.length} Punkten offen.`);
      else if (!cl.length) tips.push(`„${esc(i.title)}“ (${fmtDate(i.date)}) – willst du eine Vorbereitungs-Checkliste anlegen?`);
    });
  const important = tasks.filter((i) => i.priority === 3);
  if (important.length) tips.push(`Fang mit dem Wichtigsten an: „${esc(important[0].title)}“.`);
  state.projects.forEach((p) => {
    const st = projectStats(p);
    if (st.hints.length) tips.push(`Projekt <b>${esc(p.name)}</b>: ${st.hints.join(", ")}.`);
  });
  const tm = open().filter((i) => i.date === tomorrow());
  if (tm.length) tips.push(`Morgen: ${tm.length} ${tm.length === 1 ? "Eintrag" : "Einträge"}${tm[0].time ? `, der erste um ${sortItems(tm)[0].time || "–"}` : ""}.`);

  return { greet, lines, tips };
}

function briefingText() {
  const b = briefing();
  const strip = (s) => s.replace(/<[^>]+>/g, "");
  return [b.greet, ...b.lines.map(strip), ...b.tips.slice(0, 4).map(strip)].join(" ");
}

// ---------- Ansichten ----------
let currentView = "heute";
let currentProject = null;
let planFilter = "";

function render() {
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
  const view = $("#view");
  view.innerHTML = VIEWS[currentView]();
}

const VIEWS = {
  heute() {
    const b = briefing();
    const late = sortItems(open().filter((i) => isLate(i) && i.date !== today()));
    const todays = sortItems(state.items.filter((i) => i.date === today() && (!i.done || i.doneAt > Date.now() - 6 * 3600e3)));
    const dateStr = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    return `
      <h1>${dateStr}</h1>
      <div class="card briefing">
        <p class="big">${esc(b.greet)}</p>
        ${b.lines.map((l) => `<p>${l}</p>`).join("")}
        ${b.tips.length ? `<ul>${b.tips.slice(0, 6).map((t) => `<li>${t}</li>`).join("")}</ul>` : ""}
        ${"speechSynthesis" in window ? `<p><button class="ghost" style="color:#fff;border-color:rgba(255,255,255,.5)" data-action="speak">🔊 Vorlesen</button></p>` : ""}
      </div>
      ${late.length ? `<h2>⚠️ Überfällig</h2>${listHtml(late)}` : ""}
      <h2>Heute</h2>
      ${listHtml(todays, { showDate: false }, "Noch nichts für heute. Tippe oben z. B. „Angebot schicken heute 16 Uhr“.")}
    `;
  },

  plan() {
    const items = sortItems(open().filter((i) => !planFilter || i.projectId === planFilter));
    const t = today(), tm = tomorrow(), week = ymd(addDays(new Date(), 7));
    const groups = [
      ["⚠️ Überfällig", items.filter((i) => isLate(i) && i.date !== t)],
      ["Heute", items.filter((i) => i.date === t)],
      ["Morgen", items.filter((i) => i.date === tm)],
      ["Nächste 7 Tage", items.filter((i) => i.date > tm && i.date <= week)],
      ["Später", items.filter((i) => i.date > week)],
      ["Ohne Datum (Ideen & Eingang)", items.filter((i) => !i.date)],
    ];
    return `
      <h1>Planung</h1>
      <div class="toolbar">
        <select data-action="plan-filter" class="ghost">
          <option value="">Alle Projekte</option>
          ${state.projects.map((p) => `<option value="${p.id}" ${p.id === planFilter ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
        </select>
        <span class="spacer"></span>
        <button class="ghost" data-action="new-item">+ Ausführlich anlegen</button>
      </div>
      ${groups.filter(([, l]) => l.length).map(([title, l]) => `<h2>${title}</h2>${listHtml(l, { showDate: title !== "Heute" && title !== "Morgen" })}`).join("") ||
        `<div class="empty">Keine offenen Aufgaben. Schreib oben einfach los.</div>`}
    `;
  },

  projekte() {
    if (currentProject) return projectDetail(currentProject);
    return `
      <h1>Projekte</h1>
      <p class="sub">Der Assistent zeigt dir pro Projekt den nächsten Schritt und wo es hakt.</p>
      <div class="toolbar"><span class="spacer"></span><button class="primary" data-action="new-project">+ Neues Projekt</button></div>
      ${state.projects.length ? `<div class="projects">${state.projects.map((p) => {
        const st = projectStats(p);
        return `<div class="card project" style="border-left-color:${esc(p.color)}" data-action="open-project" data-id="${p.id}">
          <h3>${esc(p.name)}</h3>
          ${p.goal ? `<div class="sub" style="margin:0">🎯 ${esc(p.goal)}</div>` : ""}
          <div class="bar"><div style="width:${st.progress}%"></div></div>
          <div class="meta"><span>${st.done}/${st.items.length} erledigt</span>${p.deadline ? `<span>· Deadline ${fmtDate(p.deadline)}</span>` : ""}</div>
          <div class="next">${st.next ? `👉 Nächster Schritt: <b>${esc(st.next.title)}</b>${st.next.date ? ` (${fmtDate(st.next.date)})` : ""}` : "👉 Lege den nächsten Schritt fest"}</div>
          ${st.hints.map((h) => `<div class="warn">• ${esc(h)}</div>`).join("")}
        </div>`;
      }).join("")}</div>` : `<div class="empty">Noch keine Projekte. Lege eins an – oder schreib oben eine Aufgabe mit <b>#Projektname</b>.</div>`}
    `;
  },

  erledigt() {
    const done = state.items.filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 200);
    return `
      <h1>Erledigt</h1>
      <div class="toolbar"><span class="sub" style="margin:0">${done.length} erledigte Einträge</span><span class="spacer"></span>
        ${done.length ? `<button class="danger" data-action="clear-done">Alle erledigten löschen</button>` : ""}</div>
      ${listHtml(done, {}, "Noch nichts erledigt – los geht’s! 💪")}
    `;
  },

  einstellungen() {
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    const permText = {
      granted: `<span class="status-ok">✔ Erinnerungen sind erlaubt</span>`,
      denied: `<span class="status-bad">✖ Blockiert – bitte in den Browser-/Systemeinstellungen erlauben</span>`,
      default: `Noch nicht erlaubt`,
      unsupported: `<span class="status-bad">Dieser Browser unterstützt keine Benachrichtigungen</span>`,
    }[perm];
    const s = state.settings;
    return `
      <h1>Einstellungen</h1>
      <div class="settings">
        <div class="card">
          <h2 style="margin-top:0">Persönlich</h2>
          <label>Dein Name (für die Begrüßung)<input data-setting="name" value="${esc(s.name)}" placeholder="z. B. Bahrom"></label>
          <label>Standard-Erinnerung bei Uhrzeit (Minuten vorher)<input type="number" min="0" data-setting="defaultRemind" value="${s.defaultRemind ?? ""}"></label>
          <label>Tagesbriefing als Benachrichtigung um<input type="time" data-setting="briefingTime" value="${esc(s.briefingTime)}"></label>
        </div>
        <div class="card">
          <h2 style="margin-top:0">🔔 Erinnerungen</h2>
          <p>${permText}</p>
          <div class="buttons">
            <button class="primary" data-action="ask-notify">Benachrichtigungen erlauben</button>
            <button class="ghost" data-action="test-notify">Test-Erinnerung</button>
          </div>
          <p class="sub" style="margin-top:10px">Erinnerungen kommen, solange die App (oder der Browser) im Hintergrund läuft.
          Für <b>100 % zuverlässige</b> Erinnerungen auch bei geschlossener App: Termine mit „📆 Kalender“ in den Handy-/Outlook-Kalender übernehmen.</p>
          <div class="buttons"><button class="ghost" data-action="ics-all">📆 Alle kommenden Termine als Kalenderdatei</button></div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">📲 App installieren</h2>
          <p class="sub">Handy (Android/Chrome): Menü ⋮ → „App installieren“ / „Zum Startbildschirm“.<br>
          iPhone (Safari): Teilen ⬆️ → „Zum Home-Bildschirm“.<br>
          Windows (Edge/Chrome): Adressleiste → Symbol „App installieren“ ⊕.</p>
          <div class="buttons"><button class="primary" data-action="install" ${deferredInstall ? "" : "hidden"}>Jetzt installieren</button></div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">💾 Daten & Sicherung</h2>
          <p class="sub">Die Daten liegen nur auf diesem Gerät. Um Handy und Laptop abzugleichen: hier sichern und auf dem anderen Gerät wiederherstellen.</p>
          <div class="buttons">
            <button class="ghost" data-action="export">⬇️ Sicherung speichern</button>
            <button class="ghost" data-action="import">⬆️ Sicherung laden</button>
            <button class="danger" data-action="reset">Alles löschen</button>
          </div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">✍️ Schnelleingabe – so versteht dich der Assistent</h2>
          <ul class="sub">
            <li><b>heute, morgen, übermorgen, Montag … Sonntag, 25.10.</b> → Datum</li>
            <li><b>14 Uhr, um 9:30, 16.45 Uhr</b> → Uhrzeit (+ Erinnerung)</li>
            <li><b>#Projekt</b> → Projekt (wird automatisch angelegt)</li>
            <li><b>!hoch</b> oder <b>!!</b> → wichtig, <b>!niedrig</b> → unwichtig</li>
            <li>Wörter wie <b>Gespräch, Termin, Meeting, Call, Arzt</b> → wird als Termin markiert</li>
          </ul>
        </div>
      </div>
    `;
  },
};

function projectDetail(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) { currentProject = null; return VIEWS.projekte(); }
  const st = projectStats(p);
  const done = st.items.filter((i) => i.done);
  return `
    <div class="toolbar"><button class="ghost" data-action="back-projects">← Projekte</button><span class="spacer"></span>
      <button class="ghost" data-action="edit-project" data-id="${p.id}">✏️ Bearbeiten</button></div>
    <h1 style="color:${esc(p.color)}">${esc(p.name)}</h1>
    ${p.goal ? `<p class="sub">🎯 ${esc(p.goal)}</p>` : ""}
    <div class="card">
      <div class="bar"><div style="width:${st.progress}%"></div></div>
      <div class="meta"><span>${st.progress}% · ${st.done}/${st.items.length} erledigt</span>${p.deadline ? `<span>· Deadline ${fmtDate(p.deadline)}</span>` : ""}</div>
      ${st.hints.map((h) => `<div class="warn" style="color:var(--danger);font-size:14px">• ${esc(h)}</div>`).join("")}
      <div class="buttons" style="margin-top:10px"><button class="primary" data-action="add-to-project" data-id="${p.id}">+ Nächsten Schritt hinzufügen</button></div>
    </div>
    <h2>Offen</h2>${listHtml(st.openItems, {}, "Keine offenen Schritte.")}
    ${done.length ? `<h2>Erledigt</h2>${listHtml(done)}` : ""}
  `;
}

// ---------- Bearbeiten-Dialog ----------
const editDlg = $("#edit");
const editForm = $("#edit-form");
let editingId = null;

function openEdit(item, preset = {}) {
  editingId = item ? item.id : null;
  const it = item || { title: "", type: "task", priority: 2, date: "", time: "", remind: null, notes: "", checklist: [], projectId: "", ...preset };
  $("#edit-title").textContent = item ? "Bearbeiten" : "Neuer Eintrag";
  const f = editForm.elements;
  f.title.value = it.title;
  f.type.value = it.type;
  f.priority.value = String(it.priority);
  f.date.value = it.date || "";
  f.time.value = it.time || "";
  f.remind.value = it.remind === null || it.remind === undefined ? "" : String(it.remind);
  if (f.remind.value === "" && it.remind !== null && it.remind !== undefined) {
    f.remind.add(new Option(remindLabel(it.remind), String(it.remind)));
    f.remind.value = String(it.remind);
  }
  f.notes.value = it.notes || "";
  f.checklist.value = (it.checklist || []).map((c) => c.text).join("\n");
  f.projectId.innerHTML = `<option value="">— kein Projekt —</option>` +
    state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  f.projectId.value = it.projectId || "";
  $("#edit-delete").hidden = !item;
  editDlg.returnValue = "";
  editDlg.showModal();
}

function formToItem() {
  const f = editForm.elements;
  const old = state.items.find((i) => i.id === editingId);
  const oldCl = old?.checklist || [];
  return {
    ...(old || { id: uid(), createdAt: Date.now(), done: false }),
    title: f.title.value.trim(),
    type: f.type.value,
    priority: Number(f.priority.value),
    date: f.date.value || null,
    time: f.date.value ? f.time.value || null : null,
    remind: f.remind.value === "" ? null : Number(f.remind.value),
    projectId: f.projectId.value || null,
    notes: f.notes.value.trim(),
    checklist: f.checklist.value.split("\n").map((t) => t.trim()).filter(Boolean)
      .map((text) => ({ text, done: oldCl.find((c) => c.text === text)?.done || false })),
  };
}

editDlg.addEventListener("close", () => {
  if (editDlg.returnValue !== "save") return;
  const it = formToItem();
  if (!it.title) return;
  const old = state.items.find((i) => i.id === it.id);
  if (!old || old.date !== it.date || old.time !== it.time || old.remind !== it.remind) it.notified = false;
  if (old) Object.assign(old, it);
  else state.items.push(it);
  save();
  render();
  toast("Gespeichert ✔");
});

$("#edit-delete").addEventListener("click", () => {
  if (!confirm("Diesen Eintrag löschen?")) return;
  state.items = state.items.filter((i) => i.id !== editingId);
  save();
  editDlg.close("deleted");
  render();
});

$("#edit-ics").addEventListener("click", () => {
  const it = formToItem();
  if (!it.date) return toast("Bitte zuerst ein Datum eintragen.");
  downloadIcs([it], it.title);
});

// ---------- Projekt-Dialog ----------
const projDlg = $("#project-dialog");
const projForm = $("#project-form");
let editingProject = null;

function openProject(p) {
  editingProject = p ? p.id : null;
  const f = projForm.elements;
  f.name.value = p?.name || "";
  f.goal.value = p?.goal || "";
  f.deadline.value = p?.deadline || "";
  f.color.value = p?.color || randomColor();
  $("#project-delete").hidden = !p;
  projDlg.returnValue = "";
  projDlg.showModal();
}

projDlg.addEventListener("close", () => {
  if (projDlg.returnValue !== "save") return;
  const f = projForm.elements;
  const data = { name: f.name.value.trim(), goal: f.goal.value.trim(), deadline: f.deadline.value, color: f.color.value };
  if (!data.name) return;
  const p = state.projects.find((x) => x.id === editingProject);
  if (p) Object.assign(p, data);
  else state.projects.push({ id: uid(), createdAt: Date.now(), ...data });
  save();
  render();
});

$("#project-delete").addEventListener("click", () => {
  if (!confirm("Projekt löschen? Die Aufgaben bleiben erhalten (ohne Projekt).")) return;
  state.projects = state.projects.filter((p) => p.id !== editingProject);
  state.items.forEach((i) => { if (i.projectId === editingProject) i.projectId = null; });
  currentProject = null;
  save();
  projDlg.close("deleted");
  render();
});

// ---------- Klicks in den Ansichten ----------
$("#view").addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const id = el.dataset.id;
  const item = state.items.find((i) => i.id === id);
  switch (el.dataset.action) {
    case "toggle":
      e.stopPropagation();
      item.done = !item.done;
      item.doneAt = item.done ? Date.now() : null;
      save(); render();
      if (item.done) toast("Erledigt! 🎉");
      break;
    case "check-sub": {
      e.stopPropagation();
      item.checklist[Number(el.dataset.i)].done = el.checked;
      save(); render();
      break;
    }
    case "edit": openEdit(item); break;
    case "new-item": openEdit(null, { projectId: planFilter }); break;
    case "new-project": openProject(null); break;
    case "open-project": currentProject = id; render(); break;
    case "back-projects": currentProject = null; render(); break;
    case "edit-project": openProject(state.projects.find((p) => p.id === id)); break;
    case "add-to-project": openEdit(null, { projectId: id }); break;
    case "clear-done":
      if (confirm("Alle erledigten Einträge endgültig löschen?")) {
        state.items = state.items.filter((i) => !i.done);
        save(); render();
      }
      break;
    case "speak": speak(briefingText()); break;
    case "ask-notify": askNotify(); break;
    case "test-notify": notify("Test-Erinnerung", "So sehen deine Erinnerungen aus. 👍", "test"); break;
    case "ics-all": {
      const items = sortItems(open().filter((i) => i.date && i.date >= today()));
      if (!items.length) return toast("Keine kommenden Einträge mit Datum.");
      downloadIcs(items, "assistent-termine");
      break;
    }
    case "install": installApp(); break;
    case "export": exportData(); break;
    case "import": importData(); break;
    case "reset":
      if (confirm("Wirklich ALLE Daten auf diesem Gerät löschen?")) {
        state = structuredClone(DEFAULT_STATE);
        save(); render();
      }
      break;
  }
});

$("#view").addEventListener("change", (e) => {
  if (e.target.dataset.action === "plan-filter") { planFilter = e.target.value; render(); }
  const key = e.target.dataset.setting;
  if (key) {
    let v = e.target.value;
    if (key === "defaultRemind") v = v === "" ? null : Math.max(0, Number(v));
    state.settings[key] = v;
    save();
    toast("Gespeichert ✔");
  }
});

document.querySelectorAll(".nav-btn").forEach((b) =>
  b.addEventListener("click", () => {
    currentView = b.dataset.view;
    if (currentView !== "projekte") currentProject = null;
    render();
    window.scrollTo(0, 0);
  })
);

// ---------- Schnelleingabe ----------
const quickInput = $("#quick-input");
quickInput.addEventListener("input", () => {
  const v = quickInput.value.trim();
  $("#quick-preview").textContent = v ? describeParsed(parseQuick(v)) : "";
});

$("#quick").addEventListener("submit", (e) => {
  e.preventDefault();
  let v = quickInput.value.trim();
  if (!v) return;
  // Im Projekt-Detail gehört neue Aufgabe automatisch zum Projekt
  const p = parseQuick(v);
  if (!p.title) return toast("Bitte einen Text eingeben.");
  let projectId = findOrCreateProject(p.projectName);
  if (!projectId && currentView === "projekte" && currentProject) projectId = currentProject;
  if (!projectId && currentView === "plan" && planFilter) projectId = planFilter;
  state.items.push({
    id: uid(),
    title: p.title,
    type: p.type,
    priority: p.priority,
    date: p.date,
    time: p.time,
    remind: p.time ? state.settings.defaultRemind : null,
    projectId,
    notes: "",
    checklist: [],
    done: false,
    notified: false,
    createdAt: Date.now(),
  });
  save();
  quickInput.value = "";
  $("#quick-preview").textContent = "";
  render();
  toast(`Hinzugefügt: ${p.title}${p.date ? ` · ${fmtDate(p.date)}${p.time ? " " + p.time : ""}` : ""}`);
  if (p.time && "Notification" in window && Notification.permission === "default") askNotify();
});

// Spracheingabe (Chrome/Edge, Android)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const mic = $("#mic");
  mic.hidden = false;
  let rec = null;
  mic.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = "de-DE";
    rec.interimResults = false;
    rec.onresult = (ev) => {
      quickInput.value = ev.results[0][0].transcript;
      quickInput.dispatchEvent(new Event("input"));
      quickInput.focus();
    };
    rec.onerror = (ev) => toast("Spracheingabe: " + ev.error);
    rec.onend = () => { rec = null; mic.classList.remove("listening"); };
    mic.classList.add("listening");
    rec.start();
  });
}

function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "de-DE";
  speechSynthesis.speak(u);
}

// ---------- Erinnerungen ----------
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 3500);
}

async function askNotify() {
  if (!("Notification" in window)) return toast("Benachrichtigungen werden hier nicht unterstützt.");
  const res = await Notification.requestPermission();
  toast(res === "granted" ? "Erinnerungen sind aktiv 🔔" : "Erinnerungen wurden nicht erlaubt.");
  if (currentView === "einstellungen") render();
}

async function notify(title, body, tag) {
  toast(`🔔 ${title}${body ? " – " + body : ""}`);
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body, tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", requireInteraction: true };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, opts);
  } catch (e) { /* weiter mit Fallback */ }
  try { new Notification(title, opts); } catch (e) { /* z. B. Android ohne Service Worker */ }
}

function checkReminders() {
  const now = new Date();
  let changed = false;
  for (const it of state.items) {
    if (it.done || it.notified || it.remind === null || it.remind === undefined || !it.date || !it.time) continue;
    const due = dueDate(it);
    const at = due.getTime() - it.remind * 60000;
    if (now.getTime() < at) continue;
    it.notified = true;
    changed = true;
    if (now - due > 6 * 3600e3) continue; // zu alt – nicht mehr nachträglich melden
    const p = projectOf(it);
    const left = (it.checklist || []).filter((c) => !c.done).length;
    const body = [
      due > now ? `${it.time} Uhr (${fmtRelative(due - now)})` : `${it.time} Uhr – jetzt`,
      p ? `Projekt: ${p.name}` : "",
      left ? `Vorbereitung: noch ${left} Punkt(e) offen` : "",
    ].filter(Boolean).join(" · ");
    notify(it.type === "termin" ? `Termin: ${it.title}` : `Erinnerung: ${it.title}`, body, it.id);
  }

  // Tagesbriefing einmal pro Tag
  const s = state.settings;
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (s.briefingTime && s.lastBriefing !== today() && hm >= s.briefingTime) {
    s.lastBriefing = today();
    changed = true;
    const strip = (x) => x.replace(/<[^>]+>/g, "");
    const b = briefing();
    notify(b.greet, [...b.lines, ...b.tips.slice(0, 2)].map(strip).join(" "), "briefing");
  }
  if (changed) {
    save();
    if (!editDlg.open && !projDlg.open) render();
  }
}

// ---------- Kalender-Export (.ics) ----------
function icsDate(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
const icsEsc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function buildIcs(items) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mein Assistent//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const it of items) {
    const p = projectOf(it);
    const desc = [
      p ? `Projekt: ${p.name}` : "",
      it.notes,
      (it.checklist || []).length ? "Vorbereitung:\n" + it.checklist.map((c) => `${c.done ? "[x]" : "[ ]"} ${c.text}`).join("\n") : "",
    ].filter(Boolean).join("\n\n");
    out.push("BEGIN:VEVENT", `UID:${it.id}@mein-assistent`, `DTSTAMP:${stamp}`);
    if (it.time) {
      const start = new Date(`${it.date}T${it.time}`);
      const end = new Date(start.getTime() + (it.type === "termin" ? 60 : 30) * 60000);
      out.push(`DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`);
    } else {
      out.push(`DTSTART;VALUE=DATE:${it.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${ymd(addDays(parseYmd(it.date), 1)).replace(/-/g, "")}`);
    }
    out.push(`SUMMARY:${icsEsc(it.title)}`);
    if (desc) out.push(`DESCRIPTION:${icsEsc(desc)}`);
    if (it.remind !== null && it.remind !== undefined) {
      out.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(it.title)}`, `TRIGGER:-PT${it.remind}M`, "END:VALARM");
    }
    out.push("END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return out.join("\r\n");
}

function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadIcs(items, name) {
  const safe = name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || "termin";
  download(buildIcs(items), `${safe}.ics`, "text/calendar;charset=utf-8");
  toast("Kalenderdatei erstellt – öffnen, um sie in den Kalender zu übernehmen.");
}

// ---------- Sicherung ----------
function exportData() {
  download(JSON.stringify(state, null, 2), `assistent-sicherung-${today()}.json`, "application/json");
}

function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.items) || !Array.isArray(data.projects)) throw new Error("Keine gültige Sicherung");
      if (!confirm(`Sicherung mit ${data.items.length} Einträgen und ${data.projects.length} Projekten laden? Aktuelle Daten werden ersetzt.`)) return;
      state = { items: data.items, projects: data.projects, settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) } };
      save(); render();
      toast("Sicherung geladen ✔");
    } catch (e) {
      toast("Fehler: " + e.message);
    }
  };
  input.click();
}

// ---------- Installation & Start ----------
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (currentView === "einstellungen") render();
});
async function installApp() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  render();
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service Worker:", e));
}

// Andere Tabs/Fenster derselben App synchron halten
window.addEventListener("storage", (e) => {
  if (e.key === KEY) { state = load(); render(); }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { state = load(); checkReminders(); render(); }
});

if (new URLSearchParams(location.search).has("neu")) setTimeout(() => quickInput.focus(), 100);

render();
checkReminders();
setInterval(checkReminders, 20000);
// Ansicht jede Minute aktualisieren (relative Zeiten, überfällig)
setInterval(() => { if (!editDlg.open && !projDlg.open && document.activeElement?.tagName !== "INPUT") render(); }, 60000);
