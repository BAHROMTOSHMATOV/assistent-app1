// Yordamchi – Claude asosidagi shaxsiy ovozli yordamchi.
// Ma'lumotlar faqat shu qurilmada (localStorage) saqlanadi.
import Anthropic from "./vendor/anthropic-sdk.mjs";

// ---------- Saqlash ----------
const KEY = "yordamchi-v1";
const DEFAULT_SETTINGS = {
  apiKey: "",
  name: "",
  model: "claude-opus-5-5",
  voice: true,
  voiceName: "",
  micLang: "uz-UZ",
  defaultRemind: 15,
  briefingTime: "08:00",
  lastBriefing: "",
};

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      tasks: d.tasks || [],
      memory: d.memory || [],
      chat: d.chat || [],
      settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
    };
  } catch {
    return { tasks: [], memory: [], chat: [], settings: { ...DEFAULT_SETTINGS } };
  }
}
let state = load();
function save() {
  state.chat = state.chat.slice(-120);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("Saqlab bo'lmadi: " + e.message); }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- Sana va vaqt ----------
const KUNLAR = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const OYLAR = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const hasTime = (due) => !!due && due.length > 10;
const dueDate = (due) => (due ? new Date(hasTime(due) ? due : due + "T23:59") : null);
const isLate = (t) => !t.done && t.due && dueDate(t.due) < new Date();

function fmtDue(due) {
  if (!due) return "";
  const d = dueDate(due);
  const day = due.slice(0, 10);
  let s;
  if (day === today()) s = "Bugun";
  else if (day === ymd(addDays(new Date(), 1))) s = "Ertaga";
  else if (day === ymd(addDays(new Date(), -1))) s = "Kecha";
  else s = `${KUNLAR[d.getDay()]}, ${d.getDate()}-${OYLAR[d.getMonth()]}`;
  return hasTime(due) ? `${s} ${due.slice(11, 16)}` : s;
}

function nowContext() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const tz = `UTC${off >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  return `${ymd(d)} ${KUNLAR[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())} (${tz})`;
}

const DUE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

// ---------- Claude: ko'rsatmalar va vositalar ----------
const SYSTEM_PROMPT = `You are "Yordamchi", a personal voice assistant (like Siri) for one person. You live in an app on their phone and Windows laptop. You keep track of their tasks, appointments and reminders using the tools below, and you help them prepare for meetings and move their projects forward.

Language: reply in Uzbek (Latin script), warm and natural. If the user clearly writes in another language (Russian, German, English), reply in that language.

Your replies are shown in a chat and read aloud, so keep them short: usually 1-3 sentences, plain text, no markdown, no emojis. Only use a short numbered list when the user asks for a plan or a list. Say times like "soat 14:00".

Every user message comes with context blocks:
- <hozir>: the current local date, weekday and time. Resolve relative dates from it (bugun, ertaga, indinga, payshanba, keyingi hafta, ertalab ≈ 09:00, tushlikda ≈ 13:00, kechqurun ≈ 19:00).
- <sozlamalar>: the user's name and the default reminder lead time.
- <vazifalar>: the current tasks with their ids (JSON). This is the only source of truth about tasks; never invent tasks.
- <xotira>: facts you saved about the user earlier.
- <oxirgi_suhbat>: the last few exchanges, for continuity.
- <foydalanuvchi>: what the user just said (often voice-transcribed, so expect typos and missing punctuation).

