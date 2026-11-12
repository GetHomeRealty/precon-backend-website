# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Get Home Realty** marketing website — a static, multi-page site (no build step, no
framework). Get Home Realty operates as a GTA / Mississauga, Ontario brokerage and also
runs project directories for **Hyderabad** and **Visakhapatnam (Vizag)**, India. Site copy
mixes both markets; follow whatever the current task specifies.

- **Stack:** plain HTML + CSS + vanilla JS (ES5/ES6, no transpiler).
- **Maps:** Leaflet 1.9.4 + Leaflet.markercluster 1.5.3 (loaded from unpkg CDN).
- **Tiles:** CartoDB (light basemap + labels) and Esri World Imagery (satellite).
- **No package.json, no bundler.** Files are served/opened as-is.

## Run / preview

There is nothing to build. Open a page directly, or serve the folder statically so the
relative `assets/js/*.js` and `assets/img/*` load correctly:

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Open pages through the server (or the site folder) — not as bare `file://` — so the shared
chrome and `assets/js/data.js` load. Map tiles and hotlinked project images require internet.

## Layout

```
index.html                 Home
about.html                 About / team
services.html              Services hub
hyderabad.html             Hyderabad — interactive project map + directory
visakhapatnam.html         Visakhapatnam — interactive project map + directory
buyers.html sellers.html investors.html join.html contact.html blog.html
property-detail.html       Project deep-dive shell
assets/
  css/styles.css           ALL styles (single stylesheet)
  js/
    data.js                Data layer (the "CMS") — edit this to manage content
    main.js                Shared chrome (nav/footer), icons, property cards
    maps.js                City maps, project modal, project directory
  img/                     Local images (project renders under img/projects/<id>/)
```

## Architecture

**Everything hangs off a single global namespace, `window.GHR`.** Load order per page is
`leaflet` → `markercluster` → `data.js` → `/api/public/content.js` → `cms.js` → `main.js` → `maps.js` → inline page init.

**Admin panel / CMS:** `admin-app/` is a separate Next.js app (admin at `/admin`, Postgres via
Supabase, deployed on Vercel with Root Directory `admin-app`). It serves the root site unchanged
and publishes DB content through `/api/public/content.js` (`window.GHR_CMS`). `assets/js/cms.js`
overlays that onto `data.js` and the pages (`data-cms="…"` hooks). With no API the site falls back
to its built-in content. Forms POST to `/api/public/leads`. See `admin-app/README.md`.

**SEO:** when served by `admin-app`, every page's `<head>` (title, meta, canonical, OG, JSON-LD) is
rendered server-side (`admin-app/lib/seo/*`). Don't set titles/meta from page JS. Clean URLs
(`/properties/…`, `/projects/…`, `/agents/…`, `/real-estate/…`, `/videos/…`) are server-rendered with
the site's existing CSS classes and chrome. They use `<base href="/">`, so the shared relative nav links still work.

- **`data.js`** defines the content. Key structures:
  - `GHR_PROPERTIES` — sample/marketing listings (cards on home/services).
  - `GHR_PRECON` — pre-construction entries.
  - `GHR_DEVELOPERS` — the **real** project set plotted on the city maps
    (~53 projects: 38 Hyderabad + 15 Visakhapatnam). Each record has
    `id, name, developer, city, area, lat, lng, rate, sizes, config, kind, status`.
    Coordinates are **locality-level only** (no exact house numbers).
  - `GHR_DETAILS` — per-project modal content, keyed by project `id`.
  - `GHR_IMAGES` — real gallery image paths, keyed by project `id`.
- **`main.js`** injects shared header/footer into `data-gh-header` / `data-gh-footer`
  placeholders, and owns the `NAV` array, brand markup, social icons (`window.GHR.ICON`,
  `SOCIAL`), and `propCard` / `imgFor` helpers. **Add/rename nav items in the `NAV`
  array here** — do not hand-edit nav markup in each page.
- **`maps.js`** exposes `window.GHR.initCityMap`, `openProjectModal`,
  `openProjectModalById`. Each page ends with an inline `GHR_PAGE_INIT`-style call.

### City maps (`initCityMap`)

Called at the bottom of the two city pages:

```js
window.GHR.initCityMap({
  mapId:'map-hyd', center:[17.46,78.36], city:'Hyderabad',
  devListId:'hydDevList', devFiltersId:'hydDevFilters', devEmptyId:'hydDevEmpty'
});
```

It filters `GHR_DEVELOPERS` by `city`, renders the filterable directory, and plots markers.
Current styling (reference-matched to a Mapbox real-estate look):

- **Default basemap:** CartoDB `light_all` (muted light-gray). A Leaflet layers control
  offers a **Map / Satellite** (Esri + labels) switch, top-right.
- **Markers:** flat solid **green dots** `#4CAF50` (`.gh-pin`, built by `greenDot()`),
  not the old red teardrops.
- **Clustering:** markers join an `L.markerClusterGroup` that renders green **"+N"**
  bubbles (`.gh-cluster`); it degrades to plain markers if the library is missing.
- Hover a marker → popup; click → `flyTo`. The directory list, area/price filters,
  "Locate on map" (from the modal), and `?project=<id>` deep links are all cluster-aware.

Marker/cluster CSS lives in `assets/css/styles.css` (`.gh-pin`, `.gh-cluster`).

## Conventions & guardrails

- **Minimal footprint.** Prefer restyling/editing existing pages in place over adding new
  files. A standalone map page was explicitly rejected — keep map behaviour inside the
  existing Hyderabad/Visakhapatnam pages unless asked otherwise.
- **Iterative and reversible.** Make changes easy to revert; avoid sweeping rewrites.
- **Content edits go in `data.js`**, not scattered through HTML. Adding a project there
  makes it appear on the map and directory automatically.
- **Gallery rule (enforced):** show only each project's **own** real images. No stock
  padding, no duplicates within a project, no image shared across projects. When a project
  has no image, use the branded gradient fallback (`dv-img--noimg` / `pop-img--noimg` /
  `pm-gallery--empty`) — never a broken image or a borrowed photo.
- **No fabricated data.** `GHR_DEVELOPERS` has `config` (BHK) and `sizes` but **no
  bathrooms** — popups show BHK + size; do not invent bath counts. To surface baths, add a
  real `baths` field to the records first.
- **Brand tokens:** cherry red `#CE1126`, navy `#122340`, gold accent. (City-map markers
  are green `#4CAF50` by request — a deliberate exception, not the site brand.)
- **Naming:** "GHR Trivana" (Hyderabad) is by an unrelated builder, *GHR Infra* — not Get
  Home Realty. Leave the name as-is.

## Gotchas

- Map tile CDNs and many hotlinked project-image hosts are blocked in sandboxed/offline
  environments; they load fine in a normal browser with internet.
- All styling is in one file (`assets/css/styles.css`) — search there before adding CSS.
- Because pages share chrome via `main.js`, test nav/footer changes on more than one page.
- Keep the script load order intact (`data.js` before `main.js`/`maps.js`).
