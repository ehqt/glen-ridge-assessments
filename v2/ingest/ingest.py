#!/usr/bin/env python3
"""Ingest Rutgers MOD-IV HDB CSVs into a published municipality bundle.

Usage:
    python ingest.py --raw-dir ../data/raw --rates ../data/rates.csv \
        --out ../data/published/glen-ridge.json.gz

Reads every mod_iv_*.csv in --raw-dir (any mix of years; tax year is taken
from the mod_iv_year column, never the filename), maps to the canonical
schema, validates, joins the municipality-year rate table, and writes one
gzipped JSON bundle for the frontend.
"""
import argparse
import glob
import gzip
import json
import os
import sys

import duckdb

from ratio_study import RatioStudyUnavailable, build_ratio_study

CANONICAL_SELECT = """
SELECT
    CAST(mod_iv_year AS INTEGER)                    AS year,
    gis_pin                                         AS pin,
    trim(property_id_blk)                           AS block,
    trim(property_id_lot)                           AS lot,
    coalesce(trim(property_id_qualifier), '')       AS qual,
    trim(property_location)                         AS address,
    trim(property_class)                            AS prop_class,
    CAST(land_value AS BIGINT)                      AS land_value,
    CAST(improvement_value AS BIGINT)               AS improvement_value,
    CAST(land_value AS BIGINT)
      + CAST(improvement_value AS BIGINT)           AS total_assessed,
    CAST(net_taxable_value AS BIGINT)               AS net_taxable,
    TRY_CAST(last_year_total_tax AS BIGINT)         AS prior_year_tax,
    TRY_CAST(calculated_acreage AS DOUBLE)          AS acreage,
    TRY_CAST(year_constructed AS INTEGER)           AS year_built,
    TRY_CAST(deduction_amount AS BIGINT)            AS deduction_amount,
    TRY_CAST(sale_price AS BIGINT)                  AS sale_price,
    TRY_CAST(sale_assessment AS BIGINT)             AS sale_assessment,
    nullif(trim(sale_sr1a_non_usable_code), '')     AS nu_code,
    -- Column is named deed_date_MMDDYY but the extract ships a real date
    -- (ISO / timestamp), not a 6-digit string. The name lies; trust the data.
    -- Parses 30,757 of 30,765 usable-sale rows, range 1981-2024.
    EXTRACT(year FROM TRY_CAST(trim(deed_date_MMDDYY) AS DATE))
                                                    AS sale_year,
    trim(building_description)                      AS building_desc,
    trim(mod_iv_munis_name)                         AS municipality
FROM read_csv_auto('{path}', all_varchar=true)
"""


def load_raw(con, raw_dir):
    paths = sorted(glob.glob(os.path.join(raw_dir, "mod_iv_*.csv")))
    if not paths:
        sys.exit(f"no mod_iv_*.csv files in {raw_dir}")
    unions = " UNION ALL ".join(CANONICAL_SELECT.format(path=p) for p in paths)
    con.execute(f"CREATE OR REPLACE TABLE parcels AS {unions}")
    return paths


