import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { AzureOpenAI, APIError, AuthenticationError, BadRequestError, NotFoundError, RateLimitError } from "openai";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const KNOWLEDGE_DIR = path.join(here, "knowledge");
const DATA_FILE = process.env.DATA_FILE || path.join(here, "data", "events.json");
const PORT = Number(process.env.PORT) || 3000;
// Azure OpenAI: the deployment must be a model that supports structured outputs
// (for example gpt-4o 2024-08-06 or later, gpt-4.1, gpt-5).
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const AZURE_API_VERSION = process.env.OPENAI_API_VERSION || "2024-10-21";

// Farm knowledge shipped with the app: holidays, month-wise advisory, schemes.
const readKnowledge = async (name) => JSON.parse(await fs.readFile(path.join(KNOWLEDGE_DIR, name), "utf8"));
const KNOWLEDGE = {
  calendar: await readKnowledge("calendar-2026.json"),
  advisory: await readKnowledge("advisory.json"),
  schemes: await readKnowledge("schemes.json"),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};

// ---------- Event store (a JSON file on disk) ----------

// Events use local, timezone-less timestamps: "YYYY-MM-DDTHH:mm".
// All-day events use "YYYY-MM-DD" for start/end (end inclusive).
async function loadEvents() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function saveEvents(events) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(events, null, 2));
  await fs.rename(tmp, DATA_FILE);
}

// Serialize read-modify-write cycles so concurrent requests can't clobber each other.
let storeQueue = Promise.resolve();
function withStore(fn) {
  const run = storeQueue.then(async () => {
    const events = await loadEvents();
    const { save, value } = await fn(events);
    if (save) await saveEvents(events);
    return value;
  });
  storeQueue = run.catch(() => {});
  return run;
}

