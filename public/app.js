// ---------- Date helpers (all local time, no timezones stored) ----------

const pad = (n) => String(n).padStart(2, "0");
const toDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toLocalDateTime = (d) => `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseDateKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const formatTime = (localDateTime) => timeFmt.format(new Date(localDateTime));

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

// ---------- State ----------

const state = {
  events: [],
  cursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected: toDateKey(new Date()),
  history: [],
};

const $ = (id) => document.getElementById(id);

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
  renderMonth();
  renderAgenda();
}

function renderMonth() {
  const { cursor } = state;
  $("month-label").textContent = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const weekdays = $("weekdays");
  if (!weekdays.childElementCount) {
    for (let i = 0; i < 7; i++) {
      const el = document.createElement("div");
      el.textContent = new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: "short" });
      weekdays.append(el);
    }
  }

  const grid = $("grid");
  grid.replaceChildren();
  const first = addDays(cursor, -cursor.getDay());
  const weeks = Math.ceil((cursor.getDay() + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7);
  const todayKey = toDateKey(new Date());

  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(first, i);
    const key = toDateKey(day);
    const cell = document.createElement("div");
    cell.className = "day";
    cell.classList.toggle("outside", day.getMonth() !== cursor.getMonth());
    cell.classList.toggle("today", key === todayKey);
    cell.classList.toggle("selected", key === state.selected);
    cell.dataset.date = key;

    const num = document.createElement("span");
    num.className = "date";
    num.textContent = day.getDate();
    cell.append(num);

    const dayEvents = sortEvents(state.events.filter((ev) => eventOnDay(ev, key)));
    const maxVisible = 3;
    for (const ev of dayEvents.slice(0, maxVisible)) cell.append(chip(ev));
    if (dayEvents.length > maxVisible) {
      const more = document.createElement("span");
      more.className = "more";
      more.textContent = `+${dayEvents.length - maxVisible} more`;
      cell.append(more);
    }

    cell.addEventListener("click", () => {
      state.selected = key;
      render();
    });
    cell.addEventListener("dblclick", () => openDialog(null, key));
    grid.append(cell);
  }
}

function chip(ev) {
  const el = document.createElement("div");
  el.className = `chip${ev.allDay ? " all-day" : ""}`;
  el.dataset.color = ev.color || "blue";
  el.title = ev.title;
  if (!ev.allDay) {
    const t = document.createElement("span");
    t.className = "time";
    t.textContent = formatTime(ev.start);
    el.append(t);
  }
  el.append(ev.title);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    openDialog(ev);
  });
  return el;
}

function renderAgenda() {
  const day = parseDateKey(state.selected);
  $("day-label").textContent = day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const list = $("agenda");
  list.replaceChildren();
  const dayEvents = sortEvents(state.events.filter((ev) => eventOnDay(ev, state.selected)));

  if (!dayEvents.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing scheduled. Double-click a day or ask the assistant to add something.";
    list.append(li);
    return;
  }
  for (const ev of dayEvents) {
    const li = document.createElement("li");
    li.dataset.color = ev.color || "blue";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = ev.title;
    const meta = document.createElement("div");
    meta.className = "meta";
    const when = ev.allDay ? "All day" : `${formatTime(ev.start)} – ${formatTime(ev.end)}`;
    meta.textContent = [when, ev.location].filter(Boolean).join(" · ");
    li.append(title, meta);
    li.addEventListener("click", () => openDialog(ev));
    list.append(li);
  }
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
    input.value = allDay ? value.slice(0, 10) : value.length === 10 ? `${value}T09:00` : value;
  }
}

function openDialog(ev, dayKey) {
  editing = ev;
  form.reset();
  $("form-error").hidden = true;
  $("dialog-title").textContent = ev ? "Edit event" : "New event";
  $("delete-event").hidden = !ev;

  let data = ev;
  if (!data) {
    const base = dayKey ? parseDateKey(dayKey) : parseDateKey(state.selected);
    const now = new Date();
    base.setHours(dayKey ? 9 : Math.min(now.getHours() + 1, 22), 0);
    data = { title: "", start: toLocalDateTime(base), end: toLocalDateTime(new Date(base.getTime() + 3600_000)), allDay: false, location: "", notes: "", color: "blue" };
  }
  form.elements.allDay.checked = data.allDay;
  form.elements.start.type = form.elements.end.type = data.allDay ? "date" : "datetime-local";
  for (const name of ["title", "start", "end", "location", "notes", "color"]) form.elements[name].value = data[name] ?? "";
  dialog.showModal();
  form.elements.title.focus();
}

form.elements.allDay.addEventListener("change", (e) => setAllDayInputs(e.target.checked));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    title: form.elements.title.value,
    allDay: form.elements.allDay.checked,
    start: form.elements.start.value,
    end: form.elements.end.value,
    location: form.elements.location.value,
    notes: form.elements.notes.value,
    color: form.elements.color.value,
  };
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
  if (!editing || !confirm(`Delete “${editing.title}”?`)) return;
  await api(`/api/events/${editing.id}`, { method: "DELETE" });
  dialog.close();
  await refresh();
});

$("cancel-event").addEventListener("click", () => dialog.close());

// ---------- Navigation ----------

function shiftMonth(delta) {
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + delta, 1);
  render();
}
$("prev").addEventListener("click", () => shiftMonth(-1));
$("next").addEventListener("click", () => shiftMonth(1));
$("today").addEventListener("click", () => {
  const now = new Date();
  state.cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  state.selected = toDateKey(now);
  render();
});
$("new-event").addEventListener("click", () => openDialog(null));

// ---------- Assistant chat ----------

const chat = $("chat");

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  chat.append(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

function describeChange({ type, event }) {
  const verb = { create: "Added", update: "Updated", delete: "Removed" }[type];
  const when = event.allDay ? event.start : `${parseDateKey(event.start.slice(0, 10)).toLocaleDateString()} ${formatTime(event.start)}`;
  return `${verb}: ${event.title} (${when})`;
}

$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("chat-input");
  const button = e.target.querySelector("button");
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  addMessage("user", message);
  const pending = addMessage("assistant pending", "Thinking…");
  button.disabled = input.disabled = true;

  try {
    const result = await api("/api/assistant", {
      method: "POST",
      body: {
        message,
        history: state.history,
        now: `${toLocalDateTime(new Date())} (${new Date().toLocaleDateString(undefined, { weekday: "long" })})`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
    pending.className = "msg assistant";
    pending.textContent = result.reply;
    if (result.applied.length) {
      const changes = document.createElement("div");
      changes.className = "changes";
      changes.textContent = result.applied.map(describeChange).join("\n");
      pending.append(changes);
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
    button.disabled = input.disabled = false;
    input.focus();
  }
});

refresh().catch((err) => addMessage("error", `Could not load events: ${err.message}`));
