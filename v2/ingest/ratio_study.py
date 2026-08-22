#!/usr/bin/env python3
"""IAAO ratio study statistics for the published municipality bundle.

Computes median ratio, COD (horizontal equity), PRD and PRB (vertical
equity) from arm's-length sales, stratified by year, property class, and
value quintile, with bootstrap confidence intervals.

Imported by ingest.py:

    from ratio_study import build_ratio_study
    bundle["ratio_study"] = build_ratio_study(con, rates)

Requires the `parcels` table to carry sale columns -- see SALE_COLUMNS
below and the patch notes in README_ratio_study.md.
"""
import math
import random
import statistics

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Raw MOD-IV column names in the Rutgers HDB extract, confirmed via
# probe_sale_fields.py. These are aliased to canonical names by
# CANONICAL_SELECT in ingest.py; this block is a record of the mapping.
#   sales_price_code is NOT a price -- it is empty in the extract and is a
#   code field. Use sale_price.
SALE_COLUMNS = {
    "sale_price": "sale_price",
    "sale_date": "deed_date_MMDDYY",              # 6-digit, century-pivoted at 30
    "sale_assessment": "sale_assessment",         # assessment in force at sale
    "nu_code": "sale_sr1a_non_usable_code",       # SR-1A non-usable transaction code
}

# Values in the SR-1A code field that mean "usable". The convention CHANGED
# around 2021: earlier vintages leave the field blank, later ones write an
# explicit '00'. Confirmed by cross-tab (nu_by_year.py) on the Glen Ridge
# extract -- blank spans 1981-2024 with 3,183 events but only 110 from 2021
# on, while '00' appears exclusively in 2021-2024 with 261 events and a
# median ratio of 0.659, which sits on the modern equalization ratio rather
# than on the repeat-weighted historical one.
#
# Do not compare one code's median ratio against another's to decide
# usability: ratios move with the assessment era, so two codes from
# different decades will always differ regardless of what they mean. Compare
# each code's ratio against the equalization ratio for ITS OWN years, and
# check the year span, which is what the cross-tab is for.
USABLE_NU_CODES = {"", "00"}

MIN_SALES = 30          # below this, suppress statistics entirely
TRIM_IQR_MULT = 1.5     # outlier trim on the ratio distribution
BOOTSTRAP_N = 2000
MIN_PRICE = 25_000      # nominal-consideration floor
MAX_SALE_AGE = 1        # sale year must be within N years of an assessment year

# A town of ~2,400 parcels turns over roughly 60-80 usable sales a year, and
# older years are thinner still. Pooling a centered multi-year window is
# standard ratio-study practice for small jurisdictions: it trades temporal
# resolution for a sample large enough to say anything. Windows are computed
# alongside strict single years, never instead of them.
ROLLING_WINDOWS = (3, 5)

# IAAO Standard on Ratio Studies benchmarks, carried into the bundle so the
# frontend does not hard-code them.
BENCHMARKS = {
    "cod": {"good": 10.0, "acceptable": 15.0},   # older heterogeneous residential
    "prd": {"low": 0.98, "high": 1.03},
    "prb": {"low": -0.05, "high": 0.05},
}


class RatioStudyUnavailable(Exception):
    """Raised when the source data cannot support a ratio study."""


# ---------------------------------------------------------------------------
# Sale extraction
# ---------------------------------------------------------------------------

def has_sale_data(con) -> bool:
    """True if the parcels table carries a usable sale price column."""
    cols = {r[0] for r in con.execute("DESCRIBE parcels").fetchall()}
    return "sale_price" in cols and "sale_year" in cols