// Each event belongs to a horticulture category (matches the wall calendar's QR row).
const CATEGORIES = ["fruit", "flower", "vegetable", "spice", "forestry", "scheme", "personal"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function normalizeEvent(input, existing = {}) {
  const ev = {
    id: existing.id || restoredId(input.id) || crypto.randomUUID(),
    title: String(input.title ?? existing.title ?? "").trim(),
    start: input.start ?? existing.start,
    end: input.end ?? existing.end,
    allDay: Boolean(input.allDay ?? existing.allDay ?? false),
    location: String(input.location ?? existing.location ?? "").trim(),
    notes: String(input.notes ?? existing.notes ?? "").trim(),
    category: CATEGORIES.includes(input.category) ? input.category : existing.category ?? "personal",
  };
  if (!ev.title) throw new HttpError(400, "Event title is required");
  const re = ev.allDay ? DATE_RE : DATETIME_RE;
  if (ev.allDay) {
    ev.start = String(ev.start ?? "").slice(0, 10);
    ev.end = String(ev.end ?? ev.start).slice(0, 10);
  } else {
    // A timed event given only a date (e.g. switched off "all day") starts at 9am.
    if (DATE_RE.test(ev.start ?? "")) ev.start += "T09:00";
    if (DATE_RE.test(ev.end ?? "")) ev.end = ev.end === ev.start.slice(0, 10) ? `${ev.end}T10:00` : `${ev.end}T18:00`;
  }
  if (!re.test(ev.start ?? "")) throw new HttpError(400, `Invalid start: ${ev.start}`);
  if (!ev.end) ev.end = ev.start;
  if (!re.test(ev.end)) throw new HttpError(400, `Invalid end: ${ev.end}`);
  if (ev.end < ev.start) throw new HttpError(400, "End must not be before start");
  return ev;
}

// Lets undo re-create a deleted event under its original id.
function restoredId(id) {
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

// ---------- AI assistant (Azure OpenAI) ----------

const NOT_CONFIGURED =
  "AI सहायक चालू नहीं है। Azure OpenAI सेटिंग्स जोड़ें। / AI assistant is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT.";

let client = null;
function getClient() {
  if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_API_KEY || !AZURE_DEPLOYMENT) {
    throw new HttpError(503, NOT_CONFIGURED);
  }
  if (!client) client = new AzureOpenAI({ apiVersion: AZURE_API_VERSION, deployment: AZURE_DEPLOYMENT });
  return client;
}

const schemeList = KNOWLEDGE.schemes.schemes.map((sc) => `- ${sc.hi} / ${sc.en}: ${sc.benefitEn} (${sc.url})`).join("\n");

const SYSTEM_PROMPT = `You are "Kisan Saathi" (किसान साथी), the AI assistant inside a farm calendar published by ${KNOWLEDGE.calendar.university.en} (${KNOWLEDGE.calendar.university.hi}), Durg, Chhattisgarh.
Your users are farmers and growers of horticulture crops: fruits (फल), flowers (फूल), vegetables (सब्जी), spices (मसाले), forestry/agroforestry (वानिकी), and people looking for government schemes (सरकारी योजनाएं).
You help them plan and remember farm work on their calendar and answer practical crop questions for Chhattisgarh conditions (hot summers, monsoon June-September, mild winters with occasional frost; kharif, rabi and zaid seasons).

Language:
- Reply in the language the farmer writes in. Default to simple Hindi (Devanagari) that a village farmer understands; Chhattisgarhi words are welcome. Use English only if the farmer writes in English.
- Write event titles and notes in the same language as your reply.

Calendar rules:
- Resolve relative dates ("कल", "अगले सोमवार", "15 दिन बाद") against the current date given in the request.
- Timed events use "YYYY-MM-DDTHH:mm" (24h, local time). Field work without a set time is an all-day event: allDay=true with "YYYY-MM-DD" dates, end inclusive.
- Give every event a category: fruit, flower, vegetable, spice, forestry, scheme (scheme deadlines and applications), or personal.
- To change or remove an existing event, use its exact id from the calendar listing. Never invent ids.
- Only create, update, or delete events when the farmer asks you to add, plan, schedule, remind, move or remove something. For questions, answer and return no actions.
- When the farmer asks for a crop plan ("टमाटर की खेती का कैलेंडर बनाओ"), create a dated schedule of the key operations from that crop's sowing or transplanting date: land preparation, nursery, sowing/transplanting, fertilizer doses, irrigation rhythm, weeding, pest and disease checks, staking/pruning where relevant, and harvest. Usually 6-15 events. Put the practical detail (quantities per acre, method) in notes. If the crop, date or area is missing, ask one short question first.
- Mention any clash with holidays or existing events.

Advice rules:
- Base advice on standard recommendations for Chhattisgarh. Prefer integrated pest management, organic options and safe practices. When you mention a chemical, give the common name and dose, and remind them to follow the label and the safety waiting period before harvest.
- For anything uncertain or serious (unknown disease, heavy losses, exact chemical choice), suggest contacting the nearest Krishi Vigyan Kendra, the district horticulture officer (उद्यान अधिकारी), or MGUVV scientists.
- For schemes, only describe the schemes listed below or other real, well-known government schemes. Do not invent amounts, eligibility or deadlines; tell them to confirm on the official portal or at the district horticulture office.

Reply style: short and warm, 1-5 sentences, plain text without markdown. For crop plans, summarise the plan in a few lines; the details go into the events.

Government schemes you can refer to:
${schemeList}`;

const nullableString = { type: ["string", "null"] };

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Message shown to the user." },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["create", "update", "delete"] },
          id: { ...nullableString, description: "Existing event id for update/delete; null for create." },
          title: nullableString,
          start: nullableString,
          end: nullableString,
          allDay: { type: ["boolean", "null"] },
          location: nullableString,
          notes: nullableString,
          category: { anyOf: [{ type: "string", enum: CATEGORIES }, { type: "null" }] },
        },
        required: ["type", "id", "title", "start", "end", "allDay", "location", "notes", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "actions"],
  additionalProperties: false,
};

// Keep the prompt bounded: recent and upcoming events only.
const MAX_CONTEXT_EVENTS = 300;

