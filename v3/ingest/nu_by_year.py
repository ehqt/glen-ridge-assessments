#!/usr/bin/env python3
"""SR-1A code usage by era, to detect a change in how "usable" is marked.

    python nu_by_year.py --raw ../data/raw/mod_iv_data.csv

If blank dominates early years and some other code dominates late years
with a comparable ratio profile, the convention changed and both markers
belong in USABLE_NU_CODES.
"""
import argparse

import duckdb

SQL = """
WITH base AS (
    SELECT
        coalesce(nullif(trim(sale_sr1a_non_usable_code), ''), '(blank)') AS nu_code,
        EXTRACT(year FROM TRY_CAST(trim(deed_date_MMDDYY) AS DATE))      AS sale_year,
        TRY_CAST(sale_price AS BIGINT)                                   AS price,
        TRY_CAST(sale_assessment AS BIGINT)                              AS assmt,
        gis_pin                                                          AS pin
    FROM read_csv_auto(?, all_varchar=true)
)
SELECT nu_code,
       count(DISTINCT pin || '|' || sale_year || '|' || price) AS events,
       min(sale_year) AS first_yr,
       max(sale_year) AS last_yr,
       round(median(sale_year))                                AS median_yr,
       round(median(assmt * 1.0 / nullif(price, 0)), 3)        AS median_ratio,
       count(DISTINCT pin || '|' || sale_year || '|' || price)
         FILTER (WHERE sale_year >= 2021)                      AS events_2021plus
FROM base
WHERE price >= 25000 AND sale_year IS NOT NULL
GROUP BY 1
ORDER BY events DESC
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="../data/raw/mod_iv_data.csv")
    args = ap.parse_args()

    rows = duckdb.connect().execute(SQL, [args.raw]).fetchall()
    print(f"\n{'code':>8} {'events':>8} {'years':>12} {'median yr':>10} "
          f"{'ratio':>7} {'2021+':>7}")
    print("-" * 60)
    for code, n, lo, hi, med, ratio, recent in rows:
        note = ""
        if recent and n and recent / n > 0.5:
            note = "  <- concentrated in recent years"
        print(f"{code:>8} {n:>8,} {f'{lo:.0f}-{hi:.0f}':>12} {med:>10.0f} "
              f"{ratio if ratio is not None else float('nan'):>7.3f} "
              f"{recent:>7,}{note}")
    print("\nA code that appears only in recent years AND has a median ratio")
    print("near the current equalization ratio is a usable marker, not an")
    print("exclusion category.\n")


if __name__ == "__main__":
    main()