def build_sales(con):
    """Create a `sales` table of deduplicated, filtered sale events.

    MOD-IV carries only the *most recent* sale per parcel as of each annual
    snapshot, so a panel of N year-files yields at most N sale events per
    parcel. Union them and dedupe on (pin, sale_year, sale_price).

    The assessment paired with each sale is the one in force *before* the
    sale where possible. Using the post-sale assessment would let any sales
    chasing in the data inflate the quality metrics -- the exact artifact a
    ratio study is supposed to expose.
    """
    if not has_sale_data(con):
        raise RatioStudyUnavailable(
            "parcels table has no sale_price/sale_year columns -- "
            "patch CANONICAL_SELECT in ingest.py (see README_ratio_study.md)"
        )

    # One row per distinct sale event. A parcel appearing in three annual
    # snapshots contributes at most three events, and usually fewer, since
    # later snapshots repeat the same most-recent sale.
    con.execute("""
        CREATE OR REPLACE TABLE sale_events AS
        SELECT pin, sale_year, sale_price,
               max(sale_assessment) AS sale_assessment
        FROM parcels
        WHERE sale_price IS NOT NULL
          AND sale_price >= ?
          AND sale_year IS NOT NULL
          AND (nu_code IS NULL OR lower(trim(nu_code)) IN ?)
        GROUP BY pin, sale_year, sale_price
    """, [MIN_PRICE, list(USABLE_NU_CODES)])

    # Class and address are stable enough to take from the parcel's latest
    # snapshot; keeping them out of the assessment join means a sale can
    # still be used when sale_assessment is present but no panel year is
    # near enough to match.
    con.execute("""
        CREATE OR REPLACE TABLE parcel_meta AS
        SELECT pin,
               arg_max(prop_class, year) AS prop_class,
               arg_max(address, year)    AS address
        FROM parcels GROUP BY pin
    """)

    # Pair each sale with an assessment. Preference order:
    #   1. sale_assessment from MOD-IV (assessment in force at sale)
    #   2. panel assessment for the sale year
    #   3. panel assessment within MAX_SALE_AGE years, preferring earlier
    con.execute(f"""
        CREATE OR REPLACE TABLE sales AS
        WITH paired AS (
            SELECT
                s.pin,
                s.sale_year,
                s.sale_price,
                coalesce(nullif(s.sale_assessment, 0), p.total_assessed) AS assessed,
                p.year AS assessment_year,
                CASE WHEN nullif(s.sale_assessment, 0) IS NOT NULL
                     THEN 'mod_iv_sale_assessment'
                     WHEN p.year = s.sale_year THEN 'panel_same_year'
                     WHEN p.year IS NOT NULL   THEN 'panel_nearby_year'
                     ELSE 'unpaired' END AS assessment_source,
                row_number() OVER (
                    PARTITION BY s.pin, s.sale_year, s.sale_price
                    ORDER BY abs(coalesce(p.year, 9999) - s.sale_year), p.year
                ) AS rn
            FROM sale_events s
            LEFT JOIN parcels p
              ON p.pin = s.pin
             AND p.year BETWEEN s.sale_year - {MAX_SALE_AGE}
                            AND s.sale_year + {MAX_SALE_AGE}
        )
        SELECT paired.pin, sale_year, sale_price, assessed, assessment_year,
               m.prop_class, m.address, assessment_source
        FROM paired JOIN parcel_meta m ON m.pin = paired.pin
        WHERE rn = 1 AND assessed IS NOT NULL AND assessed > 0
    """)

    kept = con.execute("SELECT count(*) FROM sales").fetchone()[0]
    total = con.execute("SELECT count(*) FROM sale_events").fetchone()[0]
    return kept, total


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

def _trim(pairs):
    """Drop ratio outliers beyond TRIM_IQR_MULT * IQR. pairs = [(assessed, price)]."""
    if len(pairs) < 5:
        return pairs
    ratios = sorted(a / p for a, p in pairs)
    n = len(ratios)
    q1 = ratios[int(0.25 * (n - 1))]
    q3 = ratios[int(0.75 * (n - 1))]
    iqr = q3 - q1
    lo, hi = q1 - TRIM_IQR_MULT * iqr, q3 + TRIM_IQR_MULT * iqr
    return [(a, p) for a, p in pairs if lo <= a / p <= hi]


def _cod(ratios, median):
    if median == 0:
        return None
    avg_abs_dev = sum(abs(r - median) for r in ratios) / len(ratios)
    return 100 * avg_abs_dev / median


def _prd(pairs):
    """mean ratio / weighted mean ratio. Above 1.0 => regressive."""
    ratios = [a / p for a, p in pairs]
    mean_ratio = sum(ratios) / len(ratios)
    total_assessed = sum(a for a, _ in pairs)
    total_price = sum(p for _, p in pairs)
    if not total_price:
        return None
    weighted = total_assessed / total_price
    return mean_ratio / weighted if weighted else None


def _prb(pairs, median):
    """Price-related bias: OLS slope of proportional ratio deviation on log2(value).

    Per IAAO, the independent variable uses a value proxy that blends the
    two observations of value -- (assessment / median_ratio + price) / 2 --
    so neither side alone drives the regression.
    """
    if median <= 0 or len(pairs) < 5:
        return None
    xs, ys = [], []
    for assessed, price in pairs:
        value = 0.5 * (assessed / median + price)
        if value <= 0:
            continue
        ys.append(((assessed / price) - median) / median)
        xs.append(math.log(value, 2))
    if len(xs) < 5:
        return None
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denom


