# Forkast Meal Planner (formerly Larder)

The app's user-facing name is **Forkast**. Some internal identifiers still say `larder`, and they should stay that way so existing data and exports keep working: the IndexedDB name `larder`, the export format `"larder-export"`, the localStorage keys `larder-sort` and `larder-local-v1`, the service-worker cache `larder-v1`, and this folder.

GitHub repo: `forkast`, public. The site is served by GitHub Pages from `web/`. Commits use the email MichelleAndZac@gmail.com.

This project contains two apps that share the same views and data model:

1. **`web/`: the main app.** A static web app (installable PWA) meant to run on all devices. It's being developed locally. Plan: host it on a free static host (e.g. GitHub Pages) and keep the data in Google Drive. See "Web app" below.
2. **`index.html`: the claude.ai Artifact.** It's kept for AI recipe import (photos and links, which need Claude). Its **Export** button hands recipes over to the web app.

# Web app (`web/`)
- Files: `index.html` (a full document), `styles.css`, `app.js` (one IIFE), `sw.js` (network-first offline cache; bump `VERSION` when the shell file list changes), `manifest.webmanifest`, `icons/`.
- Run locally: the `larder-web` entry in `.claude/launch.json` runs `python -m http.server 8080 --directory web`. Open http://localhost:8080.
- Storage (`app.js` → "Storage"): the `store` wrapper (set/del/watchDoc/watchCol/refresh) calls a swappable `backend` object with `ready, getAll(col), get, set, del, putImage, getImage, delImage`.
  - `localBackend` uses IndexedDB (database `larder`, object stores `docs` keyed by path and `images` holding blobs). `memoryBackend` is the fallback.
  - **Google Drive sync is next:** add a `driveBackend` with the same shape. It needs a Google Cloud OAuth client ID from the user.
- Data paths and recipe fields match the Artifact data model below. Differences: images live in the backend's image store, shown through object URLs (`imgUrls`, `loadImages`), not `/_blob/`. TheMealDB recipes also store `thumbUrl`.
- Add recipe: **Paste text** (heuristic `parseRecipeText`, no AI), **Type it in**, **Photo** (attached and filled in by hand), **Import**.
- Export/import format: `{format: "larder-export", version: 1, exportedAt, recipes: [{id, ...recipe, images: [dataURL]}], plans?, shopping?}`. Both apps write it, and the web app reads it (`parseExport`, `importData`). Importing a recipe whose id already exists replaces it.
- The **⋮** button opens "Your data": download a full backup, or import.
- Discover calls TheMealDB with `fetch` (it allows CORS).
- No AI features; Discover needs no browser bridge.

# Artifact (`index.html`)

- Live artifact: https://claude.ai/artifact/MAHqYJJTxErbmnriGsY1MN
- To update it from Claude Code, publish `index.html` with the Artifact tool, passing that URL as `url` (read the artifact first). Leaving out `capabilities` keeps the current ones.
- `index.html` is page content only. The Artifact publisher wraps it in `<!doctype html><head>…<body>`, so don't add those tags. To open it locally, wrap it yourself (see "Local testing").

## Features
- **This week** (`#plan`): a Mon–Sun grid with several meals per day and servings per meal. You can move between weeks.
- **Shopping** (`#shopping`): built from the plan. Ingredients are parsed, merged by a normalized name, and their units converted and added together (volume in ml, mass in g, count units kept separate). The list is grouped by aisle. Each item's status is `need`, `have` (already at home) or `got` (in cart). You can add your own items.
- **Recipes** (`#recipes`): the recipe box, with 1–5 star ratings, search, tag and rating filters, sorting and a "cooked it" counter.
- **Add recipe**: from photos or screenshots (read by `sample` with images), a web link (fetched with `host:claude_browser`, then parsed by `sample`), pasted text, or typed by hand. Every route ends in an editor where you check the recipe before saving.
- **Discover** (`#discover`): searches the TheMealDB API at `https://www.themealdb.com/api/json/v1/1/` through the browser. It reads the JSON from the page text, because the page's own `fetch` is blocked. It also links out to other recipe sites.

## Artifact capabilities declared
```json
{"db": {}, "assets": {}, "sample": {"images": true}, "downloads": true,
 "mcp": {"servers": [{"server": "host:claude_browser", "tools": ["preview_start", "navigate", "get_page_text"]}]}}
```
- `downloads`: the Export buttons (recipe detail and "Export all" in Recipes) save a `larder-export` .json with `downloads.save`. If that isn't available, they copy to the clipboard, or show a textarea to copy from.
- `db`: shared docs (default rules).
- `assets`: recipe photos. The page stores the asset ids and shows each photo from `/_blob/<id>`.
- `sample`: Claude reads recipes out of images and page text, returning JSON.
- `mcp` host browser: only works in the Claude desktop app. `preview_start` returns text containing `(tabId X)`. `get_page_text` returns `…\n---\n<body>\n\nTab Context…`.
- If `db` is unavailable, the page falls back to `localStorage` (key `larder-local-v1`, holding a map of path → doc).

## Data model (artifact db)
- `recipes/{id}`: `{title, servings, totalTime, ingredients: [string lines], steps: [string], tags: [string], notes, sourceUrl, source: "manual"|"photo"|"link"|"themealdb", mealdbId?, imageIds: [assetId], thumbData?, rating 0-5, timesCooked, timesPlanned, lastPlanned, lastCooked, createdAt, updatedAt}`
- `plans/{YYYY-MM-DD Monday}`: `{weekOf, slots: [{id, recipeId, day 0-6, servings}]}`
- `shopping/{YYYY-MM-DD Monday}`: `{weekOf, status: {itemKey: "have"|"got"}, extras: [{id, name, qty}]}`. Extra items use the key `x_<id>`.
- Example recipes have ids `ex-*` and the tag `example`.

## Code map (inside the single `<script>`)
- Ingredient parsing: `parseIngredient`, `nameKey`, `aisleFor`, `fmtVol` / `fmtMass` / `fmtNum`
- Storage: the `store` object, which wraps db or localStorage
- Building the shopping list: `buildShopping`
- Views: `renderPlan`, `renderShop`, `renderLib`, `renderDisc`
- Modals: `openDetail`, `openEditor`, `openAdd`, `drawPhotoAdd`, `drawLinkAdd`, `openPicker`, `openDayPick`
- Browser: `browserGetText`. TheMealDB: `mealdb`, `mealToRecipe`
- Click handling goes through one delegated listener that dispatches on `data-*` attributes.

## Local testing
Wrap the file in a doctype, head and body, then serve it or open it with Playwright. Without `window.claude` it uses localStorage, and the AI and browser features stay hidden or explain that they're unavailable.
