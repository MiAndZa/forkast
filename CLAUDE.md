# Forkast Meal Planner (formerly Larder)

The app's user-facing name is **Forkast**. Some internal identifiers still say `larder`, and they should stay that way so existing data and exports keep working: the IndexedDB name `larder`, the export format `"larder-export"`, the localStorage keys `larder-sort` and `larder-local-v1`, the service-worker cache `larder-v1`, and this folder.

- GitHub repo: https://github.com/MiAndZa/forkast (public). Commits use the email MichelleAndZac@gmail.com.
- Live site: https://miandza.github.io/forkast/
- Deploys: `.github/workflows/pages.yml` publishes `web/` on every push to `main`. `gh` is installed at `C:\Program Files\GitHub CLI\gh.exe`; it isn't on the Bash PATH, so call it by that full path.

This project contains two apps that share the same views and data model:

1. **`web/`: the main app.** A static web app (installable PWA) meant to run on all devices. It's being developed locally. Plan: host it on a free static host (e.g. GitHub Pages) and keep the data in Google Drive. See "Web app" below.
2. **`index.html`: the claude.ai Artifact.** It's kept for AI recipe import (photos and links, which need Claude). Its **Export** button hands recipes over to the web app.

# Web app (`web/`)
- Files: `index.html` (a full document), `styles.css`, `app.js` (one IIFE), `sw.js` (network-first offline cache; bump `VERSION` when the shell file list changes), `manifest.webmanifest`, `icons/`.
- Run locally: the `larder-web` entry in `.claude/launch.json` runs `python -m http.server 8080 --directory web`. Open http://localhost:8080.
- Storage (`app.js` → "Storage"): the `store` wrapper (set/del/watchDoc/watchCol/refresh) calls a swappable `backend` object with `ready, getAll(col), get, set, del, putImage, getImage, delImage`.
  - `localBackend` uses IndexedDB (database `larder`, object stores `docs` keyed by path and `images` holding blobs). `memoryBackend` is the fallback.
  - Every write also stamps the `meta` store (path → `{ts, deleted?}`), so deletes are kept as tombstones. The `kv` store holds sync state under the `drive` key.
- **Google Drive sync** (`app.js` → "Google Drive sync"): IndexedDB stays the working copy.
  - Drive's `Forkast` folder holds `forkast-data.json` (`{format: "forkast-sync", version: 1, docs: {path: {ts, deleted?, data?}}, images: {imageId: {fileId, ts}}}`) plus one file per photo.
  - `runSync` merges the two copies, keeping the newer doc on each side. It drops tombstones older than 90 days, uploads missing photos and deletes photos no recipe has used for a day. Missing photos are downloaded on demand (`fetchDriveImage`).
  - Sign-in uses Google Identity Services' token client with the `drive.file openid email` scope. Tokens last an hour and aren't refreshed silently, so when one expires the header chip shows "Reconnect Drive".
  - `GOOGLE_CLIENT_ID` in `app.js` holds the OAuth web client from Google Cloud project "Forkast" (owner MichelleAndZac@gmail.com, published to production, origins https://miandza.github.io and http://localhost:8080). If it's empty, sync is hidden.
  - Sync runs on load, 2.5 s after a change, when the page becomes visible, when the device comes back online, and every 5 minutes.
  - To test without Google: serve a copy of `app.js` with a dummy client ID and the GIS script URL blanked out, with a fake `window.google` and a fake `fetch` for googleapis URLs loaded first.
- Data paths and recipe fields match the Artifact data model below. Differences: images live in the backend's image store, shown through object URLs (`imgUrls`, `loadImages`), not `/_blob/`. TheMealDB recipes also store `thumbUrl`.
- Add recipe: **Link**, **Paste** (heuristic `parseRecipeText`, no AI), **Type**, **Photo**, **Import**.
  - Link (`drawLinkAdd`, `readRecipeLink`): the page comes through a reader, because a static site can't fetch other sites. First `READER_URL` (the user's own Google Apps Script from `reader/Code.gs`; empty until they deploy it), then Jina's free reader `r.jina.ai` (CORS allowed). Jina's HTML (`X-Return-Format: html`) gives the schema.org Recipe JSON-LD (`findLdRecipe`, `ldToRecipe`). If there's none, Jina's markdown is trimmed by `mdRecipeText` and parsed by `parseRecipeText`. The page photo is saved as `thumbUrl`.
  - `READER_URL` is set: the user's "Forkast reader" Apps Script web app (MichelleAndZac@gmail.com, runs as them, access "Anyone"). After editing `reader/Code.gs`, the user must paste it into script.google.com and use Deploy → Manage deployments → edit → New version, so the URL stays the same.
  - Dotdash Meredith sites (Allrecipes, Serious Eats, Simply Recipes, EatingWell…) block both readers on purpose (Apps Script gets 402, Jina 451). Don't try to evade that; those recipes come in from the user's own browser instead (below).
  - Shared links: `?url=` or `?text=` on load opens the Link tab and reads it. `grabRecipe` (a self-contained function whose source becomes the bookmarklet and `SHORTCUT_JS`) runs on the open recipe page and opens Forkast with `#s=<base64url of {u: page URL, r: compact Recipe, photo?: 400px JPEG data URL}>`. The payload goes after `#` because it can be ~50 KB with the photo, and servers refuse long query strings (HTTP 414). Older `?s=` and `#ld=` links still work. Boot opens it in the editor with the photo as a pending image, so it's saved and synced like a user's photo. The photo is copied because the Allrecipes family's image CDN is behind bot protection: a `thumbUrl` from those sites only loads on a device that recently visited the site. If a recipe with the same `sourceUrl` exists, the photo is added to it instead of making a duplicate. On computers (Chrome, Edge, Firefox), `bookmarkHelp()` explains setting up the bookmarklet (drag it, or copy its address into a new bookmark); it's in the Link tab's help and appears under the error when a blocked site fails (`readRecipeLink` throws with `blocked: true`). The iPhone shortcut is a single Run JavaScript on Web Page action (`SHORTCUT_JS`), which sets `location.href` in the Safari tab itself. Don't route it through Open URLs: that action scans the text for links, opened about 30 broken pages for the full JSON-LD, and cut the base64 link down to `…/forkast/?s` (seen in the "Last shared link" note in Your data, which logs what each shared link looked like on arrival). The manifest's `share_target` handles Android. Pasting a lone URL in Paste also reads it.
  - Photo: on-device text recognition with Tesseract.js 5.1.1, loaded from jsdelivr on first use (`loadTesseract`, `ocrImages`). The text goes through `parseRecipeText`, and the photos are saved with the recipe.
  - Tesseract reads printed text well and handwriting poorly. For handwriting, use "Fill in by hand" or the artifact's Claude reader.
- Export/import format: `{format: "larder-export", version: 1, exportedAt, recipes: [{id, ...recipe, images: [dataURL]}], plans?, shopping?}`. Both apps write it, and the web app reads it (`parseExport`, `importData`). Importing a recipe whose id already exists replaces it.
- Print (recipe detail, Shopping): `preparePrint` fills `#printArea` with a plain layout (`recipePrintHtml`, `shopPrintHtml`) and `printNow` adds `body.printing` and calls `window.print()`; `@media print` in `styles.css` hides everything else. A recipe's printout is prepared when its detail opens, so the photo has loaded and `print()` can run straight from the tap (iOS Safari needs that).
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
