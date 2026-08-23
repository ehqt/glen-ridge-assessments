# Glen Ridge Borough Assessments

A public-facing site for exploring thirty-seven years of property assessment
and tax data for Glen Ridge, New Jersey, built entirely from public records.

Live at **https://ehqt.github.io/glen-ridge-assessments/**

## Why this exists

After a home reassessment, a few basic questions turned out to be surprisingly
hard to answer:

- How often do home assessments actually happen?
- How big is the typical increase in assessed value?
- How much does the tax rate change?
- How much does the total tax on a house typically change?
- How does the total tax levy for Glen Ridge change over time?

Every one of these is answerable from public records. The assessments are
published, the levies are published, and the state's own valuation figures are
published. They are simply spread across three agencies, in formats that change
from decade to decade, and nobody had assembled them for one small borough.

A further question emerged once the data was in one place: everyone pays the
same tax rate, but is everyone assessed at the same share of what their home is
actually worth? That turns out to be measurable, and the answer is no.

## What the site does

| Tab | What it shows |
|---|---|
| **About** | Motivation, methodology, sources, and limitations |
| **The town** | Tax levy split by school / county / municipal purpose, the general tax rate, the ratable base against equalized market value, and exempt property |
| **One property** | Full assessment history for any parcel: land and improvement values, estimated market value, estimated tax, a 2026 projection input, and a Chapter 123 appeal screen |
| **A group** | The same history for a set of parcels, for comparing a street or block |
| **Is it fair?** | An IAAO-standard ratio study: assessment level, COD, PRB, and value-quintile analysis, with confidence intervals |
| **Glossary** | Definitions of the ~35 technical terms the subject requires |

Every chart exports to CSV.

### The ratio study

Each arm's-length sale since 1989 is paired with the assessment that property
carried at the moment it sold. The resulting assessment-to-sales ratios support
the standard uniformity statistics:

- **COD** (coefficient of dispersion) — whether similar homes are treated alike
- **PRD** and **PRB** — whether the assessment level tilts with property value
- **Value quintiles** — where any regressivity actually falls

Non-usable transfers are excluded per the state's SR-1A codes, ratios beyond
1.5×IQR are trimmed, and years under 30 usable sales are pooled into centered
3- or 5-year windows or withheld entirely. Because a town this size produces
only 60–110 usable sales a year, bootstrap confidence intervals accompany every
figure, and where an interval straddles an IAAO threshold the site says the data
cannot settle the question rather than picking a side.

## Data sources

