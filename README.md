# gtfs_app

A web tool for configuring and previewing live public-transport departure boards.
Point it at a GTFS feed, pick a stop on the map, and get a PNG (or EPD payload for
e-paper displays) ready to push to a screen.

<!-- SCREENSHOT: full dashboard view — region selected, stop pinned on map, preview panel showing a rendered board -->

---

## What it does

- Pulls live departure data from GTFS static + GTFS-RT feeds
- Renders boards using one of several built-in templates (departure list, route map, line scheme…)
- Lets you drop in a custom PNG background and position fields with a drag editor
- Serves the result as PNG / JPG / EPD / LZ4 — whatever your hardware needs

The intended home for this is inside a larger backend that drives physical e-paper displays.
The `/render` endpoint is essentially a one-call image service once a region is warmed.

---

## Stack

- **Backend** — FastAPI + SQLAlchemy async (asyncpg), Pillow for rendering
- **Frontend** — React + Vite + Tailwind
- **DB** — PostgreSQL 15 (GTFS static data stored normalized, not in RAM)

---

## Getting started

```bash
cp .env.example .env           # set JWT_SECRET and POSTGRES_PASSWORD
docker compose up -d           # postgres + backend + frontend
cd backend && python scripts/create_admin.py you@example.com   # first admin account
```

Frontend runs on **:3000**, API on **:8000**. Postgres is bound to localhost only.

First startup creates the schema automatically. No default admin is seeded — create
one with the script above, log in, add a region (paste any GTFS static ZIP URL),
wait for the region to finish warming, then pick a stop.

<!-- SCREENSHOT: login page -->

---

## Development (without Docker)

```bash
# Backend
cd backend
python -m venv ../venv && source ../venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Make sure `DATABASE_URL` in `.env` points at a running Postgres instance.

```bash
# Backend tests — no DB or network needed, everything is mocked
cd backend && python -m pytest tests/ -v

# Frontend e2e tests — Playwright with the API mocked in-browser (no backend needed)
cd frontend && npx playwright install chromium   # once
npm run test:e2e
```

---

## Environment variables

See `.env.example`.

| var | default | notes |
|---|---|---|
| `DATABASE_URL` | — | asyncpg driver, e.g. `postgresql+asyncpg://user:pass@localhost/gtfs_app` |
| `POSTGRES_PASSWORD` | — | used by docker-compose; must match `DATABASE_URL` |
| `JWT_SECRET` | — | **required** — the backend refuses to start without a real value |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated allowed origins |
| `METRICS_TOKEN` | unset | when set, `GET /metrics` accepts it as a Bearer token; otherwise 404 |

Frontend picks up `VITE_API_URL` (defaults to `http://localhost:8000`).

---

## Dashboard

<!-- SCREENSHOT: region dropdown with cache status badges (ready / warming) -->

Select a region → the stop cache warms in the background → pick a stop from the map or search by name.

<!-- SCREENSHOT: stop search dropdown open + Leaflet map with stop pins -->

Then choose a template, set dimensions, and hit **Preview board**.

<!-- SCREENSHOT: template card (Kind / Source segmented controls) with a rendered preview on the right -->

---

## Custom template

Upload a PNG background, then use the layout editor to drag text fields into position.
Double-click a field chip to type preview text and check sizing before rendering.

<!-- SCREENSHOT: layout editor — PNG canvas with field chips placed, property panel on the right showing font size / width inputs -->

---

## Admin panel

Manage users (email + role) and regions. Deleting a region clears its cached GTFS data.

<!-- SCREENSHOT: admin panel showing Users tab and Regions tab -->

---

## Templates

| name | description |
|---|---|
| `rti_display` | Standard departure list — line, destination, countdown |
| `board_graphic` | Dark header bar, column headers, alternating rows |
| `line_scheme` | Groups arrivals by line+direction, draws horizontal tracks |
| `route_strip` | Past stops → current station → future stops along the route |
| `gtfs_routes_map` | Route network from `shapes.txt`, centred on the stop |
| `active_routes_map` | Same map but filtered to lines currently running |

All templates scale off canvas height, so the same template works at any resolution.
Portrait is rendered landscape then rotated — font sizes compute off the longer axis.

---

## Output formats

| format | description |
|---|---|
| `png` | Grayscale PNG |
| `jpg` | JPEG at quality 90 |
| `epd` | 1-bit packed payload with binary header for e-paper firmware |
| `lz4` | LZ4-compressed EPD |

---

## Adding a template

```python
# backend/src/templates/my_template/image.py
def render_my_template(data: dict, options: dict) -> bytes:
    # data keys: stop_name, arrivals, stop_coords, shapes, updated_at
    return png_bytes

# backend/src/render.py
from .templates.my_template.image import render_my_template
register_template("my_template", render_my_template)
```

Shared drawing helpers are in `src/templates/shared.py`.
Locale strings (en/pl/de) are in `src/gtfs_locale.py`.

---

## License

MIT — see [LICENSE](LICENSE).
