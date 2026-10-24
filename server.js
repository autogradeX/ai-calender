import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const DATA_FILE = process.env.DATA_FILE || path.join(here, "data", "events.json");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
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

const COLORS = ["blue", "green", "purple", "orange", "red"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function normalizeEvent(input, existing = {}) {
  const ev = {
    id: existing.id || crypto.randomUUID(),
    title: String(input.title ?? existing.title ?? "").trim(),
    start: input.start ?? existing.start,
    end: input.end ?? existing.end,
    allDay: Boolean(input.allDay ?? existing.allDay ?? false),
    location: String(input.location ?? existing.location ?? "").trim(),
    notes: String(input.notes ?? existing.notes ?? "").trim(),
    color: COLORS.includes(input.color) ? input.color : existing.color ?? "blue",
  };
  if (!ev.title) throw new HttpError(400, "Event title is required");
  const re = ev.allDay ? DATE_RE : DATETIME_RE;
  if (ev.allDay) {
    ev.start = String(ev.start ?? "").slice(0, 10);
    ev.end = String(ev.end ?? ev.start).slice(0, 10);
  }
  if (!re.test(ev.start ?? "")) throw new HttpError(400, `Invalid start: ${ev.start}`);
  if (!ev.end) ev.end = ev.start;
  if (!re.test(ev.end)) throw new HttpError(400, `Invalid end: ${ev.end}`);
  if (ev.end < ev.start) throw new HttpError(400, "End must not be before start");
  return ev;
}

// ---------- Claude assistant ----------

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM_PROMPT = `You are the scheduling assistant inside a personal calendar app.
The user talks to you in natural language. You can read their calendar and propose changes to it.

Rules:
- Resolve relative dates ("tomorrow", "next Friday", "in two weeks") against the current date and time given in the request.
- Timed events use "YYYY-MM-DDTHH:mm" (24h, the user's local time). All-day events set allDay=true and use "YYYY-MM-DD" with an inclusive end date.
- If the user gives no duration, default to 1 hour for meetings and 30 minutes for calls or quick tasks.
- To change or remove an existing event, reference it by its exact id from the calendar listing. Never invent ids.
- Only create, update, or delete events when the user asks for a change. For questions ("what's on Tuesday?", "when am I free?"), answer from the calendar and return no actions.
- Before scheduling, check for overlaps with existing events and mention any conflict in your reply.
- If a request is too ambiguous to act on safely, ask a short clarifying question and return no actions.
- Keep the reply short and friendly: one to three sentences, plain text, no markdown.
- Pick a color for new events: "blue" (default/work), "green" (personal/health), "purple" (social), "orange" (travel/errands), "red" (deadlines/important).`;

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
          color: { type: ["string", "null"], enum: ["blue", "green", "purple", "orange", "red", null] },
        },
        required: ["type", "id", "title", "start", "end", "allDay", "location", "notes", "color"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "actions"],
  additionalProperties: false,
};

function describeCalendar(events) {
  if (events.length === 0) return "(no events)";
  return [...events]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => {
      const when = e.allDay ? `${e.start} to ${e.end} (all day)` : `${e.start} to ${e.end}`;
      const extras = [e.location && `at ${e.location}`, e.notes && `notes: ${e.notes}`].filter(Boolean).join("; ");
      return `- id=${e.id} | ${e.title} | ${when}${extras ? ` | ${extras}` : ""}`;
    })
    .join("\n");
}

async function askAssistant({ message, history, now, timezone }) {
  const events = await loadEvents();
  const context = `Current local date/time: ${now} (${timezone}).

The user's calendar:
${describeCalendar(events)}`;

  // Keep the last few turns so follow-ups ("make it 3pm instead") work.
  const priorTurns = (Array.isArray(history) ? history : [])
    .slice(-10)
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content)
    .map((t) => ({ role: t.role, content: t.content }));

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
    messages: [...priorTurns, { role: "user", content: `${context}\n\nUser request: ${message}` }],
  });

  if (response.stop_reason === "refusal") {
    return { reply: "Sorry, I can't help with that request.", applied: [], events };
  }
  if (response.stop_reason === "max_tokens") {
    throw new HttpError(502, "The assistant's response was cut off. Please try a shorter request.");
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(502, "The assistant returned an unreadable response.");
  }

  // Re-read the store so edits made while Claude was thinking are not lost.
  const { applied, errors, events: updated } = await withStore((current) => {
    const result = applyActions(current, parsed.actions ?? []);
    return { save: result.applied.length > 0, value: { ...result, events: current } };
  });
  let reply = parsed.reply;
  if (errors.length) reply += `\n(Some changes could not be applied: ${errors.join("; ")})`;
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
        const ev = normalizeEvent(fields);
        events.push(ev);
        applied.push({ type: "create", event: ev });
      } else {
        const idx = events.findIndex((e) => e.id === action.id);
        if (idx === -1) throw new Error(`no event with id ${action.id}`);
        if (action.type === "delete") {
          const [removed] = events.splice(idx, 1);
          applied.push({ type: "delete", event: removed });
        } else {
          // Switching between timed and all-day without new times would leave
          // mismatched formats; normalizeEvent rejects that and we report it.
          events[idx] = normalizeEvent(fields, events[idx]);
          applied.push({ type: "update", event: events[idx] });
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
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    throw new HttpError(404, "Not found");
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;

  if (pathname === "/api/events" && req.method === "GET") {
    return sendJson(res, 200, await loadEvents());
  }
  if (pathname === "/api/events" && req.method === "POST") {
    const input = await readJson(req);
    const ev = await withStore((events) => {
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
      timezone: body.timezone || "local time",
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
    if (err instanceof Anthropic.AuthenticationError) {
      status = 503;
      message = "AI assistant is not configured. Set ANTHROPIC_API_KEY and restart the server.";
    } else if (err instanceof Anthropic.RateLimitError) {
      status = 429;
      message = "The AI assistant is busy. Please try again in a moment.";
    } else if (err instanceof Anthropic.APIError) {
      status = 502;
      message = `AI assistant error: ${err.message}`;
    } else if (err instanceof Error && /credentials|apiKey|authToken/i.test(err.message)) {
      status = 503;
      message = "AI assistant is not configured. Set ANTHROPIC_API_KEY and restart the server.";
    }
    if (status >= 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`AI Calendar running at http://localhost:${PORT}`);
});
