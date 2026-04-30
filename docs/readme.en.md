# 100BeautiesLab. Creations DB (Web) — README (English)

This document is an English, reader-friendly version of the technical parts of `README.md`.

- Viewer UI: `pages/characters.html`
- Viewer guide (JP): `docs/viewer-guide.md`
- DB update guidelines (JP): `docs/db-update-guidelines.md`
- Third-party policy (JP): `docs/third-party-policy.md`

> Note: The _Primary/Secondary Works Guidelines_ at the beginning of `README.md` are treated as the source of truth for licensing and permissions.

---

## 1. What is this repository?

**100BeautiesLab. Creations DB (Web)** is a static web database for original characters.
It runs on GitHub Pages and provides:

- A viewer UI (character sheet) implemented with vanilla JavaScript
- A pseudo-API implemented by Service Workers (`/api/v1/*`, `/pages/v1/*`, `/svc/v1/*`)
- JSON databases and schema-like definitions under `data/**`

---

## 2. How to view characters (UI)

1. Open `pages/characters.html`
2. Select a Work (series) from the dropdown
3. Select a DB type (e.g. Primary)
4. Use the search box, then click a card to open details

### Direct link (URL parameters)

Character details can be opened directly with URL parameters.

- Example: `?work=NumberTales&db=Primary&idx=2&idxKey=Num`

Parameter overview:

- `work`: Work ID (e.g. `NumberTales`)
- `db`: DB type (e.g. `Primary`)
- `idx`: index value (number/card/etc.)
- `idxKey`: index key (e.g. `Num`, `Card.Num`)

Legacy compatibility:

- `num` may be interpreted as a legacy parameter (typically for `Num`).

---

## 3. Data structure overview (`data/**`)

High-level layout:

- `data/db_meta.json`: global metadata (works list, dictionaries, display/link helpers)
- `data/db_type.json`: global type definitions (`$DefType`)
- `data/Works_<WorkName>/DataBases/`: per-work DB JSON, per-work meta/type definitions
- `data/Works_<WorkName>/Images/`: per-work images (`General/`, `DB_*`, `Ref_*`)

DB files follow `db_<Type>.json` naming (e.g. `db_Primary.json`).

---

## 4. Schema-driven design (important)

This project prefers **schema-driven** behavior:

- UI and Service Worker behavior should follow `db_type.json` (`$DefType`) whenever practical.
- Display labels prefer `hashTag_JP` (or legacy `hashtag_JP`) if present; otherwise fall back to field names.
- When adding fields to data, update `$DefType` accordingly to keep rendering/search/enrichment consistent.

---

## 5. Pseudo API (Service Worker)

On GitHub Pages (static hosting), this repository uses Service Workers to provide pseudo API endpoints.

### 5.1 Main endpoints (`/api/v1/*`)

Examples:

- `GET /api/v1/index` — overview of works
- `GET /api/v1/works` — list of works (keys/titles)
- `GET /api/v1/works/{work}` — work metadata
- `GET /api/v1/works/{work}/db` — available DB types for the work
- `GET /api/v1/works/{work}/db/{dbName}` — records (use `?resolve=0` to disable resolution)
- `GET /api/v1/search?works={work}&db={dbName}&hashTag={k}&key={v}` — simple AND search

### 5.2 Definition endpoints

Definition data is only returned by these endpoints:

- `GET /api/v1/varsdef` (and variants) — field dictionary (`General.$VarsDef`)
- `GET /api/v1/typedef` or `GET /api/v1/deftype` (and variants) — `$DefType`
- `GET /api/v1/defs` (and variants) — combined view

---

## 6. Character-sheet API (`/pages/v1/*`)

The viewer page uses `/pages/v1/*` endpoints which generally include enrichment.

Examples:

- `GET /pages/v1/works`
- `GET /pages/v1/works/{work}/db`
- `GET /pages/v1/works/{work}/db/{dbName}` (with enrichment)
- `GET /pages/v1/bootstrap` (enriched bootstrap)
- `GET /pages/v1/search` (enriched search)

---

## 7. Reference resolution (`_DBLink`)

Records may contain `_DBLink` fields to link to other DB records.
The enrichment layer can resolve these references and display related records.

Supported reference shape (conceptual):

```json
{
  "_DBLink": {
    "WorkName": {
      "DatabaseName": ["CharacterID1", "CharacterID2"]
    }
  }
}
```

---

## 8. Development and tests

- Contribution rules: `CONTRIBUTING.md`
- How to run tests: `README.test.md`
- Run tests (Vitest): `npm test`

> When making large changes (data, Service Worker routing, common libs), the project expects tests to pass and (when applicable) local verification via an HTTP server.

---

## 9. Policies for third parties

For redistribution, commercial use, AI training/dataset usage, and other third-party topics:

- `docs/third-party-policy.md`

For database update rules (contributors/editors):

- `docs/db-update-guidelines.md`