def _point_stats(pairs):
    ratios = [a / p for a, p in pairs]
    median = statistics.median(ratios)
    return {
        "n": len(pairs),
        "median_ratio": round(median, 4),
        "mean_ratio": round(sum(ratios) / len(ratios), 4),
        "weighted_mean_ratio": round(
            sum(a for a, _ in pairs) / sum(p for _, p in pairs), 4
        ),
        "cod": round(_cod(ratios, median), 2) if _cod(ratios, median) else None,
        "prd": round(_prd(pairs), 4) if _prd(pairs) else None,
        "prb": round(_prb(pairs, median), 4) if _prb(pairs, median) is not None else None,
    }


def _bootstrap_ci(pairs, seed=20260815):
    """Percentile bootstrap CIs for COD, PRD and PRB.

    With 80-120 usable sales a year these intervals are wide. Publishing
    them is what keeps the feature honest: COD 16.2 [11.8, 21.4] tells a
    different story than a bare 16.2.
    """
    rng = random.Random(seed)
    cods, prds, prbs = [], [], []
    n = len(pairs)
    for _ in range(BOOTSTRAP_N):
        sample = [pairs[rng.randrange(n)] for _ in range(n)]
        ratios = [a / p for a, p in sample]
        med = statistics.median(ratios)
        if med <= 0:
            continue
        c = _cod(ratios, med)
        if c is not None:
            cods.append(c)
        d = _prd(sample)
        if d is not None:
            prds.append(d)
        b = _prb(sample, med)
        if b is not None:
            prbs.append(b)

    def pct(vals):
        if len(vals) < 100:
            return None
        vals = sorted(vals)
        lo = vals[int(0.025 * (len(vals) - 1))]
        hi = vals[int(0.975 * (len(vals) - 1))]
        return [round(lo, 4), round(hi, 4)]

    return {"cod_ci": pct(cods), "prd_ci": pct(prds), "prb_ci": pct(prbs)}


def compute(pairs, with_ci=True):
    """Full statistics for one stratum. Returns None if under MIN_SALES."""
    pairs = [(a, p) for a, p in pairs if a > 0 and p > 0]
    if len(pairs) < MIN_SALES:
        return {"n": len(pairs), "suppressed": True}
    trimmed = _trim(pairs)
    if len(trimmed) < MIN_SALES:
        return {"n": len(trimmed), "suppressed": True}
    out = _point_stats(trimmed)
    out["n_trimmed"] = len(pairs) - len(trimmed)
    if with_ci:
        out.update(_bootstrap_ci(trimmed))
    return out


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def _quintile_bounds(prices):
    s = sorted(prices)
    return [s[int(q * (len(s) - 1))] for q in (0.2, 0.4, 0.6, 0.8)]