def validate(con):
    """Run QA checks. Returns (errors, report_lines). Errors abort publish."""
    errors, report = [], []
    q = lambda sql: con.execute(sql).fetchall()

    # single municipality per bundle
    munis = q("SELECT DISTINCT municipality FROM parcels")
    if len(munis) != 1:
        errors.append(f"expected 1 municipality, found: {munis}")

    # duplicate (pin, year)
    dupes = q("""SELECT pin, year, count(*) c FROM parcels
                 GROUP BY 1,2 HAVING c > 1""")
    if dupes:
        errors.append(f"{len(dupes)} duplicate (pin, year) rows, e.g. {dupes[:3]}")

    # parcel count per year within band; flag jumps between consecutive years
    counts = q("SELECT year, count(*) FROM parcels GROUP BY 1 ORDER BY 1")
    report.append("parcel counts: " + ", ".join(f"{y}:{c}" for y, c in counts))
    for (y0, c0), (y1, c1) in zip(counts, counts[1:]):
        if c0 and abs(c1 - c0) / c0 > 0.10:
            report.append(f"WARN parcel count jump {y0}->{y1}: {c0}->{c1}")

    # class distribution sanity: residential should dominate
    for year, frac in q("""SELECT year,
            sum(CASE WHEN prop_class = '2' THEN 1 ELSE 0 END) * 1.0 / count(*)
            FROM parcels GROUP BY 1"""):
        if frac < 0.80:
            report.append(f"WARN {year}: residential share only {frac:.0%}")

    # total_assessed vs net_taxable consistency on taxable parcels
    bad = q("""SELECT count(*) FROM parcels
               WHERE prop_class NOT LIKE '15%'
                 AND abs(net_taxable - (total_assessed - coalesce(deduction_amount,0)))
                     > total_assessed * 0.5""")[0][0]
    if bad:
        report.append(f"WARN {bad} taxable parcels where net_taxable is far from assessed")

    # appearing/disappearing pins between consecutive years
    years = [y for y, _ in counts]
    for y0, y1 in zip(years, years[1:]):
        gone, born = q(f"""SELECT
            (SELECT count(*) FROM parcels a WHERE a.year={y0} AND NOT EXISTS
                (SELECT 1 FROM parcels b WHERE b.year={y1} AND b.pin=a.pin)),
            (SELECT count(*) FROM parcels b WHERE b.year={y1} AND NOT EXISTS
                (SELECT 1 FROM parcels a WHERE a.year={y0} AND a.pin=b.pin))""")[0]
        report.append(f"pin churn {y0}->{y1}: {gone} disappeared, {born} appeared")

    # --- sale field sanity (feeds the ratio study) ---

    # A date parse that fails yields NULL everywhere, which the implausible-
    # year check below cannot see because it only inspects non-null values.
    # Check the null rate first, or a broken parse looks like clean data.
    # A handful of unparseable dates is normal; warn only above 0.5%.
    unparsed, total_usable = q("""
        SELECT count(*) FILTER (WHERE sale_year IS NULL), count(*)
        FROM parcels WHERE sale_price > 1000
          AND coalesce(nu_code, '') IN ('', '00')""")[0]
    if total_usable and unparsed / total_usable > 0.005:
        report.append(f"WARN {unparsed:,} of {total_usable:,} usable-sale rows "
                      f"({100 * unparsed / total_usable:.1f}%) have no sale_year — "
                      f"run diagnose_sale_dates.py; the date parse is wrong")
    elif unparsed:
        report.append(f"{unparsed:,} usable-sale rows have an unparseable date "
                      f"({100 * unparsed / total_usable:.2f}%) — within tolerance")

    # implausible sale years: wrong century pivot, or the wrong substring
    bad_years = q("""SELECT count(*), min(sale_year), max(sale_year) FROM parcels
                     WHERE sale_year IS NOT NULL
                       AND (sale_year < 1900 OR sale_year > year)""")[0]
    if bad_years[0]:
        report.append(f"WARN {bad_years[0]} rows with implausible sale_year "
                      f"(range {bad_years[1]}-{bad_years[2]}) — check the date parse")

    # sale price equal to the assessment usually means the extract populated
    # price from the assessment rather than from the deed
    same = q("""SELECT count(*) FROM parcels
                WHERE sale_price > 1000 AND sale_price = sale_assessment""")[0][0]
    if same > 50:
        report.append(f"WARN {same} rows where sale_price == sale_assessment")

    # usable-sale volume, so a filter that silently empties the sample is loud
    usable = q("""SELECT count(*), count(DISTINCT pin) FROM parcels
                  WHERE sale_price > 1000
                    AND coalesce(nu_code, '') IN ('', '00')""")[0]
    report.append(f"usable sale rows: {usable[0]:,} across {usable[1]:,} parcels "
                  f"(pre-dedup; MOD-IV repeats each sale in later snapshots)")

    return errors, report


