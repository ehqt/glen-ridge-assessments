# Glen Ridge Assessments — frontend

Static React + Vite app. All data comes from `public/data/glen-ridge.json.gz`
(produced by `../ingest/ingest.py`).

## Run locally
    npm install
    npm run dev

## Deploy to GitHub Pages
    npm run build          # outputs dist/
Then publish `dist/` via GitHub Actions (actions/deploy-pages) or a gh-pages
branch. `vite.config.js` uses base "./" so it works at any repo path.

## Refresh data
Rerun the ingest, then copy the new bundle:
    cp ../data/published/glen-ridge.json.gz public/data/