function describeCalendar(events, today) {
  const cutoff = shiftDate(today, -30);
  const relevant = events.filter((e) => e.end.slice(0, 10) >= cutoff);
  if (relevant.length === 0) return "(no events)";
  return relevant
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, MAX_CONTEXT_EVENTS)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => {
      const when = e.allDay ? `${e.start} to ${e.end} (all day)` : `${e.start} to ${e.end}`;
      const extras = [e.location && `at ${e.location}`, e.notes && `notes: ${e.notes}`].filter(Boolean).join("; ");
      return `- id=${e.id} | [${e.category}] ${e.title} | ${when}${extras ? ` | ${extras}` : ""}`;
    })
    .join("\n");
}

function shiftDate(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function describeSeason(today) {
  const month = Number(today.slice(5, 7));
  const lines = [];
  for (const m of [month, (month % 12) + 1]) {
    const adv = KNOWLEDGE.advisory.months[m];
    const label = m === month ? "This month" : "Next month";
    lines.push(`${label} (${m}):`);
    for (const cat of ["fruit", "flower", "vegetable", "spice", "forestry"]) {
      for (const tip of adv[cat]) lines.push(`  [${cat}] ${tip.en}`);
    }
  }
  const upcoming = KNOWLEDGE.calendar.holidays
    .filter((h) => h.date >= today && h.date <= shiftDate(today, 60))
    .map((h) => `  ${h.date} ${h.hi} (${h.type === "public" ? "public holiday" : "optional holiday"})`);
  if (upcoming.length) lines.push("Holidays in the next 60 days:", ...upcoming);
  return lines.join("\n");
}

const REFUSAL_REPLY = "माफ़ कीजिए, मैं इस अनुरोध में मदद नहीं कर सकता। / Sorry, I can't help with that request.";

async function askAssistant({ message, history, now, timezone, language }) {
  const events = await loadEvents();
  const today = /^\d{4}-\d{2}-\d{2}/.test(now) ? now.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const context = `Current local date/time: ${now} (${timezone}). App language: ${language === "en" ? "English" : "Hindi"}.

University advisory for the season:
${describeSeason(today)}

The farmer's calendar:
${describeCalendar(events, today)}`;

  // Keep the last few turns so follow-ups ("make it 3pm instead") work.
  const priorTurns = (Array.isArray(history) ? history : [])
    .slice(-10)
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content)
    .map((t) => ({ role: t.role, content: t.content }));

  const completion = await getClient().chat.completions.create({
    model: AZURE_DEPLOYMENT,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...priorTurns,
      { role: "user", content: `${context}\n\nUser request: ${message}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "calendar_reply", strict: true, schema: RESPONSE_SCHEMA },
    },
  });

  const choice = completion.choices[0];
  if (!choice || choice.finish_reason === "content_filter" || choice.message.refusal) {
    return { reply: REFUSAL_REPLY, applied: [], events };
  }
  if (choice.finish_reason === "length") {
    throw new HttpError(502, "जवाब अधूरा रह गया, कृपया छोटा अनुरोध करें। / The response was cut off. Please try a shorter request.");
  }

  const text = choice.message.content ?? "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(502, "The assistant returned an unreadable response.");
  }

  // Re-read the store so edits made while the model was thinking are not lost.
  const { applied, errors, events: updated } = await withStore((current) => {
    const result = applyActions(current, parsed.actions ?? []);
    return { save: result.applied.length > 0, value: { ...result, events: current } };
  });
  let reply = parsed.reply;
  if (errors.length) reply += `\n(कुछ बदलाव लागू नहीं हो सके / Some changes could not be applied: ${errors.join("; ")})`;
  return { reply, applied, events: updated };
}

function applyActions(events, actions) {
  const applied = [];
  const errors = [];
  for (const action of actions) {
    try {
      const fields = Object.fromEntries(
        Object.entries(action).filter(([k, v]) => v !== null && k !== "type" && k !== "id"),
      );
      if (action.type === "create") {
        const ev = normalizeEvent({ ...fields, id: undefined });
        events.push(ev);
        applied.push({ type: "create", event: ev });
      } else {
        const idx = events.findIndex((e) => e.id === action.id);
        if (idx === -1) throw new Error(`no event with id ${action.id}`);
        if (action.type === "delete") {
          const [removed] = events.splice(idx, 1);
          applied.push({ type: "delete", event: removed, before: removed });
        } else {
          const before = events[idx];
          events[idx] = normalizeEvent(fields, before);
          applied.push({ type: "update", event: events[idx], before });
        }
      }
    } catch (err) {
      errors.push(err.message);
    }
  }
  return { applied, errors };
}

// ---------- HTTP plumbing ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new HttpError(413, "Request body too large");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, "Forbidden");
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      // Revalidate on every load so app updates (and the service worker) reach phones quickly.
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    throw new HttpError(404, "Not found");
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;

  if (pathname === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/knowledge" && req.method === "GET") {
    return sendJson(res, 200, KNOWLEDGE);
  }
  if (pathname === "/api/events" && req.method === "GET") {
    return sendJson(res, 200, await loadEvents());
  }
  if (pathname === "/api/events" && req.method === "POST") {
    const input = await readJson(req);
    const ev = await withStore((events) => {
      if (input.id && events.some((e) => e.id === input.id)) throw new HttpError(409, "Event already exists");
      const created = normalizeEvent(input);
      events.push(created);
      return { save: true, value: created };
    });
    return sendJson(res, 201, ev);
  }
  const match = pathname.match(/^\/api\/events\/([\w-]+)$/);
  if (match && (req.method === "PUT" || req.method === "DELETE")) {
    const input = req.method === "PUT" ? await readJson(req) : null;
    const ev = await withStore((events) => {
      const idx = events.findIndex((e) => e.id === match[1]);
      if (idx === -1) throw new HttpError(404, "Event not found");
      if (!input) {
        events.splice(idx, 1);
        return { save: true, value: null };
      }
      events[idx] = normalizeEvent(input, events[idx]);
      return { save: true, value: events[idx] };
    });
    if (!ev) {
      res.writeHead(204);
      return res.end();
    }
    return sendJson(res, 200, ev);
  }
  if (pathname === "/api/assistant" && req.method === "POST") {
    const body = await readJson(req);
    if (!body.message || typeof body.message !== "string") throw new HttpError(400, "message is required");
    const result = await askAssistant({
      message: body.message.slice(0, 4000),
      history: body.history,
      now: body.now || new Date().toISOString(),
      timezone: body.timezone || "Asia/Kolkata",
      language: body.language,
    });
    return sendJson(res, 200, result);
  }
  if (pathname.startsWith("/api/")) throw new HttpError(404, "Not found");
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  return serveStatic(req, res, pathname);
}

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    let status = err instanceof HttpError ? err.status : 500;
    let message = err instanceof HttpError ? err.message : "Internal server error";
    if (err instanceof AuthenticationError || err instanceof NotFoundError) {
      // 401: wrong key; 404: wrong endpoint or deployment name.
      status = 503;
      message = NOT_CONFIGURED;
    } else if (err instanceof RateLimitError) {
      status = 429;
      message = "AI सहायक व्यस्त है, थोड़ी देर बाद कोशिश करें। / The AI assistant is busy. Please try again in a moment.";
    } else if (err instanceof BadRequestError && err.code === "content_filter") {
      // Azure's content filter blocked the prompt itself.
      if (!res.headersSent) sendJson(res, 200, { reply: REFUSAL_REPLY, applied: [], events: await loadEvents() });
      return;
    } else if (err instanceof APIError) {
      status = 502;
      message = `AI assistant error: ${err.message}`;
    }
    if (status >= 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Kisan AI Calendar running at http://localhost:${PORT}`);
});

// Cloud Run sends SIGTERM before stopping an instance; let in-flight writes finish.
process.on("SIGTERM", () => {
  server.close(() => storeQueue.finally(() => process.exit(0)));
});