How to act:
- When the user mentions something they need to do, an appointment, meeting, call or deadline, call add_task right away without asking for confirmation. Use kind "uchrashuv" for meetings, calls, visits and appointments, otherwise "vazifa".
- For items with a time, set remind_minutes_before to the default from <sozlamalar> unless the user says otherwise. If the user says "soat X da eslat", set due to that time and remind_minutes_before to 0.
- If a meeting has no time, add it anyway with only a date and ask once what time it is.
- "Bajardim", "bo'ldi", "qildim" → complete_task. "Bekor qil", "o'chir" → delete_task. Changes of time, title or details → update_task. Match tasks by meaning; if it is genuinely unclear which task is meant, ask.
- For questions like "bugun nima bor?" answer from <vazifalar>: appointments in time order, how long until the next one, and overdue items. Be concise.
- Be a helpful assistant, not just a notepad: for an upcoming meeting suggest 1-3 short preparation steps and offer to add them; when asked for a plan, build a realistic one from the open tasks. Don't lecture.
- When the user tells you lasting facts (people, places, preferences, routines, projects), save them with remember. Remove outdated ones with forget.
- After using tools, confirm briefly what you did, e.g. "Yozib qo'ydim: ertaga soat 14:00 da Ali bilan uchrashuv. 15 daqiqa oldin eslataman."`;

const nullable = (type, extra = {}) => ({ type: [type, "null"], ...extra });
const TOOLS = [
  {
    name: "add_task",
    description: "Add a task, appointment or reminder for the user.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "due", "remind_minutes_before", "kind", "priority", "project", "notes"],
      properties: {
        title: { type: "string", description: "Short title in the user's language, e.g. \"Ali bilan uchrashuv\"" },
        due: nullable("string", { description: "Local date-time 'YYYY-MM-DDTHH:MM', or 'YYYY-MM-DD' when there is no time, or null when there is no date" }),
        remind_minutes_before: nullable("integer", { description: "Minutes before due to remind (0 = at the time). null = no reminder. Only meaningful when due has a time." }),
        kind: { type: "string", enum: ["vazifa", "uchrashuv"] },
        priority: { type: "string", enum: ["past", "oddiy", "yuqori"] },
        project: nullable("string", { description: "Project or area name, if any" }),
        notes: nullable("string", { description: "Details, preparation steps, place, phone number, etc." }),
      },
    },
  },
  {
    name: "update_task",
    description: "Change an existing task. Pass null for every field that should stay unchanged.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "due", "clear_due", "remind_minutes_before", "kind", "priority", "project", "notes"],
      properties: {
        id: { type: "string" },
        title: nullable("string"),
        due: nullable("string", { description: "New 'YYYY-MM-DDTHH:MM' or 'YYYY-MM-DD'" }),
        clear_due: { type: "boolean", description: "true to remove the date entirely" },
        remind_minutes_before: nullable("integer"),
        kind: { type: ["string", "null"], enum: ["vazifa", "uchrashuv", null] },
        priority: { type: ["string", "null"], enum: ["past", "oddiy", "yuqori", null] },
        project: nullable("string"),
        notes: nullable("string", { description: "Replaces the notes completely" }),
      },
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as done.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } },
  },
  {
    name: "delete_task",
    description: "Delete a task that was cancelled or added by mistake.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } },
  },
  {
    name: "remember",
    description: "Save a lasting fact about the user for future conversations.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["fact"], properties: { fact: { type: "string" } } },
  },
  {
    name: "forget",
    description: "Remove a saved fact (pass its exact text from <xotira>).",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["fact"], properties: { fact: { type: "string" } } },
  },
];

// Vositalarni bajarish. Natija: { text, label } yoki xato.
function runTool(name, input) {
  const find = (id) => {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) throw new Error(`Task ${id} not found`);
    return t;
  };
  const checkDue = (due) => {
    if (due !== null && !DUE_RE.test(due)) throw new Error(`Invalid due "${due}", use YYYY-MM-DDTHH:MM or YYYY-MM-DD`);
  };
  switch (name) {
    case "add_task": {
      checkDue(input.due);
      const t = {
        id: uid(), title: input.title.trim(), due: input.due, remind: input.remind_minutes_before,
        kind: input.kind, priority: input.priority, project: input.project || null, notes: input.notes || "",
        done: false, notified: false, createdAt: Date.now(),
      };
      state.tasks.push(t);
      return { text: JSON.stringify({ ok: true, task: compactTask(t) }), label: `➕ ${t.title}${t.due ? " · " + fmtDue(t.due) : ""}` };
    }
    case "update_task": {
      const t = find(input.id);
      if (input.due !== null) checkDue(input.due);
      const before = `${t.due}|${t.remind}`;
      for (const [k, f] of [["title", "title"], ["kind", "kind"], ["priority", "priority"], ["project", "project"], ["notes", "notes"]]) {
        if (input[k] !== null) t[f] = input[k];
      }
      if (input.clear_due) t.due = null;
      else if (input.due !== null) t.due = input.due;
      if (input.remind_minutes_before !== null) t.remind = input.remind_minutes_before;
      if (`${t.due}|${t.remind}` !== before) t.notified = false;
      return { text: JSON.stringify({ ok: true, task: compactTask(t) }), label: `✏️ ${t.title}` };
    }
    case "complete_task": {
      const t = find(input.id);
      t.done = true;
      t.doneAt = Date.now();
      return { text: '{"ok":true}', label: `✅ ${t.title}` };
    }
    case "delete_task": {
      const t = find(input.id);
      state.tasks = state.tasks.filter((x) => x !== t);
      return { text: '{"ok":true}', label: `🗑 ${t.title}` };
    }
    case "remember": {
      if (!state.memory.includes(input.fact)) state.memory.push(input.fact);
      state.memory = state.memory.slice(-60);
      return { text: '{"ok":true}', label: "🧠 Eslab qoldim" };
    }
    case "forget": {
      const n = state.memory.length;
      state.memory = state.memory.filter((f) => f !== input.fact);
      return { text: JSON.stringify({ ok: state.memory.length < n }), label: "🧠 Unutdim" };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

function compactTask(t) {
  const o = { id: t.id, title: t.title, kind: t.kind };
  if (t.due) o.due = t.due;
  if (t.remind !== null && t.remind !== undefined) o.remind = t.remind;
  if (t.priority && t.priority !== "oddiy") o.priority = t.priority;
  if (t.project) o.project = t.project;
  if (t.notes) o.notes = t.notes;
  if (t.done) o.done = true;
  if (isLate(t)) o.overdue = true;
  return o;
}

function buildContext(userText) {
  const s = state.settings;
  const recentDone = state.tasks.filter((t) => t.done && t.doneAt > Date.now() - 2 * 86400e3);
  const open = sortTasks(state.tasks.filter((t) => !t.done));
  const history = state.chat
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-9, -1) // oxirgisi — hozirgi xabarning o'zi
    .map((m) => `${m.role === "user" ? "Foydalanuvchi" : "Yordamchi"}: ${m.text}`)
    .join("\n");
  return [
    `<hozir>${nowContext()}</hozir>`,
    `<sozlamalar>ism: ${s.name || "noma'lum"}; standart eslatma: ${s.defaultRemind} daqiqa oldin</sozlamalar>`,
    `<vazifalar>\n${[...open, ...recentDone].map((t) => JSON.stringify(compactTask(t))).join("\n") || "(bo'sh)"}\n</vazifalar>`,
    `<xotira>\n${state.memory.join("\n") || "(bo'sh)"}\n</xotira>`,
    `<oxirgi_suhbat>\n${history || "(yo'q)"}\n</oxirgi_suhbat>`,
    `<foydalanuvchi>${userText}</foydalanuvchi>`,
  ].join("\n");
}

// Har bir so'rov – alohida qisqa suhbat: tarix matn ko'rinishida <oxirgi_suhbat> ichida beriladi.
async function askClaude(userText, onTool) {
  const s = state.settings;
  const client = new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const messages = [{ role: "user", content: buildContext(userText) }];
  const useFallback = s.model === "claude-opus-5-5" || s.model === "claude-sonnet-5-5";
  const labels = [];

  for (let step = 0; step < 8; step++) {
    const params = {
      model: s.model,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      output_config: { effort: "low" },
      messages,
    };
    const res = useFallback
      ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.messages.create(params);

    if (res.stop_reason === "refusal") {
      return { text: "Kechirasiz, bu so'rovga javob bera olmayman.", labels };
    }
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "pause_turn") continue;
    const uses = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (res.stop_reason === "max_tokens" && !text) return { text: "Javob juda uzun bo'lib ketdi, qisqaroq so'rang.", labels };
      return { text: text || "Bajarildi.", labels };
    }

    const results = uses.map((u) => {
      try {
        const r = runTool(u.name, u.input);
        labels.push(r.label);
        return { type: "tool_result", tool_use_id: u.id, content: r.text };
      } catch (e) {
        return { type: "tool_result", tool_use_id: u.id, content: e.message, is_error: true };
      }
    });
    save();
    onTool?.();
    messages.push({ role: "user", content: results });
  }
  return { text: "Kechirasiz, bu ish juda ko'p qadam talab qildi. Qaytadan urinib ko'ring.", labels };
}

function errorText(e) {
  if (e instanceof Anthropic.AuthenticationError) return "API kalit noto'g'ri yoki o'chirilgan. Sozlamalarda tekshiring.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Bu kalitga ruxsat yo'q. Anthropic Console'da hisobingizni tekshiring.";
  if (e instanceof Anthropic.RateLimitError) return "Juda ko'p so'rov yuborildi. Bir daqiqadan keyin urinib ko'ring.";
  if (e instanceof Anthropic.BadRequestError) {
    if (/credit|balance|billing/i.test(e.message)) return "Anthropic hisobingizda mablag' tugagan. console.anthropic.com → Billing bo'limida to'ldiring.";
    return "So'rovda xato: " + e.message;
  }
  if (e instanceof Anthropic.APIConnectionError) return "Internet aloqasi yo'q. Ulanishni tekshirib, qayta urinib ko'ring.";
  if (e instanceof Anthropic.InternalServerError) return "Claude serveri hozir band. Birozdan keyin qayta urinib ko'ring.";
  if (e instanceof Anthropic.APIError) return "Xato: " + e.message;
  return "Kutilmagan xato: " + (e?.message || e);
}

// ---------- Interfeys ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const chatEl = $("#chat");
const orb = $("#orb");
const statusEl = $("#status");
const input = $("#text");
let busy = false;

function setOrb(mode, text) {
  orb.className = "orb " + mode;
  if (text !== undefined) statusEl.textContent = text;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 3500);
}

function greeting() {
  const h = new Date().getHours();
  const g = h < 11 ? "Xayrli tong" : h < 18 ? "Xayrli kun" : "Xayrli kech";
  return `${g}${state.settings.name ? ", " + state.settings.name : ""}!`;
}

// Mahalliy qisqa xulosa (Claude'ga murojaatsiz)
function localSummary() {
  const open = state.tasks.filter((t) => !t.done);
  const todays = sortTasks(open.filter((t) => t.due && t.due.slice(0, 10) === today()));
  const late = open.filter((t) => isLate(t) && t.due.slice(0, 10) !== today());
  const next = sortTasks(open.filter((t) => hasTime(t.due) && dueDate(t.due) > new Date()))[0];
  const parts = [];
  parts.push(todays.length ? `Bugun ${todays.length} ta ish rejada.` : "Bugunga reja yo'q.");
  if (next) parts.push(`Keyingisi: ${fmtDue(next.due)} — ${next.title}.`);
  if (late.length) parts.push(`${late.length} ta vazifaning muddati o'tgan.`);
  return parts.join(" ");
}