| Source | Agency | Supplies |
|---|---|---|
| [MOD-IV Historical Database](https://modiv.rutgers.edu/) | Rutgers, Bloustein School | Every assessment. ~88,000 parcel-year records, 1989–2025 |
| [Property Tax Tables](https://www.nj.gov/dca/dlgs/resources/Property_Tax_info.shtml) | N.J. DCA, Division of Local Government Services | Levies, general tax rates, net valuation taxable |
| [Statistical Information](https://nj.gov/treasury/taxation/lpt/statdata.shtml) | N.J. Division of Taxation | Equalization (Director's) ratios, Chapter 123 common level ranges, SR-1A sales files |
| [Standard on Ratio Studies](https://www.iaao.org/) | IAAO | Methodology and the benchmark thresholds |

The state's online record of equalization ratios and tax rates begins in 1997.
Assessments go back to 1989, so estimated market value and estimated tax are
blank for the earliest years. The gap is in the public record, not the pipeline.

## Architecture

```
gr/
  ingest/          Python pipeline (DuckDB)
    ingest.py            main pipeline -> published bundle
    ratio_study.py       IAAO statistics, comps for the appeal screen
    rates_ingest.py      DCA workbooks -> rates.csv
    show_ratio_study.py  print the study from a bundle
    *.py                 one-off diagnostics (see below)
  data/
    raw/           source extracts (gitignored, not redistributed)
    rates.csv      normalized rate/levy/ratio table
    published/     pipeline output (gitignored)
  app/             React + Vite frontend
    public/data/   the bundle the site actually reads (committed)
    src/
```

There is no backend. The pipeline writes a single gzipped JSON bundle
(~470 KB) and the browser does everything else.

## Running the ingestion

### One-time setup

```bash
cd gr/ingest
python3 -m venv .venv
source .venv/bin/activate
pip install duckdb pandas xlrd openpyxl
```

Reactivate with `source .venv/bin/activate` in each new shell.

### Step 1 — rates (only when the source workbooks change)

Place the DCA workbooks in `data/raw/rates/`, named as the state names them
(`98taxes.xls` … `24taxes.xls`).

```bash
python rates_ingest.py --raw-dir ../data/raw/rates \
    --municipality "Glen Ridge" --out ../data/rates.csv
```

Read the warnings — a workbook that fails to parse does not stop the run.
Verify the equalization ratio came out as a fraction (`0.644`) rather than a
percentage (`64.4`). `reval_flag` is not in the DCA tables and can be set by
hand for 2008, 2019, and 2026; `ratio_study.py` otherwise detects revaluations
from the ratio series.

### Step 2 — the bundle

Place the Rutgers MOD-IV extract at `data/raw/mod_iv_data.csv`.

```bash
python ingest.py --raw-dir ../data/raw --rates ../data/rates.csv \
    --out ../data/published/glen-ridge.json.gz
cp ../data/published/glen-ridge.json.gz ../app/public/data/
```

The second command is not optional — the app reads from `app/public/data/`, and
skipping it silently serves stale numbers.

### Step 3 — check the output

```bash
python show_ratio_study.py
python show_ratio_study.py --quintiles 2024
```

The median assessment-to-sales ratio should track the state equalization ratio
closely in every year. That single comparison validates the date parsing, the
assessment pairing, and the non-usable filter simultaneously. If a year diverges
badly, suspect the pipeline before the assessor.

### Diagnostics

Used when the source data misbehaves; none are part of a normal run.

| Script | Answers |
|---|---|
| `probe_sale_fields.py` | Which sale columns exist in the raw extract |
| `diagnose_sale_dates.py` | Which date format the deed column actually uses |
| `check_nu_codes.py` | How "usable" is encoded in the SR-1A field |
| `nu_by_year.py` | Whether that encoding changed over time |
| `sale_funnel.py` | Where sales are being lost through the filters |

## Running locally

```bash
cd gr/app
npm install
npm run dev
```

Vite prints a local URL, usually `http://localhost:5173`.

A production build, served locally:

```bash
npm run build
npx vite preview
```

## Deploying to GitHub Pages

Deployment is automatic via `.github/workflows/deploy.yml`: every push to
`main` builds the app and publishes it.

**One-time setup:** in the repository, go to **Settings → Pages** and set
**Source** to **GitHub Actions**. Not "Deploy from a branch" — that ignores the
workflow.

**Every update:**

```bash
cp data/published/glen-ridge.json.gz app/public/data/
git add -A
git commit -m "Update data"
git push
```

The data bundle **must be committed**. The workflow cannot regenerate it,
because that would require the raw MOD-IV extract, which is large and not ours
to redistribute. The workflow checks for the file and fails with a clear error
rather than publishing a site with no data.

Two things already handled, so they don't need configuring: `vite.config.js`
uses `base: "./"` so the build works at any repository path, and `data.js`
decompresses the bundle with `DecompressionStream` because Pages serves
`.json.gz` as raw gzip bytes without a `Content-Encoding` header.

### If a deploy fails

| Symptom | Cause |
|---|---|
| `Creating Pages deployment failed … 404` | Pages source not set to GitHub Actions |
| Data check step fails | Bundle not committed — `git add -f app/public/data/glen-ridge.json.gz` |
| `npm ci` cannot find a package | Workflow paths don't match the repo layout; check `working-directory` |
| Page loads but shows a data error | 404 on the bundle — check the browser Network tab |

## Limitations

MOD-IV carries no floor area, so nothing here adjusts for the size or condition
of a house. Two properties with identical assessments can be worth very
different amounts, which particularly limits the comparable-sales estimate
behind the appeal screen — it is a rough screen, not an appraisal.

The appeal screen also runs on the pre-2026 roll. Chapter 123 does not apply in
a revaluation year, so it is background reading until the 2027 cycle.

Between 1998 and 1999, MOD-IV renumbered 196 parcels. Any parcel-level series
joined on the parcel identifier breaks across that boundary.

Owner names are never displayed, per New Jersey's Daniel's Law.

## Disclaimer

An independent project. Not affiliated with Glen Ridge Borough, Essex County,
or the State of New Jersey, and not an official record. Nothing here is legal or
tax advice. For anything consequential, consult the borough assessor's office or
the Essex County Board of Taxation.
