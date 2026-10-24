# किसान AI कैलेंडर · Kisan AI Calendar

A farm calendar for horticulture growers, modelled on the 2026 wall calendar of **महात्मा गांधी उद्यानिकी एवं वानिकी विश्वविद्यालय, दुर्ग** (Mahatma Gandhi University of Horticulture and Forestry, Durg; [mguvv.ac.in](https://www.mguvv.ac.in)), with an AI assistant powered by Azure OpenAI, **किसान साथी (Kisan Saathi)**, that turns crop knowledge into dated tasks on the farmer's calendar.

It covers the same six areas as the wall calendar's QR row: **फल** (fruits), **फूल** (flowers), **सब्जी** (vegetables), **मसाले** (spices), **वानिकी** (forestry) and **सरकारी योजनाएं** (government schemes).

## How the AI calendar helps farmers

| Need | What the app does |
|---|---|
| "What should I do on my farm this month?" | Each month shows Chhattisgarh-specific work for fruits, flowers, vegetables, spices and forestry, plus a featured crop. One tap adds a task to the calendar or asks the AI for details. |
| "Plan my whole crop" | **🌱 फसल योजना (Crop plan):** enter crop, sowing/transplanting date, area and district. Kisan Saathi schedules land preparation, nursery, transplanting, fertilizer doses, irrigation, weeding, pest checks and harvest as dated tasks, with doses in the notes. |
| Questions in their own words | Chat in Hindi, Chhattisgarhi or English. Replies come in the farmer's language. |
| Low literacy / small phones | 🎤 voice input (Hindi speech recognition) and 🔈 read-aloud replies, large dates. |
| Use it like a phone app | Installable PWA with an **📲 ऐप इंस्टॉल करें** button, home-screen icon, full-screen app with bottom tabs (कैलेंडर · कृषि कार्य · किसान साथी · योजनाएं), swipe between months, and offline viewing of saved tasks and advice. |
| Government support | Scheme cards (MIDH, PMKSY drip/sprinkler, PMFBY, PM-KISAN, KCC, Soil Health Card, National Bamboo Mission, e-NAM, PM-KUSUM, AIF) with portal links, "Ask AI" and "+ Reminder". The assistant is told not to invent amounts or deadlines. |
| Mistakes by the AI | Every AI change shows what was added, changed or removed, with a one-tap **↶ वापस लें (Undo)**. |
| Festivals and holidays | Public holidays in red and optional holidays in bold, listed under the month as on the printed calendar. The assistant warns when a task falls on one. |

The interface is Hindi-first with an English toggle, and follows the printed calendar: year badge, Hindi month name with the Hindu months (e.g. अक्टूबर: आश्विन - कार्तिक), रवि…शनि weekday row with weekends in red, the "प्रकृति की पाठशाला - द ग्रीन पॉडकास्ट" strip and the university footer.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
export AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
export AZURE_OPENAI_API_KEY=<key from Azure portal → your resource → Keys and Endpoint>
export AZURE_OPENAI_DEPLOYMENT=<your model deployment name, e.g. gpt-4o>
npm start
```

Open http://localhost:3000. The calendar, monthly advice and schemes work without Azure settings. Only Kisan Saathi needs them.

The deployment must be a model that supports **structured outputs** (JSON schema), for example `gpt-4o` (2024-08-06 or later), `gpt-4o-mini`, `gpt-4.1` or `gpt-5`.

| Variable | Default | Purpose |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | (none) | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_API_KEY` | (none) | Azure OpenAI key |
| `AZURE_OPENAI_DEPLOYMENT` | (none) | Name of your model deployment |
| `OPENAI_API_VERSION` | `2024-10-21` | Azure OpenAI API version |
| `PORT` | `3000` | HTTP port |
| `DATA_FILE` | `data/events.json` | Where farmers' tasks are stored |

## Deploy to Google Cloud Run

The repo includes a `Dockerfile` and a `deploy.sh` script.

```bash
gcloud auth login
PROJECT_ID=your-project-id \
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/ \
AZURE_OPENAI_DEPLOYMENT=gpt-4o \
./deploy.sh
```

The script, which is safe to re-run:
1. enables Cloud Run, Cloud Build, Artifact Registry, Secret Manager and Cloud Storage;
2. creates a bucket `<project>-kisan-calendar-data` and mounts it at `/data`, so saved tasks survive restarts and redeploys;
3. stores your Azure OpenAI key in Secret Manager (asked for on the first run only) and passes it in as `AZURE_OPENAI_API_KEY`, with the endpoint and deployment as environment variables;
4. builds the image with Cloud Build and deploys the `kisan-ai-calendar` service to `asia-south1` (Mumbai), then prints the URL.

Override `REGION`, `SERVICE`, `BUCKET` or `SECRET` with environment variables if needed.

Things to know:
- **One shared calendar.** There are no user accounts yet: everyone who opens the URL sees and edits the same tasks. Fine for a demo or a single farm or office; per-farmer calendars need login or per-device storage.
- **One instance.** Tasks live in a single JSON file, so the service runs with `--max-instances 1`. That comfortably serves a demo or pilot; a larger rollout should move storage to Firestore.
- **Public AI endpoint.** The URL is public (`--allow-unauthenticated`), so anyone can use the assistant on your API key. Set a budget alert on the Azure OpenAI resource, or remove `--allow-unauthenticated` to restrict access.
- **Health check:** `GET /healthz`.

To try the container locally:

```bash
docker build -t kisan-ai-calendar .
docker run -p 8080:8080 \
  -e AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/ \
  -e AZURE_OPENAI_API_KEY=... -e AZURE_OPENAI_DEPLOYMENT=gpt-4o \
  kisan-ai-calendar
```

Cloud Run serves over HTTPS, which the install button and offline mode need. On Android (Chrome) the **📲 ऐप इंस्टॉल करें** button installs the app directly; on iPhone it shows the Safari "Add to Home Screen" steps.

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

- `server.js`: a small Node HTTP server (one dependency, the `openai` SDK's `AzureOpenAI` client) that serves the app, stores tasks and calls Azure OpenAI.
- `public/`: the frontend in plain HTML, CSS and JavaScript, with no build step.
- `public/manifest.webmanifest`, `public/sw.js`, `public/icons/`: the installable-app pieces. The service worker caches the app and the last-seen tasks and advice for offline use. Bump `VERSION` in `sw.js` when you change app files.
- For each chat message the server sends the model the date, the season's advice, upcoming holidays, the farmer's calendar and recent chat turns. The model replies in a fixed JSON format (structured outputs, strict JSON schema) with a message and a list of `create` / `update` / `delete` actions. The server validates and applies them and returns what changed, so the app can show and undo it.
- If Azure's content filter blocks a message, the farmer gets a polite "can't help with that" instead of an error.

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
