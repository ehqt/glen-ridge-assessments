#!/usr/bin/env python3
"""Where do sales disappear? Filter funnel by sale year.

    python sale_funnel.py --raw ../data/raw/mod_iv_data.csv --since 2015

Each column is the surviving count after one more filter. The column where
recent years collapse tells you which filter is responsible.
"""
import argparse

import duckdb

SQL = """
WITH base AS (
    SELECT
        gis_pin                                          AS pin,
        TRY_CAST(sale_price AS BIGINT)                   AS price,
        TRY_CAST(sale_assessment AS BIGINT)              AS sale_assessment,
        nullif(trim(sale_sr1a_non_usable_code), '')      AS nu_code,
        EXTRACT(year FROM TRY_CAST(trim(deed_date_MMDDYY) AS DATE)) AS sale_year,
        CAST(mod_iv_year AS INTEGER)                     AS snapshot_year
    FROM read_csv_auto(?, all_varchar=true)
)
SELECT
    sale_year,
    count(*)                                                  AS rows_with_date,
    count(*) FILTER (WHERE price > 1000)                      AS has_price,
    count(*) FILTER (WHERE price >= 25000)                    AS above_floor,
    count(*) FILTER (WHERE price >= 25000
                       AND nu_code IS NULL)                   AS usable,
    count(*) FILTER (WHERE price >= 25000 AND nu_code IS NULL
                       AND sale_assessment > 0)               AS has_sale_assmt,
    count(DISTINCT pin) FILTER (WHERE price >= 25000
                       AND nu_code IS NULL
                       AND sale_assessment > 0)               AS distinct_parcels,
    max(snapshot_year)                                        AS last_seen_in
FROM base
WHERE sale_year IS NOT NULL AND sale_year >= ?
GROUP BY 1 ORDER BY 1
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="../data/raw/mod_iv_data.csv")
    ap.add_argument("--since", type=int, default=2015)
    args = ap.parse_args()

    rows = duckdb.connect().execute(SQL, [args.raw, args.since]).fetchall()

    hdr = ("sale_yr", "dated", "priced", ">=25k", "usable", "+assmt",
           "parcels", "last_snap")
    print(f"\n{hdr[0]:>7} {hdr[1]:>8} {hdr[2]:>8} {hdr[3]:>8} {hdr[4]:>8} "
          f"{hdr[5]:>8} {hdr[6]:>8} {hdr[7]:>10}")
    print("-" * 72)
    for r in rows:
        print(f"{r[0]:>7.0f} {r[1]:>8,} {r[2]:>8,} {r[3]:>8,} {r[4]:>8,} "
              f"{r[5]:>8,} {r[6]:>8,} {r[7]:>10}")
    print("\nCounts are pre-dedup rows: a sale repeats in every later snapshot,")
    print("so recent years legitimately show fewer rows. 'parcels' is the")
    print("distinct-parcel count and is the number to compare across years.\n")


if __name__ == "__main__":
    main()