def town_series(con, rates):
    rows = con.execute("""
        SELECT year,
            sum(CASE WHEN prop_class NOT LIKE '15%' THEN net_taxable ELSE 0 END) AS net_ratables,
            sum(CASE WHEN prop_class LIKE '15%' THEN net_taxable ELSE 0 END)     AS exempt_value,
            sum(CASE WHEN prop_class NOT LIKE '15%' THEN 1 ELSE 0 END)           AS taxable_parcels,
            sum(CASE WHEN prop_class NOT LIKE '15%' THEN prior_year_tax END)     AS prior_year_tax_sum
        FROM parcels GROUP BY 1 ORDER BY 1""").fetchall()
    out = []
    for year, ratables, exempt, n, prior_tax in rows:
        r = rates.get(year, {})
        rate = r.get("general_tax_rate")
        dca_val = r.get("dca_net_valuation")
        if dca_val is not None and ratables and abs(dca_val - ratables) / ratables > 0.01:
            print(f"  WARN {year}: MOD-IV ratables {ratables:,.0f} vs DCA {dca_val:,.0f} differ >1%")
        out.append({
            "year": year,
            "net_ratables": ratables,
            "exempt_value": exempt,
            "taxable_parcels": n,
            "general_tax_rate": rate,
            "rate_is_implied": r.get("rate_is_implied", False),
            # certified levy from DCA when available; rate-based estimate as fallback
            "levy": r.get("total_levy") or (round(ratables * rate / 100) if rate else None),
            "levy_breakdown": {k: r.get(f"{k}_levy") for k in ("county", "school", "municipal")}
                              if r.get("total_levy") else None,
            "equalized_value": r.get("equalized_value"),
            "prior_year_tax_sum": prior_tax,  # cross-check only
            "equalization_ratio": r.get("equalization_ratio"),
            "reval_flag": r.get("reval_flag", False),
        })
    # exempt breakdown by subclass (15A..15F) per year
    sub = con.execute("""
        SELECT year, prop_class, sum(net_taxable) FROM parcels
        WHERE prop_class LIKE '15%' GROUP BY 1,2 ORDER BY 1,2""").fetchall()
    exempt_breakdown = {}
    for year, cls, val in sub:
        exempt_breakdown.setdefault(year, {})[cls] = val
    return out, exempt_breakdown


def load_rates(path):
    if not path or not os.path.exists(path):
        return {}
    import csv
    rates = {}
    with open(path) as f:
        for row in csv.DictReader(f):
            g = lambda k: float(row[k]) if row.get(k) not in (None, "",) else None
            rates[int(row["year"])] = {
                "general_tax_rate": g("general_tax_rate"),
                "equalization_ratio": g("equalization_ratio"),
                "total_levy": g("total_levy"),
                "county_levy": g("county_levy"),
                "school_levy": g("school_levy"),
                "municipal_levy": g("municipal_levy"),
                "dca_net_valuation": g("net_valuation_taxable"),
                "equalized_value": g("equalized_value"),
                "rate_is_implied": row.get("rate_is_implied", "").strip().lower() in ("1", "true", "y", "yes"),
                "reval_flag": row.get("reval_flag", "").strip().lower() in ("1", "true", "y", "yes"),
            }
    return rates


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", required=True)
    ap.add_argument("--rates", default=None)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    con = duckdb.connect()
    paths = load_raw(con, args.raw_dir)
    print(f"loaded {len(paths)} raw files")

    errors, report = validate(con)
    for line in report:
        print(" ", line)
    if errors:
        for e in errors:
            print("ERROR:", e, file=sys.stderr)
        sys.exit(1)

    rates = load_rates(args.rates)
    town, exempt_breakdown = town_series(con, rates)

    # Ratio study is optional: if the extract lacks sale fields, or no sales
    # survive filtering, publish the bundle without it rather than failing.
    # A null value lets the frontend hide the section cleanly.
    try:
        ratio_study = build_ratio_study(con, rates)
        n_sales = len(ratio_study["sales"])
        studied = sum(1 for r in ratio_study["by_year"] if not r.get("suppressed"))
        print(f"  ratio study: {n_sales:,} usable sales, "
              f"{studied} strict year(s), {len(ratio_study['by_window'])} windowed year(s)")
    except RatioStudyUnavailable as e:
        print(f"  WARN ratio study skipped: {e}")
        ratio_study = None

    parcels = con.execute("""
        SELECT pin, block, lot, qual, address, prop_class, year,
               land_value, improvement_value, total_assessed, net_taxable,
               acreage, year_built
        FROM parcels ORDER BY pin, year""").fetchall()
    cols = ["pin", "block", "lot", "qual", "address", "prop_class", "year",
            "land_value", "improvement_value", "total_assessed", "net_taxable",
            "acreage", "year_built"]

    municipality = con.execute("SELECT DISTINCT municipality FROM parcels").fetchone()[0]
    bundle = {
        "municipality": municipality,
        "generated_from": [os.path.basename(p) for p in paths],
        "columns": cols,
        "parcels": [list(r) for r in parcels],  # columnar-ish compact rows
        "town_series": town,
        "exempt_breakdown": exempt_breakdown,
        "ratio_study": ratio_study,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with gzip.open(args.out, "wt") as f:
        json.dump(bundle, f, separators=(",", ":"), default=str)
    print(f"wrote {args.out} ({os.path.getsize(args.out):,} bytes gzipped, "
          f"{len(parcels):,} parcel-year rows)")


if __name__ == "__main__":
    main()