function renderChat() {
  const s = state.settings;
  $(".app").classList.toggle("compact", state.chat.length > 0 || !s.apiKey);
  if (!s.apiKey) {
    chatEl.innerHTML = welcomeHtml();
    $("#key-save").onclick = () => saveKey($("#key-input").value);
    return;
  }
  chatEl.innerHTML = state.chat.map((m) => `
    <div class="msg ${m.role}">${esc(m.text)}${m.labels?.length ? `<div class="actions">${m.labels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : ""}</div>`).join("") +
    (busy ? `<div class="msg assistant typing">O'ylayapman</div>` : "");
  chatEl.scrollTop = chatEl.scrollHeight;
}

function welcomeHtml() {
  return `<div class="welcome">
    <h3>Assalomu alaykum! 👋</h3>
    <p>Men — sizning shaxsiy yordamchingizman. Vazifalaringizni yozib boraman, uchrashuvlarni eslatib turaman va loyihalaringizda yordam beraman.
    Ishlashim uchun <b>Claude API kaliti</b> kerak (bir marta sozlanadi):</p>
    <ol>
      <li><a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> saytiga kiring va ro'yxatdan o'ting (Google akkaunt bilan ham bo'ladi).</li>
      <li><b>Billing</b> bo'limida kartangizni qo'shib, hisobni to'ldiring (5 $ boshlash uchun yetadi). <b>Limits</b> bo'limida oylik chegarani ham qo'yib qo'ying.</li>
      <li><b>API Keys</b> → <b>Create Key</b> → nom bering (masalan, "Yordamchi") → kalitni nusxalang. U <code>sk-ant-</code> bilan boshlanadi.</li>
      <li>Kalitni pastga qo'yib, <b>Saqlash</b> ni bosing.</li>
    </ol>
    <div class="row"><input id="key-input" type="password" placeholder="sk-ant-..." autocomplete="off"><button class="primary" id="key-save">Saqlash</button></div>
    <p style="font-size:13px;color:var(--muted)">Kalit faqat shu qurilmada saqlanadi va faqat Anthropic serveriga yuboriladi. Uni hech kimga bermang.</p>
  </div>`;
}

async function saveKey(key) {
  key = (key || "").trim();
  if (!key.startsWith("sk-ant-")) return toast("Kalit sk-ant- bilan boshlanishi kerak.");
  setOrb("thinking", "Kalitni tekshiryapman…");
  try {
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    await client.models.retrieve(state.settings.model);
    state.settings.apiKey = key;
    save();
    setOrb("idle", "Tayyorman! Gapiring yoki yozing.");
    addMessage("assistant", `${greeting()} Endi men tayyorman. Menga ishlaringizni ayting, masalan: "ertaga soat 14 da Ali bilan uchrashuvim bor".`);
    renderSettings();
  } catch (e) {
    setOrb("error", errorText(e));
  }
}

function addMessage(role, text, labels) {
  state.chat.push({ role, text, labels, ts: Date.now() });
  save();
  renderChat();
}

async function send(text, display) {
  text = text.trim();
  if (!text || busy) return;
  if (!state.settings.apiKey) return toast("Avval API kalitni kiriting.");
  stopSpeaking();
  addMessage("user", display || text);
  busy = true;
  input.value = "";
  updateControls();
  renderChat();
  setOrb("thinking", "O'ylayapman…");
  try {
    const { text: reply, labels } = await askClaude(text, renderTasks);
    busy = false;
    addMessage("assistant", reply, labels);
    setOrb("idle", "");
    speak(reply);
  } catch (e) {
    busy = false;
    addMessage("error", errorText(e));
    setOrb("error", "Xatolik yuz berdi");
  }
  updateControls();
  renderTasks();
}

function updateControls() {
  $("#send").disabled = busy;
  $("#mic").disabled = busy;
}

$("#composer").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
$("#chips").addEventListener("click", (e) => { const b = e.target.closest("[data-say]"); if (b) send(b.dataset.say); });

// ---------- Ovoz: tinglash ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function startListening() {
  if (!SR) return toast("Bu brauzerda ovozli kiritish yo'q. Chrome yoki Edge'dan foydalaning yoki yozing.");
  if (rec) { rec.stop(); return; }
  stopSpeaking();
  rec = new SR();
  rec.lang = state.settings.micLang;
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
      else interim += ev.results[i][0].transcript;
    }
    input.value = (finalText + interim).trim();
  };
  rec.onerror = (ev) => {
    const msg = { "not-allowed": "Mikrofonga ruxsat berilmagan.", "no-speech": "Hech narsa eshitilmadi.", network: "Ovozni tanish uchun internet kerak.", "language-not-supported": "Bu til qo'llab-quvvatlanmaydi — sozlamalarda boshqa tilni tanlang." }[ev.error];
    toast(msg || "Ovoz xatosi: " + ev.error);
  };
  rec.onend = () => {
    rec = null;
    $("#mic").classList.remove("on");
    if (finalText.trim()) send(finalText);
    else setOrb("idle", "");
  };
  $("#mic").classList.add("on");
  setOrb("listening", "Tinglayapman…");
  rec.start();
}
$("#mic").addEventListener("click", startListening);
orb.addEventListener("click", () => { if (!busy && state.settings.apiKey) startListening(); });
// Kompyuterda: probel tugmasini bosib turib gapirish emas, Ctrl+M bilan mikrofon
document.addEventListener("keydown", (e) => { if (e.ctrlKey && e.key.toLowerCase() === "m") { e.preventDefault(); startListening(); } });

