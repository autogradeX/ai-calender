# AI Calendar

A personal calendar with a built-in assistant powered by Claude. Type what you want in plain language, like "Lunch with Sam next Thursday at noon", "Move my dentist appointment to Friday", or "What's on tomorrow?", and the assistant reads your calendar and makes the changes.

## Features

- Month view with color-coded timed and all-day events, plus an agenda for the selected day
- Create, edit and delete events by hand (double-click a day, or use **+ New event**)
- Chat assistant that can:
  - add, reschedule and cancel events from natural language
  - resolve relative dates ("next Friday", "in two weeks") in your local time zone
  - answer questions about your schedule and point out conflicts
  - handle follow-ups ("make it 3pm instead")
- Events are saved to `data/events.json`
- Light and dark mode, works on small screens

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # get one at https://console.anthropic.com
npm start
```

Open http://localhost:3000.

The calendar works without an API key. Only the assistant needs one.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Claude API key for the assistant |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model used by the assistant |
| `PORT` | `3000` | HTTP port |
| `DATA_FILE` | `data/events.json` | Where events are stored |

## How it works

- `server.js` is a dependency-light Node HTTP server that serves the frontend, stores events, and exposes a small REST API.
- `public/` holds the frontend (plain HTML, CSS and JavaScript, no build step).
- On each chat message the server sends Claude the current local date and time, your calendar, and recent chat turns. Claude answers in a fixed JSON format (structured outputs) with a reply and a list of `create` / `update` / `delete` actions. The server validates and applies those actions, then returns the updated calendar.
- Requests use the API's default refusal fallback (`fallbacks: "default"`), so a request a safety classifier declines is retried on Anthropic's recommended fallback model.

### API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/events` | List all events |
| `POST` | `/api/events` | Create an event |
| `PUT` | `/api/events/:id` | Update an event (partial fields allowed) |
| `DELETE` | `/api/events/:id` | Delete an event |
| `POST` | `/api/assistant` | `{ message, history?, now?, timezone? }` → `{ reply, applied, events }` |

Event shape:

```json
{
  "id": "uuid",
  "title": "Lunch with Sam",
  "start": "2026-10-29T12:00",
  "end": "2026-10-29T13:00",
  "allDay": false,
  "location": "Cafe Luna",
  "notes": "",
  "color": "purple"
}
```

Timed events use local `YYYY-MM-DDTHH:mm` times. All-day events use `YYYY-MM-DD` with an inclusive end date. Colors: `blue`, `green`, `purple`, `orange`, `red`.
