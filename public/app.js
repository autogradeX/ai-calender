// ---------- Date helpers (all local time, no timezones stored) ----------

const pad = (n) => String(n).padStart(2, "0");
const toDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toLocalDateTime = (d) => `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseDateKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Does the event cover this calendar day?
function eventOnDay(ev, dayKey) {
  const startDay = ev.start.slice(0, 10);
  const endDay = ev.end.slice(0, 10);
  if (ev.allDay) return startDay <= dayKey && dayKey <= endDay;
  // A timed event ending exactly at midnight doesn't spill into the next day.
  const effectiveEnd = ev.end.endsWith("T00:00") && endDay > startDay ? toDateKey(addDays(parseDateKey(endDay), -1)) : endDay;
  return startDay <= dayKey && dayKey <= effectiveEnd;
}

function sortEvents(list) {
  return [...list].sort((a, b) => (b.allDay - a.allDay) || a.start.localeCompare(b.start));
}

// ---------- Language ----------

const STRINGS = {
  hi: {
    appName: "किसान AI कैलेंडर",
    university: "महात्मा गांधी उद्यानिकी एवं वानिकी विश्वविद्यालय, दुर्ग",
    months: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
    weekdays: ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"],
    today: "आज",
    cropPlan: "🌱 फसल योजना",
    newEvent: "+ कार्य जोड़ें",
    learnMore: "और जानें ↗",
    assistant: "🤖 किसान साथी (AI)",
    send: "भेजें",
    chatPlaceholder: "पूछें या कार्य जोड़ें… (बोलने के लिए 🎤)",
    welcome: "राम राम! मैं किसान साथी हूँ। फल, फूल, सब्जी, मसाले या वानिकी के बारे में पूछिए, या कहिए “मेरी टमाटर की फसल का कैलेंडर बनाओ”। मैं ज़रूरी काम आपके कैलेंडर में जोड़ दूँगा।",
    thinking: "सोच रहा हूँ…",
    suggestions: [
      "इस महीने कौन सी सब्जी लगाऊं?",
      "1 एकड़ टमाटर की रोपाई 1 नवंबर को है, पूरा कैलेंडर बना दो",
      "आम के बाग में अभी क्या करना चाहिए?",
      "बागवानी के लिए कौन सी सरकारी योजनाएं हैं?",
    ],
    publicHolidays: "सार्वजनिक अवकाश",
    optionalHolidays: "ऐच्छिक अवकाश",
    thisMonthWork: (m) => `${m} के कृषि कार्य`,
    featured: (name) => `इस माह: ${name}`,
    addToCalendar: "+ कैलेंडर में जोड़ें",
    askAi: "AI से पूछें",
    openPortal: "पोर्टल खोलें ↗",
    remind: "+ रिमाइंडर",
    askTipPrompt: (tip) => `इस सलाह के बारे में विस्तार से बताइए: "${tip}"`,
    askSchemePrompt: (name) => `${name} के बारे में बताइए: कौन पात्र है, क्या लाभ है और आवेदन कैसे करें?`,
    schemeEventTitle: (name) => `योजना: ${name} – जानकारी/आवेदन`,
    nothingScheduled: "इस दिन कोई कार्य नहीं। दिन पर डबल-क्लिक करें या किसान साथी से कहें।",
    allDay: "पूरा दिन",
    title: "कार्य का नाम",
    start: "शुरू",
    end: "समाप्त",
    category: "श्रेणी",
    location: "स्थान / खेत",
    notes: "विवरण",
    save: "सहेजें",
    cancel: "रद्द करें",
    delete: "हटाएं",
    editEvent: "कार्य बदलें",
    newEventTitle: "नया कार्य",
    confirmDelete: (t) => `“${t}” हटाएं?`,
    added: "जोड़ा",
    updated: "बदला",
    removed: "हटाया",
    undo: "↶ वापस लें",
    undone: "बदलाव वापस ले लिए गए।",
    speakOn: "जवाब बोलकर सुनाएं: चालू",
    speakOff: "जवाब बोलकर सुनाएं: बंद",
    cropPlanTitle: "🌱 फसल योजना बनाएं",
    cropPlanHint: "फसल और बुवाई/रोपाई की तारीख बताइए। किसान साथी खाद, सिंचाई, निराई, कीट निगरानी और तुड़ाई के सभी काम तारीख सहित कैलेंडर में जोड़ देगा।",
    crop: "फसल",
    sowDate: "बुवाई / रोपाई तिथि",
    area: "क्षेत्रफल (एकड़)",
    district: "ज़िला",
    makePlan: "योजना बनाएं",
    planPrompt: ({ crop, date, area, district }) =>
      `मेरी फसल योजना बनाइए और सभी मुख्य कार्य कैलेंडर में जोड़िए। फसल: ${crop}, बुवाई/रोपाई तिथि: ${date}, क्षेत्रफल: ${area} एकड़, ज़िला: ${district}।`,
    loadError: "कैलेंडर लोड नहीं हो सका",
    categories: {
      fruit: "फल", flower: "फूल", vegetable: "सब्जी", spice: "मसाले",
      forestry: "वानिकी", scheme: "सरकारी योजनाएं", personal: "व्यक्तिगत",
    },
  },
  en: {
    appName: "Kisan AI Calendar",
    university: "Mahatma Gandhi University of Horticulture and Forestry, Durg",
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    today: "Today",
    cropPlan: "🌱 Crop plan",
    newEvent: "+ Add task",
    learnMore: "Learn more ↗",
    assistant: "🤖 Kisan Saathi (AI)",
    send: "Send",
    chatPlaceholder: "Ask or add a task… (🎤 to speak)",
    welcome: "Hello! I'm Kisan Saathi. Ask me about fruits, flowers, vegetables, spices or forestry, or say “make a calendar for my tomato crop”. I'll add the key tasks to your calendar.",
    thinking: "Thinking…",
    suggestions: [
      "Which vegetables should I plant this month?",
      "I'm transplanting 1 acre of tomato on 1 November, make the full calendar",
      "What should I do in my mango orchard now?",
      "Which government schemes help horticulture farmers?",
    ],
    publicHolidays: "Public holidays",
    optionalHolidays: "Optional holidays",
    thisMonthWork: (m) => `Farm work in ${m}`,
    featured: (name) => `This month: ${name}`,
    addToCalendar: "+ Add to calendar",
    askAi: "Ask AI",
    openPortal: "Open portal ↗",
    remind: "+ Reminder",
    askTipPrompt: (tip) => `Explain this advice in detail: "${tip}"`,
    askSchemePrompt: (name) => `Tell me about ${name}: who is eligible, what are the benefits, and how do I apply?`,
    schemeEventTitle: (name) => `Scheme: ${name} – info/apply`,
    nothingScheduled: "Nothing on this day. Double-click a day or ask Kisan Saathi.",
    allDay: "All day",
    title: "Task",
    start: "Start",
    end: "End",
    category: "Category",
    location: "Place / field",
    notes: "Details",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    editEvent: "Edit task",
    newEventTitle: "New task",
    confirmDelete: (t) => `Delete “${t}”?`,
    added: "Added",
    updated: "Updated",
    removed: "Removed",
    undo: "↶ Undo",
    undone: "Changes undone.",
    speakOn: "Read replies aloud: on",
    speakOff: "Read replies aloud: off",
    cropPlanTitle: "🌱 Make a crop plan",
    cropPlanHint: "Enter the crop and its sowing/transplanting date. Kisan Saathi will add dated tasks for fertilizer, irrigation, weeding, pest checks and harvest to your calendar.",
    crop: "Crop",
    sowDate: "Sowing / transplanting date",
    area: "Area (acres)",
    district: "District",
    makePlan: "Make plan",
    planPrompt: ({ crop, date, area, district }) =>
      `Make a crop plan and add all key tasks to my calendar. Crop: ${crop}, sowing/transplanting date: ${date}, area: ${area} acres, district: ${district}.`,
    loadError: "Could not load the calendar",
    categories: {
      fruit: "Fruits", flower: "Flowers", vegetable: "Vegetables", spice: "Spices",
      forestry: "Forestry", scheme: "Govt schemes", personal: "Personal",
    },
  },
};

const CATEGORY_META = [
  { id: "fruit", emoji: "🥭", crops: { hi: ["आम", "केला", "पपीता", "अमरूद", "नींबू", "आंवला", "कटहल", "सीताफल"], en: ["Mango", "Banana", "Papaya", "Guava", "Lemon", "Aonla", "Jackfruit", "Custard apple"] } },
  { id: "flower", emoji: "🌼", crops: { hi: ["गेंदा", "गुलाब", "गुलदाउदी", "ग्लेडियोलस", "रजनीगंधा", "मोगरा"], en: ["Marigold", "Rose", "Chrysanthemum", "Gladiolus", "Tuberose", "Jasmine"] } },
  { id: "vegetable", emoji: "🥕", crops: { hi: ["टमाटर", "बैंगन", "मिर्च", "फूलगोभी", "पत्तागोभी", "भिंडी", "लौकी", "करेला", "मटर", "आलू", "प्याज"], en: ["Tomato", "Brinjal", "Chilli", "Cauliflower", "Cabbage", "Okra", "Bottle gourd", "Bitter gourd", "Peas", "Potato", "Onion"] } },
  { id: "spice", emoji: "🌶️", crops: { hi: ["हल्दी", "अदरक", "लहसुन", "धनिया", "मेथी", "मिर्च"], en: ["Turmeric", "Ginger", "Garlic", "Coriander", "Fenugreek", "Chilli"] } },
  { id: "forestry", emoji: "🌳", crops: { hi: ["सागौन", "बांस", "नीम", "करंज", "शीशम", "महुआ"], en: ["Teak", "Bamboo", "Neem", "Karanj", "Shisham", "Mahua"] } },
  { id: "scheme", emoji: "📜", crops: { hi: [], en: [] } },
];
const EVENT_CATEGORIES = ["fruit", "flower", "vegetable", "spice", "forestry", "scheme", "personal"];

function loadLang() {
  try {
    return localStorage.getItem("lang") === "en" ? "en" : "hi";
  } catch {
    return "hi";
  }
}

// ---------- State ----------

const now = new Date();
const state = {
  lang: loadLang(),
  events: [],
  knowledge: null,
  cursor: new Date(now.getFullYear(), now.getMonth(), 1),
  selected: toDateKey(now),
  category: "vegetable",
  history: [],
  speak: false,
};
const t = () => STRINGS[state.lang];
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

function holidaysOn(dayKey) {
  return state.knowledge?.calendar.holidays.filter((h) => h.date === dayKey) ?? [];
}

function formatTime(localDateTime) {
  return new Intl.DateTimeFormat(state.lang === "hi" ? "hi-IN" : "en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(localDateTime));
}

function formatDay(dayKey, short = false) {
  const d = parseDateKey(dayKey);
  const date = `${d.getDate()} ${t().months[d.getMonth()]}`;
  if (short) return date;
  return state.lang === "hi" ? `${t().weekdays[d.getDay()]}वार, ${date}` : `${d.toLocaleDateString("en-IN", { weekday: "long" })}, ${date}`;
}

// ---------- API ----------

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function refresh() {
  state.events = await api("/api/events");
  render();
}

// ---------- Rendering ----------

function render() {
  renderStatic();
  renderMonth();
  renderAgenda();
  renderCategories();
  renderAdvisory();
}

function renderStatic() {
  document.documentElement.lang = state.lang;
  document.title = t().appName;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const value = t()[node.dataset.i18n];
    if (typeof value === "string") node.textContent = value;
  }
  $("lang-toggle").textContent = state.lang === "hi" ? "English" : "हिंदी";
  $("chat-input").placeholder = t().chatPlaceholder;
  $("speak-toggle").textContent = state.speak ? "🔊" : "🔈";
  $("speak-toggle").title = state.speak ? t().speakOn : t().speakOff;
  $("speak-toggle").setAttribute("aria-pressed", String(state.speak));

  const selects = [$("category-select"), $("plan-category")];
  for (const select of selects) {
    const value = select.value;
    const ids = select.id === "plan-category" ? EVENT_CATEGORIES.slice(0, 5) : EVENT_CATEGORIES;
    select.replaceChildren(...ids.map((id) => el("option", { value: id, textContent: t().categories[id] })));
    if (value) select.value = value;
  }

  const suggestions = $("suggestions");
  suggestions.replaceChildren(
    ...t().suggestions.map((text) => {
      const b = el("button", { type: "button", textContent: text });
      b.addEventListener("click", () => sendMessage(text));
      return b;
    }),
  );

  const k = state.knowledge;
  if (k) {
    $("podcast-label").textContent = k.calendar.podcast[state.lang];
    $("podcast").href = k.calendar.university.infoUrl;
  }
}

function renderMonth() {
  const { cursor } = state;
  const monthNo = cursor.getMonth() + 1;
  $("month-label").textContent = t().months[cursor.getMonth()];
  $("year-badge").textContent = cursor.getFullYear();
  const k = state.knowledge;
  $("hindu-months").textContent = k && cursor.getFullYear() === k.calendar.year ? k.calendar.hinduMonths[monthNo] : "";
  const featured = k?.advisory.months[monthNo]?.featured;
  $("featured").hidden = !featured;
  if (featured) {
    $("featured-emoji").textContent = featured.emoji;
    $("featured-label").textContent = t().featured(featured[state.lang]);
  }

  const weekdays = $("weekdays");
  weekdays.replaceChildren(
    ...t().weekdays.map((name, i) => el("div", { className: i === 0 || i === 6 ? "weekend" : "", textContent: name })),
  );

  const grid = $("grid");
  grid.replaceChildren();
  const first = addDays(cursor, -cursor.getDay());
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((cursor.getDay() + daysInMonth) / 7);
  const todayKey = toDateKey(new Date());

  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(first, i);
    const key = toDateKey(day);
    const holidays = holidaysOn(key);
    const isPublic = holidays.some((h) => h.type === "public");
    const cell = el("div", { className: "day" });
    cell.classList.toggle("outside", day.getMonth() !== cursor.getMonth());
    cell.classList.toggle("today", key === todayKey);
    cell.classList.toggle("selected", key === state.selected);
    // Like the printed calendar: Sundays, Saturdays and public holidays in red.
    cell.classList.toggle("red", day.getDay() === 0 || day.getDay() === 6 || isPublic);
    cell.classList.toggle("optional", holidays.length > 0 && !isPublic);
    cell.dataset.date = key;
    cell.append(el("span", { className: "date", textContent: day.getDate() }));
    if (holidays.length && day.getMonth() === cursor.getMonth()) {
      cell.append(el("span", { className: "holiday-name", textContent: holidays.map((h) => h[state.lang]).join(", ") }));
    }

    const dayEvents = sortEvents(state.events.filter((ev) => eventOnDay(ev, key)));
    const maxVisible = 3;
    for (const ev of dayEvents.slice(0, maxVisible)) cell.append(chip(ev));
    if (dayEvents.length > maxVisible) cell.append(el("span", { className: "more", textContent: `+${dayEvents.length - maxVisible}` }));

    cell.addEventListener("click", () => {
      state.selected = key;
      render();
    });
    cell.addEventListener("dblclick", () => openEventDialog(null, key));
    grid.append(cell);
  }

  renderHolidayNotes();
}

function renderHolidayNotes() {
  const k = state.knowledge;
  const box = $("holiday-notes");
  box.replaceChildren();
  if (!k) return;
  const prefix = `${state.cursor.getFullYear()}-${pad(state.cursor.getMonth() + 1)}`;
  const inMonth = k.calendar.holidays.filter((h) => h.date.startsWith(prefix));
  for (const type of ["optional", "public"]) {
    const list = inMonth.filter((h) => h.type === type);
    if (!list.length) continue;
    const label = type === "public" ? t().publicHolidays : t().optionalHolidays;
    const text = list.map((h) => `${Number(h.date.slice(8))} : ${h[state.lang]}`).join(", ");
    box.append(el("div", { className: type }, el("b", { textContent: `${label}: ` }), text));
  }
}

function chip(ev) {
  const node = el("div", { className: `chip${ev.allDay ? " all-day" : ""}`, title: ev.title });
  node.dataset.cat = ev.category || "personal";
  if (!ev.allDay) node.append(el("span", { className: "time", textContent: formatTime(ev.start) }));
  node.append(ev.title);
  node.addEventListener("click", (e) => {
    e.stopPropagation();
    openEventDialog(ev);
  });
  return node;
}

function renderAgenda() {
  $("day-label").textContent = formatDay(state.selected);
  const list = $("agenda");
  list.replaceChildren();
  for (const h of holidaysOn(state.selected)) {
    list.append(el("li", { className: "holiday" },
      el("div", { className: "title", textContent: h[state.lang] }),
      el("div", { className: "meta", textContent: h.type === "public" ? t().publicHolidays : t().optionalHolidays })));
  }
  const dayEvents = sortEvents(state.events.filter((ev) => eventOnDay(ev, state.selected)));
  if (!dayEvents.length && !list.childElementCount) {
    list.append(el("li", { className: "empty", textContent: t().nothingScheduled }));
    return;
  }
  for (const ev of dayEvents) {
    const when = ev.allDay ? t().allDay : `${formatTime(ev.start)} – ${formatTime(ev.end)}`;
    const li = el("li", {},
      el("div", { className: "title", textContent: ev.title }),
      el("div", { className: "meta", textContent: [t().categories[ev.category] ?? "", when, ev.location].filter(Boolean).join(" · ") }));
    li.dataset.cat = ev.category || "personal";
    if (ev.notes) li.append(el("div", { className: "meta", textContent: ev.notes }));
    li.addEventListener("click", () => openEventDialog(ev));
    list.append(li);
  }
}

function renderCategories() {
  const row = $("category-row");
  row.replaceChildren(
    ...CATEGORY_META.map(({ id, emoji }) => {
      const tile = el("button", { type: "button", className: `cat-tile${state.category === id ? " active" : ""}` },
        el("span", { className: "emoji", textContent: emoji }),
        el("span", { className: "label", textContent: t().categories[id] }));
      tile.dataset.cat = id;
      tile.addEventListener("click", () => selectCategory(id, true));
      return tile;
    }),
  );
}

function selectCategory(id, scroll) {
  state.category = id;
  renderCategories();
  renderAdvisory();
  if (scroll && window.matchMedia("(max-width: 1000px)").matches) {
    document.querySelector(".advisory-panel").scrollIntoView({ behavior: "smooth" });
  }
}

function renderAdvisory() {
  const k = state.knowledge;
  if (!k) return;
  const monthNo = state.cursor.getMonth() + 1;
  $("advisory-title").textContent = t().thisMonthWork(t().months[monthNo - 1]);
  $("advisory-more").href = k.calendar.podcast.links[state.category] || k.calendar.university.infoUrl;

  const tabs = $("advisory-tabs");
  tabs.replaceChildren(
    ...CATEGORY_META.map(({ id, emoji }) => {
      const b = el("button", { type: "button", role: "tab", textContent: `${emoji} ${t().categories[id]}` });
      b.dataset.cat = id;
      b.setAttribute("aria-selected", String(state.category === id));
      b.addEventListener("click", () => selectCategory(id, false));
      return b;
    }),
  );

  const list = $("advisory-list");
  list.replaceChildren();
  if (state.category === "scheme") {
    for (const sc of k.schemes.schemes) {
      const li = el("li", {},
        el("div", { className: "scheme-name", textContent: sc[state.lang] }),
        el("div", { className: "scheme-benefit", textContent: state.lang === "hi" ? sc.benefitHi : sc.benefitEn }),
        tipActions([
          [t().openPortal, () => window.open(sc.url, "_blank", "noopener")],
          [t().askAi, () => sendMessage(t().askSchemePrompt(sc[state.lang]))],
          [t().remind, () => addQuickTask(t().schemeEventTitle(sc[state.lang]), "scheme", sc.url)],
        ]));
      li.dataset.cat = "scheme";
      list.append(li);
    }
    return;
  }
  for (const tip of k.advisory.months[monthNo][state.category]) {
    const text = tip[state.lang];
    const li = el("li", {},
      el("div", { textContent: text }),
      tipActions([
        [t().addToCalendar, () => addQuickTask(text, state.category, "")],
        [t().askAi, () => sendMessage(t().askTipPrompt(text))],
      ]));
    li.dataset.cat = state.category;
    list.append(li);
  }
}

function tipActions(actions) {
  return el("div", { className: "tip-actions" },
    ...actions.map(([label, fn]) => {
      const b = el("button", { type: "button", className: "link-btn", textContent: label });
      b.addEventListener("click", fn);
      return b;
    }));
}

// Add an all-day task on the selected day, then open it so the farmer can adjust.
async function addQuickTask(title, category, notes) {
  const shortTitle = title.length > 80 ? `${title.slice(0, 77)}…` : title;
  const ev = await api("/api/events", {
    method: "POST",
    body: { title: shortTitle, notes: title === shortTitle ? notes : `${title}\n${notes}`.trim(), category, allDay: true, start: state.selected, end: state.selected },
  });
  await refresh();
  openEventDialog(ev);
}

// ---------- Event dialog ----------

const dialog = $("event-dialog");
const form = $("event-form");
let editing = null;

function setAllDayInputs(allDay) {
  for (const name of ["start", "end"]) {
    const input = form.elements[name];
    const value = input.value;
    input.type = allDay ? "date" : "datetime-local";
    input.value = allDay ? value.slice(0, 10) : value.length === 10 ? `${value}T${name === "start" ? "09" : "10"}:00` : value;
  }
}

function openEventDialog(ev, dayKey) {
  editing = ev;
  form.reset();
  $("form-error").hidden = true;
  $("dialog-title").textContent = ev ? t().editEvent : t().newEventTitle;
  $("delete-event").hidden = !ev;

  let data = ev;
  if (!data) {
    const base = parseDateKey(dayKey || state.selected);
    base.setHours(9, 0);
    data = { title: "", start: toLocalDateTime(base), end: toLocalDateTime(new Date(base.getTime() + 3600_000)), allDay: false, location: "", notes: "", category: state.category === "scheme" ? "scheme" : state.category };
  }
  form.elements.allDay.checked = data.allDay;
  form.elements.start.type = form.elements.end.type = data.allDay ? "date" : "datetime-local";
  for (const name of ["title", "start", "end", "location", "notes", "category"]) form.elements[name].value = data[name] ?? "";
  dialog.showModal();
  form.elements.title.focus();
}

form.elements.allDay.addEventListener("change", (e) => setAllDayInputs(e.target.checked));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(["title", "start", "end", "location", "notes", "category"].map((n) => [n, form.elements[n].value]));
  body.allDay = form.elements.allDay.checked;
  try {
    if (editing) await api(`/api/events/${editing.id}`, { method: "PUT", body });
    else await api("/api/events", { method: "POST", body });
    dialog.close();
    state.selected = body.start.slice(0, 10);
    await refresh();
  } catch (err) {
    $("form-error").textContent = err.message;
    $("form-error").hidden = false;
  }
});

$("delete-event").addEventListener("click", async () => {
  if (!editing || !confirm(t().confirmDelete(editing.title))) return;
  await api(`/api/events/${editing.id}`, { method: "DELETE" });
  dialog.close();
  await refresh();
});
$("cancel-event").addEventListener("click", () => dialog.close());

// ---------- Crop plan dialog ----------

const planDialog = $("plan-dialog");
const planForm = $("plan-form");

function fillCropOptions() {
  const meta = CATEGORY_META.find((c) => c.id === planForm.elements.category.value) ?? CATEGORY_META[0];
  $("crop-options").replaceChildren(...meta.crops[state.lang].map((c) => el("option", { value: c })));
}

$("crop-plan-btn").addEventListener("click", () => {
  planForm.elements.category.value = ["fruit", "flower", "vegetable", "spice", "forestry"].includes(state.category) ? state.category : "vegetable";
  planForm.elements.crop.value = "";
  planForm.elements.date.value = state.selected;
  fillCropOptions();
  planDialog.showModal();
  planForm.elements.crop.focus();
});
planForm.elements.category.addEventListener("change", fillCropOptions);
$("cancel-plan").addEventListener("click", () => planDialog.close());
planForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = planForm.elements;
  planDialog.close();
  const d = parseDateKey(f.date.value);
  const date = state.lang === "hi" ? `${d.getDate()} ${t().months[d.getMonth()]} ${d.getFullYear()}` : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  sendMessage(t().planPrompt({ crop: f.crop.value.trim(), date, area: f.area.value || 1, district: f.district.value.trim() || "दुर्ग" }));
});

// ---------- Navigation ----------

function shiftMonth(delta) {
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + delta, 1);
  render();
}
$("prev").addEventListener("click", () => shiftMonth(-1));
$("next").addEventListener("click", () => shiftMonth(1));
$("today").addEventListener("click", () => {
  const today = new Date();
  state.cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  state.selected = toDateKey(today);
  render();
});
$("new-event").addEventListener("click", () => openEventDialog(null));
$("lang-toggle").addEventListener("click", () => {
  state.lang = state.lang === "hi" ? "en" : "hi";
  try {
    localStorage.setItem("lang", state.lang);
  } catch {
    // Storage unavailable (private mode); the choice lasts for this visit.
  }
  if (recognition) recognition.lang = state.lang === "hi" ? "hi-IN" : "en-IN";
  render();
});

// ---------- Assistant chat ----------

const chat = $("chat");

function addMessage(role, text) {
  const node = el("div", { className: `msg ${role}`, textContent: text });
  chat.append(node);
  chat.scrollTop = chat.scrollHeight;
  return node;
}

function describeChange({ type, event }) {
  const verb = { create: t().added, update: t().updated, delete: t().removed }[type];
  const day = formatDay(event.start.slice(0, 10), true);
  const when = event.allDay ? day : `${day} ${formatTime(event.start)}`;
  return `${verb}: ${event.title} (${when})`;
}

// Reverse an assistant change set, newest first.
async function undoChanges(applied) {
  for (const change of [...applied].reverse()) {
    if (change.type === "create") await api(`/api/events/${change.event.id}`, { method: "DELETE" }).catch(() => {});
    else if (change.type === "update") await api(`/api/events/${change.before.id}`, { method: "PUT", body: change.before });
    else await api("/api/events", { method: "POST", body: change.before });
  }
  await refresh();
}

function speak(text) {
  if (!state.speak || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = state.lang === "hi" ? "hi-IN" : "en-IN";
  speechSynthesis.speak(utterance);
}

let busy = false;
async function sendMessage(message) {
  if (busy || !message.trim()) return;
  busy = true;
  const input = $("chat-input");
  const button = $("chat-form").querySelector("button[type=submit]");
  input.value = "";
  $("suggestions").hidden = true;
  addMessage("user", message);
  const pending = addMessage("bot pending", t().thinking);
  button.disabled = input.disabled = true;
  if (window.matchMedia("(max-width: 1000px)").matches) document.querySelector(".assistant-panel").scrollIntoView({ behavior: "smooth" });

  try {
    const result = await api("/api/assistant", {
      method: "POST",
      body: {
        message,
        history: state.history,
        now: `${toLocalDateTime(new Date())} (${new Date().toLocaleDateString("en-IN", { weekday: "long" })})`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: state.lang,
      },
    });
    pending.className = "msg bot";
    pending.textContent = result.reply;
    speak(result.reply);
    if (result.applied.length) {
      pending.append(el("div", { className: "changes", textContent: result.applied.map(describeChange).join("\n") }));
      const undo = el("button", { type: "button", className: "link-btn undo", textContent: t().undo });
      undo.addEventListener("click", async () => {
        undo.disabled = true;
        await undoChanges(result.applied);
        undo.replaceWith(el("div", { className: "changes", textContent: t().undone }));
      });
      pending.append(undo);
    }
    state.history.push({ role: "user", content: message }, { role: "assistant", content: result.reply });
    state.events = result.events;

    // Jump to the first event the assistant created or changed.
    const touched = result.applied.find((a) => a.type !== "delete");
    if (touched) {
      const d = parseDateKey(touched.event.start.slice(0, 10));
      state.selected = toDateKey(d);
      state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    render();
  } catch (err) {
    pending.className = "msg error";
    pending.textContent = err.message;
  } finally {
    busy = false;
    button.disabled = input.disabled = false;
    input.focus();
  }
}

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage($("chat-input").value.trim());
});

$("speak-toggle").addEventListener("click", () => {
  state.speak = !state.speak;
  if (!state.speak && "speechSynthesis" in window) speechSynthesis.cancel();
  renderStatic();
});

// Voice input: many farmers find speaking easier than typing.
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = state.lang === "hi" ? "hi-IN" : "en-IN";
  recognition.interimResults = false;
  const mic = $("mic");
  mic.hidden = false;
  recognition.addEventListener("result", (e) => {
    $("chat-input").value = e.results[0][0].transcript;
  });
  recognition.addEventListener("end", () => {
    mic.classList.remove("listening");
    const text = $("chat-input").value.trim();
    if (text) sendMessage(text);
  });
  recognition.addEventListener("error", () => mic.classList.remove("listening"));
  mic.addEventListener("click", () => {
    if (mic.classList.contains("listening")) return recognition.stop();
    $("chat-input").value = "";
    mic.classList.add("listening");
    recognition.start();
  });
}

// ---------- Start ----------

(async () => {
  renderStatic();
  addMessage("bot", t().welcome);
  try {
    state.knowledge = await api("/api/knowledge");
    await refresh();
  } catch (err) {
    addMessage("error", `${t().loadError}: ${err.message}`);
  }
})();