// ---------- Ovoz: gapirish ----------
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const s = state.settings;
  return voices.find((v) => v.name === s.voiceName) || voices.find((v) => v.lang.toLowerCase().startsWith("uz")) || null;
}
function speak(text) {
  if (!state.settings.voice || !("speechSynthesis" in window)) return;
  const voice = pickVoice();
  if (!voice) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.onstart = () => setOrb("speaking");
  u.onend = u.onerror = () => { if (!busy && !rec) setOrb("idle"); };
  speechSynthesis.speak(u);
}
function stopSpeaking() { if ("speechSynthesis" in window) speechSynthesis.cancel(); }
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => { if (isOpen("settings")) renderSettings(); };

// ---------- Vazifalar paneli ----------
function sortTasks(list) {
  return list.slice().sort((a, b) => {
    const da = a.due || "9999", db = b.due || "9999";
    if (da !== db) return da < db ? -1 : 1;
    const p = { yuqori: 0, oddiy: 1, past: 2 };
    return (p[a.priority] ?? 1) - (p[b.priority] ?? 1);
  });
}

function taskHtml(t) {
  const tags = [];
  if (isLate(t)) tags.push(`<span class="tag late">kechikdi</span>`);
  if (t.kind === "uchrashuv") tags.push(`<span class="tag meet">uchrashuv</span>`);
  if (t.priority === "yuqori") tags.push(`<span class="tag hi">muhim</span>`);
  if (t.due) tags.push(`<span>${fmtDue(t.due)}</span>`);
  if (t.remind !== null && t.remind !== undefined && hasTime(t.due) && !t.done) tags.push(`<span>🔔 ${t.remind ? t.remind + " daq. oldin" : "vaqtida"}</span>`);
  if (t.project) tags.push(`<span class="tag">${esc(t.project)}</span>`);
  return `<div class="task ${t.done ? "done" : ""}">
    <button class="chk" data-toggle="${t.id}">${t.done ? "✓" : ""}</button>
    <div class="body"><div class="t">${esc(t.title)}</div><div class="meta">${tags.join("")}</div>${t.notes && !t.done ? `<div class="notes">${esc(t.notes)}</div>` : ""}</div>
    <button class="del" data-del="${t.id}" title="O'chirish">×</button>
  </div>`;
}

