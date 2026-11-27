# dashboard

A personal dashboard that runs on your own machine. One page shows your agenda and to-do list, and tells you what you'd otherwise look up in five places: is it a good moment to go out, will the sky be clear tonight, what electricity costs right now, today's fuel prices, and whether anything on your watchlist got cheaper. Each tile opens a full tool, and there are a few small games and a flying-saucer companion called Zorp.

Everything is based on Belgium for now: the price comparer searches Belgian shops, fuel and electricity prices are the Belgian ones, the place picker lists Belgian cities (Brussels by default) and the server runs on Brussels time. The weather and sky tools work anywhere.

This is a personal project. Feel free to fork it and make it your own, for example with your own country's shops, prices and places. I don't take pull requests, but feature requests are welcome: [open an issue](https://github.com/robbevrstr/dashboard/issues/new) and tell me what you'd like to see.

## What's in it

| Tool | What it does | Data |
|---|---|---|
| **Dashboard** (`/`) | Greeting and clock, plus tiles for everything below | — |
| **Agenda** (`/apps/agenda`) | Two weeks of plans: events you add, plus calendars imported from a link (Google, Outlook, iCloud, any `.ics` or `webcal://` feed), refreshed every half hour | Your own calendar links |
| **Tasks** (`/apps/tasks`) | A to-do list with due dates, overdue first; tick tasks off or add them from the dashboard | — |
| **Price comparer** (`/apps/comparer`) | Searches Coolblue, bol, MediaMarkt, Alternate, Vanden Borre and Amazon.be at once, cheapest first, with spec filters, a watchlist, price history and target prices | The shops' own pages |
| **Fuel prices** (`/apps/fuel`) | Today's official Belgian maximum prices and a year of history | Statbel / FOD Economie |
| **Cheapest electricity hours** (`/apps/power`) | Day-ahead price per 15 minutes, the cheapest time to run an appliance, and the current power mix | Energy-Charts (Fraunhofer ISE) |
| **Should I go out?** (`/apps/outside`) | A yes/no for cycling, running or walking, with rain, wind, air quality, pollen and daylight | Open-Meteo |
| **Tonight's sky** (`/apps/sky`) | Cloud verdict, a sky chart, the Moon and planets, and visible ISS passes | Open-Meteo, CelesTrak, `astronomy-engine` |

Games: **Stop the clock**, **Colour memory** and **How round?**. Click Zorp five times quickly for a secret one.

## Run it with Docker

You need [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
git clone https://github.com/robbevrstr/dashboard.git
cd dashboard
docker compose up -d --build
```

Then open <http://localhost:3000>.

- **Update:** `git pull && docker compose up -d --build`
- **Logs:** `docker compose logs -f`
- **Stop:** `docker compose down` (your data stays in the volume)

The container restarts by itself, so it comes back whenever Docker starts. To have the dashboard ready when you sign in, let Docker start with your computer (Docker Desktop: Settings → General → "Start Docker Desktop when you sign in").

### Your data

Everything the dashboard keeps is in one SQLite database in the `dashboard-data` volume, mounted at `/data`:

- your tasks and agenda events, and a copy of each imported calendar
- your settings: saved place and activity, watchlist and target prices, best scores, whether Zorp is shown
- price history for searches in the comparer (one point per item per hour at most, one year kept)
- the last good ISS orbit, as a fallback when both sources are down

Back it up with:

```bash
docker compose cp dashboard:/data ./backup
```

There is no separate database server: SQLite is built into Node (`node:sqlite`) and is plenty for one person. The light/dark choice stays in the browser so the page can pick the right colours before it draws.

### Configuration

Set these under `environment:` in `docker-compose.yml`:

| Variable | Default | What it does |
|---|---|---|
| `TZ` | `Europe/Brussels` | Time zone for the server |
| `DATA_DIR` | `/data` | Where the database lives |
| `CHROME_PATH` | `/usr/bin/chromium` | Chromium used by the comparer |
| `CHROME_SANDBOX` | `false` in Compose | Set to `true` if your Docker setup allows Chromium's sandbox (it needs user namespaces) |

To change the name in the header or the copyright line in the footer, edit `src/lib/site.ts` and rebuild.

### Security

The dashboard has **no login**. Compose only publishes it on `127.0.0.1`, so only your own computer can reach it. If you open it to your network (`"3000:3000"`), anyone on that network can see and change your settings. Put it behind a reverse proxy with authentication before exposing it any further.

Imported calendar links are often secret addresses (Google's "secret address in iCal format"); they're stored in the database and only their site name is shown on the page.

Other protections: a strict Content-Security-Policy, the data APIs only accept JSON from the dashboard's own pages, and neither the comparer's headless Chromium nor the calendar import can reach `localhost` or private network addresses.

## Develop without Docker

Requires Node 24 or newer (the Docker image uses Node 26) and, for two of the comparer's shops, Chrome or Chromium installed locally (set `CHROME_PATH` if it isn't in the default location).

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

Data goes to `./data` unless you set `DATA_DIR`.

## How it's built

Next.js 16 (App Router, cache components), React 19, TypeScript and Tailwind CSS 4.

```
src/
  app/
    page.tsx                  the dashboard
    apps/<slug>/              one folder per tool or game
    api/comparer/             runs a price search
    api/settings/[key]/       read and write one setting
    api/tasks/                the to-do list
    api/agenda/               the agenda, your events and imported calendars
    api/health/               used by the Docker health check
  components/
    dashboard/                the dashboard tiles
    Robot.tsx, SaucerGame.tsx Zorp and its secret game
  lib/
    db.ts                     the SQLite database
    settings.ts, store.ts     settings: server side and browser side
    apps.ts                   the list of apps on the home page and /apps
    comparer/                 shop adapters, spec parser, price history, Chromium
    agenda/                   calendar import (download, iCal parsing with ical.js), events
    tasks.ts, day.ts          the to-do list; local dates as YYYY-MM-DD
    fuel.ts, power.ts, powermix.ts, iss.ts   server data, cached with 'use cache'
    bike.ts, sun.ts, sky.ts                  weather rules, solar and sky maths
```

### Adding an app

1. Create `src/app/apps/<slug>/page.tsx`.
2. Add it to `src/lib/apps.ts` (`kind: "game"` for a game).
3. If it saves anything, add a key to `SETTING_KEYS` in `src/lib/settings.ts` and use `loadSetting` / `saveSetting` from `src/lib/store.ts`.
4. Optionally add a tile to `src/app/page.tsx` and a line for Zorp in `src/components/Robot.tsx`.

## About the price comparer

The comparer reads the same public pages you'd see in a browser, for your own personal use, and keeps its load low: results are cached for 15 minutes, identical searches share one request, and there are per-minute limits. Shops that put their search behind a CAPTCHA (Fnac, Krëfel) are deliberately left out instead of worked around. Shops change their pages often, so an adapter may break; pull requests are welcome. Check a shop's terms before you build on this.

## Data sources

- Fuel prices: [FOD Economie via Statbel](https://statbel.fgov.be/) open data
- Electricity prices and power mix: [Energy-Charts](https://energy-charts.info/) (Fraunhofer ISE), data from Bundesnetzagentur | SMARD.de, CC BY 4.0
- Weather, air quality and pollen: [Open-Meteo](https://open-meteo.com/), CC BY 4.0
- ISS orbit: [CelesTrak](https://celestrak.org/), with [tle.ivanstanojevic.me](https://tle.ivanstanojevic.me/) as a mirror
- Calendar parsing: [ical.js](https://github.com/kewisch/ical.js) (Mozilla)
- Sun, Moon and planets: [astronomy-engine](https://github.com/cosinekitty/astronomy)

## License

[MIT](LICENSE)
