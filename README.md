# किसान AI कैलेंडर · Kisan AI Calendar

A farm calendar for horticulture growers, modelled on the 2026 wall calendar of **महात्मा गांधी उद्यानिकी एवं वानिकी विश्वविद्यालय, दुर्ग** (Mahatma Gandhi University of Horticulture and Forestry, Durg; [mguvv.ac.in](https://www.mguvv.ac.in)), with a Claude-powered assistant, **किसान साथी (Kisan Saathi)**, that turns crop knowledge into dated tasks on the farmer's calendar.

It covers the same six areas as the wall calendar's QR row: **फल** (fruits), **फूल** (flowers), **सब्जी** (vegetables), **मसाले** (spices), **वानिकी** (forestry) and **सरकारी योजनाएं** (government schemes).

## How the AI calendar helps farmers

| Need | What the app does |
|---|---|
| "What should I do on my farm this month?" | Each month shows Chhattisgarh-specific work for fruits, flowers, vegetables, spices and forestry, plus a featured crop. One tap adds a task to the calendar or asks the AI for details. |
| "Plan my whole crop" | **🌱 फसल योजना (Crop plan):** enter crop, sowing/transplanting date, area and district. Kisan Saathi schedules land preparation, nursery, transplanting, fertilizer doses, irrigation, weeding, pest checks and harvest as dated tasks, with doses in the notes. |
| Questions in their own words | Chat in Hindi, Chhattisgarhi or English. Replies come in the farmer's language. |
| Low literacy / small phones | 🎤 voice input (Hindi speech recognition) and 🔈 read-aloud replies, large dates, mobile layout. |
| Government support | Scheme cards (MIDH, PMKSY drip/sprinkler, PMFBY, PM-KISAN, KCC, Soil Health Card, National Bamboo Mission, e-NAM, PM-KUSUM, AIF) with portal links, "Ask AI" and "+ Reminder". The assistant is told not to invent amounts or deadlines. |
| Mistakes by the AI | Every AI change shows what was added, changed or removed, with a one-tap **↶ वापस लें (Undo)**. |
| Festivals and holidays | Public holidays in red and optional holidays in bold, listed under the month as on the printed calendar. The assistant warns when a task falls on one. |

The interface is Hindi-first with an English toggle, and follows the printed calendar: year badge, Hindi month name with the Hindu months (e.g. अक्टूबर: आश्विन - कार्तिक), रवि…शनि weekday row with weekends in red, the "प्रकृति की पाठशाला - द ग्रीन पॉडकास्ट" strip and the university footer.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # get one at https://console.anthropic.com
npm start
```

Open http://localhost:3000. The calendar, monthly advice and schemes work without an API key. Only Kisan Saathi needs one.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Claude API key for the assistant |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model used by the assistant |
| `PORT` | `3000` | HTTP port |
| `DATA_FILE` | `data/events.json` | Where farmers' tasks are stored |

## Content to review before release

The farm knowledge lives in plain JSON under `knowledge/` so university staff can edit it without touching code:

- `knowledge/calendar-2026.json`: holidays, Hindu month names, podcast and category links.
  - **Holidays are a starter list.** October's entries are copied from the printed calendar; other months only have major holidays. Complete it from the official list.
  - **Hindu month names** are calculated and should be checked against the printed calendar.
  - **Podcast/QR links** all point to https://mguvv.ac.in/info/ for now. Replace them with the exact targets of the six QR codes.
- `knowledge/advisory.json`: month-by-month work for each category for the Chhattisgarh plains. This is general starter advice; MGUVV scientists should review it and add varieties, doses and local timings.
- `knowledge/schemes.json`: scheme names, short benefits and official portals.

The assistant receives this month's and next month's advice, upcoming holidays and the scheme list with every request, so edits there flow into its answers.

## How it works

- `server.js`: a small Node HTTP server (one dependency, the Anthropic SDK) that serves the app, stores tasks and calls Claude.
- `public/`: the frontend in plain HTML, CSS and JavaScript, with no build step.
- For each chat message the server sends Claude the date, the season's advice, upcoming holidays, the farmer's calendar and recent chat turns. Claude replies in a fixed JSON format (structured outputs) with a message and a list of `create` / `update` / `delete` actions. The server validates and applies them and returns what changed, so the app can show and undo it.
- Requests use the API's default refusal fallback (`fallbacks: "default"`).

### API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/knowledge` | Holidays, Hindu months, monthly advice and schemes |
| `GET` | `/api/events` | List all tasks |
| `POST` | `/api/events` | Create a task |
| `PUT` | `/api/events/:id` | Update a task (partial fields allowed) |
| `DELETE` | `/api/events/:id` | Delete a task |
| `POST` | `/api/assistant` | `{ message, history?, now?, timezone?, language? }` → `{ reply, applied, events }` |

Task shape:

```json
{
  "id": "uuid",
  "title": "टमाटर: रोपाई",
  "start": "2026-11-01",
  "end": "2026-11-01",
  "allDay": true,
  "location": "खेत 1",
  "notes": "60x45 सेमी दूरी, शाम को रोपाई",
  "category": "vegetable"
}
```

Categories: `fruit`, `flower`, `vegetable`, `spice`, `forestry`, `scheme`, `personal`. Timed tasks use local `YYYY-MM-DDTHH:mm`; all-day tasks use `YYYY-MM-DD` with an inclusive end date.