function renderTasks() {
  const open = sortTasks(state.tasks.filter((t) => !t.done));
  const t0 = today(), t1 = ymd(addDays(new Date(), 1));
  const day = (t) => t.due && t.due.slice(0, 10);
  const groups = [
    ["Muddati o'tgan", open.filter((t) => isLate(t) && day(t) !== t0), "late"],
    ["Bugun", open.filter((t) => day(t) === t0)],
    ["Ertaga", open.filter((t) => day(t) === t1)],
    ["Keyinroq", open.filter((t) => day(t) > t1)],
    ["Muddatsiz", open.filter((t) => !t.due)],
    ["Bajarilgan", state.tasks.filter((t) => t.done).sort((a, b) => b.doneAt - a.doneAt).slice(0, 15)],
  ];
  $("#task-list").innerHTML = groups.filter(([, l]) => l.length)
    .map(([title, l, cls]) => `<div class="group ${cls || ""}">${title}</div>${l.map(taskHtml).join("")}`).join("") ||
    `<div class="empty">Hozircha vazifa yo'q. Yordamchiga ayting: "ertaga soat 10 da hisobotni topshirishim kerak".</div>`;
  const badge = open.filter((t) => isLate(t) || day(t) === t0).length;
  $("#task-count").hidden = !badge;
  $("#task-count").textContent = badge;
}