def build_ratio_study(con, rates=None, residential_only=True):
    """Return the ratio_study block for the published bundle."""
    rates = rates or {}
    kept, total = build_sales(con)

    where = "WHERE prop_class = '2'" if residential_only else ""
    rows = con.execute(f"""
        SELECT sale_year, prop_class, sale_price, assessed, assessment_source
        FROM sales {where} ORDER BY sale_year, sale_price""").fetchall()

    if not rows:
        raise RatioStudyUnavailable("no sales survived filtering")

    by_year, sources = {}, {}
    for year, cls, price, assessed, source in rows:
        by_year.setdefault(year, []).append((float(assessed), float(price)))
        sources[source] = sources.get(source, 0) + 1

    year_stats, quintile_stats = [], []
    all_years = list(range(min(by_year), max(by_year) + 1))

    for year in sorted(by_year):
        rec = compute(by_year[year])
        rec["year"] = year
        rec["reval_year"] = bool(rates.get(year, {}).get("reval_flag"))
        rec["state_equalization_ratio"] = rates.get(year, {}).get("equalization_ratio")
        year_stats.append(rec)

    # Rolling windows: for each center year, pool the smallest window that
    # clears MIN_SALES. Years that qualify on their own are kept at width 1
    # so the series does not smooth away detail it does not need to.
    window_stats = []
    for year in all_years:
        pool, width = by_year.get(year, []), 1
        if len(pool) < MIN_SALES:
            for w in ROLLING_WINDOWS:
                half = w // 2
                pool = [p for y in range(year - half, year + half + 1)
                        for p in by_year.get(y, [])]
                width = w
                if len(pool) >= MIN_SALES:
                    break
        if len(pool) < MIN_SALES:
            continue
        rec = compute(pool)
        rec["year"] = year
        rec["window"] = width
        rec["reval_year"] = bool(rates.get(year, {}).get("reval_flag"))
        rec["state_equalization_ratio"] = rates.get(year, {}).get("equalization_ratio")
        window_stats.append(rec)

        # Quintiles ride on the same pool that produced the statistics, so
        # the two views never disagree about which sales they describe.
        bounds = _quintile_bounds([p for _, p in pool])
        buckets = {}
        for assessed, price in pool:
            q = sum(1 for b in bounds if price > b) + 1
            buckets.setdefault(q, []).append((assessed, price))
        for q in sorted(buckets):
            sub = buckets[q]
            ratios = [a / p for a, p in sub]
            quintile_stats.append({
                "year": year,
                "window": width,
                "quintile": q,
                "n": len(sub),
                "price_floor": round(min(p for _, p in sub)),
                "price_ceiling": round(max(p for _, p in sub)),
                "median_ratio": round(statistics.median(ratios), 4),
            })

    return {
        "by_year": year_stats,
        "by_window": window_stats,
        "by_quintile": quintile_stats,
        "sales": [
            {"year": y, "price": round(p), "assessed": round(a)}
            for y, _, p, a, _ in rows
        ],
        "benchmarks": BENCHMARKS,
        "method": {
            "trim": f"{TRIM_IQR_MULT}_iqr",
            "min_n": MIN_SALES,
            "rolling_windows": list(ROLLING_WINDOWS),
            "bootstrap_n": BOOTSTRAP_N,
            "min_price": MIN_PRICE,
            "filters": [
                "non_usable_codes_excluded" if SALE_COLUMNS.get("nu_code")
                else "NO_NU_CODE_FILTER_heuristics_only",
                f"price_gte_{MIN_PRICE}",
                "class_2_only" if residential_only else "all_classes",
            ],
            "assessment_pairing": sources,
            "sales_kept": kept,
            "sales_before_pairing": total,
            "caveat": (
                "Assessments are paired with the tax year in force at or nearest "
                "the sale. Where the panel lacks the sale year, the nearest "
                "available year within "
                f"{MAX_SALE_AGE} year(s) is used; those strata are less reliable."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Standalone CLI (for iterating without rerunning the full ingest)
# ---------------------------------------------------------------------------

def main():
    import argparse
    import glob
    import json
    import os
    import sys

    import duckdb

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from ingest import CANONICAL_SELECT, load_rates

    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", required=True)
    ap.add_argument("--rates", default=None)
    ap.add_argument("--out", default=None, help="write JSON here; else stdout summary")
    ap.add_argument("--all-classes", action="store_true")
    args = ap.parse_args()

    con = duckdb.connect()
    paths = sorted(glob.glob(os.path.join(args.raw_dir, "mod_iv_*.csv")))
    if not paths:
        sys.exit(f"no mod_iv_*.csv in {args.raw_dir}")
    unions = " UNION ALL ".join(CANONICAL_SELECT.format(path=p) for p in paths)
    con.execute(f"CREATE OR REPLACE TABLE parcels AS {unions}")

    try:
        study = build_ratio_study(
            con, load_rates(args.rates), residential_only=not args.all_classes
        )
    except RatioStudyUnavailable as e:
        sys.exit(f"ratio study unavailable: {e}")

    if args.out:
        with open(args.out, "w") as f:
            json.dump(study, f, indent=2)
        print(f"wrote {args.out}")

    print(f"\n{'year':>6} {'n':>5} {'median':>8} {'COD':>7} {'PRD':>7} {'PRB':>7}")
    for r in study["by_year"]:
        if r.get("suppressed"):
            print(f"{r['year']:>6} {r['n']:>5}   (suppressed, n < {MIN_SALES})")
            continue
        flag = " *reval" if r.get("reval_year") else ""
        print(f"{r['year']:>6} {r['n']:>5} {r['median_ratio']:>8.3f} "
              f"{r['cod']:>7.1f} {r['prd']:>7.3f} "
              f"{r['prb'] if r['prb'] is not None else float('nan'):>7.3f}{flag}")
    print("\npairing sources:", study["method"]["assessment_pairing"])


if __name__ == "__main__":
    main()