$("#task-list").addEventListener("click", (e) => {
  const tg = e.target.closest("[data-toggle]");
  const dl = e.target.closest("[data-del]");
  if (tg) {
    const t = state.tasks.find((x) => x.id === tg.dataset.toggle);
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    if (t.done) toast("Barakalla! ✅");
  } else if (dl) {
    if (!confirm("Bu vazifani o'chiraymi?")) return;
    state.tasks = state.tasks.filter((x) => x.id !== dl.dataset.del);
  } else return;
  save();
  renderTasks();
});

$("#quick-add").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const due = f.due.value || null;
  state.tasks.push({
    id: uid(), title: f.title.value.trim(), due, remind: due ? state.settings.defaultRemind : null,
    kind: "vazifa", priority: "oddiy", project: null, notes: "", done: false, notified: false, createdAt: Date.now(),
  });
  save();
  e.target.reset();
  renderTasks();
  toast("Qo'shildi");
});

// ---------- Panellarni ochish/yopish ----------
const sheets = { tasks: $("#tasks-sheet"), settings: $("#settings-sheet") };
const isOpen = (n) => sheets[n].classList.contains("open");
function openSheet(n) {
  Object.values(sheets).forEach((s) => s.classList.remove("open"));
  sheets[n].classList.add("open");
  $("#backdrop").classList.add("show");
  if (n === "tasks") renderTasks();
  if (n === "settings") renderSettings();
}
function closeSheets() {
  Object.values(sheets).forEach((s) => s.classList.remove("open"));
  $("#backdrop").classList.remove("show");
}
$("#open-tasks").onclick = () => openSheet("tasks");
$("#open-settings").onclick = () => openSheet("settings");
$("#backdrop").onclick = closeSheets;
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeSheets));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheets(); });

// ---------- Sozlamalar ----------
let deferredInstall = null;
function renderSettings() {
  const s = state.settings;
  const voices = "speechSynthesis" in window ? speechSynthesis.getVoices() : [];
  const perm = "Notification" in window ? Notification.permission : "none";
  const permText = { granted: `<span class="ok">✔ Ruxsat berilgan</span>`, denied: `<span class="bad">✖ Bloklangan — brauzer sozlamalarida ruxsat bering</span>`, default: "Hali ruxsat berilmagan", none: `<span class="bad">Bu brauzerda bildirishnoma yo'q</span>` }[perm];
  const hasUz = voices.some((v) => v.lang.toLowerCase().startsWith("uz"));
  $("#settings").innerHTML = `
    <section>
      <h3>👤 Shaxsiy</h3>
      <label>Ismingiz<input data-s="name" value="${esc(s.name)}" placeholder="Masalan: Bahrom"></label>
      <label>Standart eslatma (necha daqiqa oldin)<input data-s="defaultRemind" type="number" min="0" value="${s.defaultRemind}"></label>
      <label>Ertalabki brifing vaqti<input data-s="briefingTime" type="time" value="${esc(s.briefingTime)}"></label>
    </section>
    <section>
      <h3>🔔 Eslatmalar</h3>
      <p>${permText}</p>
      <div class="row"><button class="primary" data-a="notify">Ruxsat berish</button><button class="ghost" data-a="test">Sinab ko'rish</button></div>
      <p>Eslatmalar ilova (yoki brauzer) fonda ochiq turganda keladi. Kompyuterda ilovani o'rnatib, yopmasdan qo'yib qo'ying.</p>
    </section>
    <section>
      <h3>🎙 Ovoz</h3>
      <label>Gapirish tili (mikrofon)
        <select data-s="micLang">
          ${[["uz-UZ", "O'zbekcha"], ["ru-RU", "Ruscha"], ["de-DE", "Nemischa"], ["en-US", "Inglizcha"]].map(([v, l]) => `<option value="${v}" ${s.micLang === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
      <label><span><input type="checkbox" data-s="voice" ${s.voice ? "checked" : ""}> Javoblarni ovoz chiqarib o'qish</span></label>
      <label>Ovoz
        <select data-s="voiceName">
          <option value="">${hasUz ? "Avtomatik (o'zbekcha)" : "— o'zbekcha ovoz topilmadi —"}</option>
          ${voices.map((v) => `<option value="${esc(v.name)}" ${s.voiceName === v.name ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")}
        </select>
      </label>
      ${hasUz ? "" : `<p>Qurilmangizda o'zbekcha ovoz yo'q. Turkcha (tr-TR) ovozni tanlasangiz, o'zbekcha matnni ancha tushunarli o'qiydi. Windows'da: Sozlamalar → Vaqt va til → Nutq → Ovoz qo'shish.</p>`}
      <button class="ghost" data-a="voice-test">Ovozni sinash</button>
    </section>
    <section>
      <h3>🤖 Claude</h3>
      <label>Model
        <select data-s="model">
          <option value="claude-opus-5-5" ${s.model === "claude-opus-5-5" ? "selected" : ""}>Claude Opus 5.5 — eng aqlli</option>
          <option value="claude-sonnet-5-5" ${s.model === "claude-sonnet-5-5" ? "selected" : ""}>Claude Sonnet 5.5 — tezroq, 2 barobar arzon</option>
          <option value="claude-haiku-5-5" ${s.model === "claude-haiku-5-5" ? "selected" : ""}>Claude Haiku 5.5 — eng tez va eng arzon</option>
        </select>
      </label>
      <label>API kalit<input data-s="apiKey" type="password" value="${esc(s.apiKey)}" placeholder="sk-ant-..."></label>
      <p>Xarajatni <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> → Usage bo'limida kuzating.</p>
    </section>
    <section>
      <h3>📲 Ilovani o'rnatish</h3>
      <p><b>Windows</b> (Edge/Chrome): manzil satridagi ⊕ "Ilovani o'rnatish" belgisini bosing.<br>
      <b>Android</b> (Chrome): ⋮ menyu → "Ilovani o'rnatish".<br>
      <b>iPhone</b> (Safari): Ulashish ⬆️ → "Bosh ekranga qo'shish".</p>
      ${deferredInstall ? `<button class="primary" data-a="install">Hozir o'rnatish</button>` : ""}
    </section>
    <section>
      <h3>💾 Ma'lumotlar</h3>
      <p>Ma'lumotlar faqat shu qurilmada. Telefon va kompyuterni moslashtirish uchun bu yerda saqlab, boshqa qurilmada yuklang.</p>
      <div class="row"><button class="ghost" data-a="export">⬇️ Saqlash</button><button class="ghost" data-a="import">⬆️ Yuklash</button></div>
      <div class="row" style="margin-top:8px"><button class="ghost" data-a="clear-chat">Suhbatni tozalash</button><button class="danger" data-a="reset">Hammasini o'chirish</button></div>
    </section>
    <section>
      <h3>🧠 Yordamchi eslab qolganlar</h3>
      ${state.memory.length ? state.memory.map((f, i) => `<p>• ${esc(f)} <a href="#" data-forget="${i}">o'chirish</a></p>`).join("") : "<p>Hozircha hech narsa.</p>"}
    </section>`;
}

$("#settings").addEventListener("change", (e) => {
  const k = e.target.dataset.s;
  if (!k) return;
  let v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  if (k === "defaultRemind") v = Math.max(0, Number(v) || 0);
  if (k === "apiKey") v = v.trim();
  state.settings[k] = v;
  save();
  renderChat();
  toast("Saqlandi");
});

$("#settings").addEventListener("click", async (e) => {
  const fg = e.target.closest("[data-forget]");
  if (fg) {
    e.preventDefault();
    state.memory.splice(Number(fg.dataset.forget), 1);
    save();
    return renderSettings();
  }
  const a = e.target.closest("[data-a]")?.dataset.a;
  if (!a) return;
  if (a === "notify") await askNotify();
  if (a === "test") notify("Sinov eslatmasi", "Eslatmalar shunday ko'rinadi 👍", "test");
  if (a === "voice-test") {
    const was = state.settings.voice;
    state.settings.voice = true;
    if (!pickVoice()) toast("Ovoz tanlanmagan. Ro'yxatdan ovoz tanlang.");
    speak("Salom! Men sizning yordamchingizman. Ertaga soat o'n to'rtda uchrashuvingiz bor.");
    state.settings.voice = was;
  }
  if (a === "install" && deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; renderSettings(); }
  if (a === "export") exportData();
  if (a === "import") importData();
  if (a === "clear-chat" && confirm("Suhbat tarixini tozalaymi? Vazifalar qoladi.")) { state.chat = []; save(); renderChat(); }
  if (a === "reset" && confirm("Barcha vazifalar, suhbat va sozlamalar o'chiriladi. Davom etaymi?")) {
    localStorage.removeItem(KEY);
    state = load();
    renderAll();
    closeSheets();
  }
});

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportData() {
  const { apiKey, ...settings } = state.settings; // kalit faylga yozilmaydi
  download(JSON.stringify({ ...state, settings }, null, 2), `yordamchi-${today()}.json`, "application/json");
}
function importData() {
  const inp = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
  inp.onchange = async () => {
    try {
      const d = JSON.parse(await inp.files[0].text());
      if (!Array.isArray(d.tasks)) throw new Error("Bu yordamchi fayli emas");
      if (!confirm(`${d.tasks.length} ta vazifa yuklanadi, hozirgilar almashtiriladi. Davom etaymi?`)) return;
      state = { tasks: d.tasks, memory: d.memory || [], chat: d.chat || [], settings: { ...DEFAULT_SETTINGS, ...d.settings, apiKey: state.settings.apiKey } };
      save();
      renderAll();
      toast("Yuklandi ✔");
    } catch (err) { toast("Xato: " + err.message); }
  };
  inp.click();
}

// ---------- Eslatmalar ----------
async function askNotify() {
  if (!("Notification" in window)) return toast("Bu brauzerda bildirishnoma yo'q.");
  const r = await Notification.requestPermission();
  toast(r === "granted" ? "Eslatmalar yoqildi 🔔" : "Ruxsat berilmadi");
  if (isOpen("settings")) renderSettings();
}

async function notify(title, body, tag) {
  toast(`🔔 ${title}`);
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate([200, 100, 200]);
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body, tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", requireInteraction: true, data: { tag } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, opts);
  } catch { /* oddiy usulga o'tamiz */ }
  try { new Notification(title, opts); } catch { /* Android'da service worker'siz ishlamaydi */ }
}

function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const t of state.tasks) {
    if (t.done || t.notified || t.remind === null || t.remind === undefined || !hasTime(t.due)) continue;
    const due = dueDate(t.due).getTime();
    if (now < due - t.remind * 60000) continue;
    t.notified = true;
    changed = true;
    if (now - due > 3 * 3600e3) continue; // juda eski — endi eslatmaymiz
    const mins = Math.round((due - now) / 60000);
    const when = mins > 0 ? `${mins} daqiqadan keyin (soat ${t.due.slice(11, 16)})` : `hozir (soat ${t.due.slice(11, 16)})`;
    const text = `${t.kind === "uchrashuv" ? "Uchrashuv" : "Eslatma"}: ${t.title} — ${when}.${t.notes ? "\n" + t.notes : ""}`;
    state.chat.push({ role: "reminder", text: "⏰ " + text, ts: now });
    notify(t.title, when + (t.notes ? " · " + t.notes : ""), t.id);
    if (document.visibilityState === "visible") speak(text);
  }
  const s = state.settings;
  const d = new Date();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (s.apiKey && s.briefingTime && s.lastBriefing !== today() && hm >= s.briefingTime && !busy) {
    s.lastBriefing = today();
    changed = true;
    if (document.visibilityState === "visible") {
      send("Ertalabki qisqa brifing ber: bugungi uchrashuvlar va vazifalar vaqt tartibida, muddati o'tganlar va kun uchun bitta foydali maslahat.", "☀️ Ertalabki brifing");
    } else {
      notify(greeting(), localSummary(), "brifing");
    }
  }
  if (changed) { save(); renderChat(); renderTasks(); }
}

// ---------- Ishga tushirish ----------
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; });
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e));
}
window.addEventListener("storage", (e) => { if (e.key === KEY && !busy) { state = load(); renderAll(); } });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !busy) { state = load(); renderAll(); checkReminders(); } });

function renderAll() {
  renderChat();
  renderTasks();
  if (isOpen("settings")) renderSettings();
  if (state.settings.apiKey) setOrb("idle", state.chat.length ? "" : `${greeting()} ${localSummary()}`);
  else setOrb("idle", "Salom! Boshlash uchun API kalitni kiriting.");
}

updateControls();
renderAll();
checkReminders();
setInterval(checkReminders, 20000);
setInterval(() => { if (!busy) renderTasks(); }, 60000);

// Testlar uchun
window.__yordamchi = { get state() { return state; }, runTool, buildContext, send, save };
