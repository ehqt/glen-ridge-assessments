#!/usr/bin/env python3
"""Report which sale-related columns exist in each raw MOD-IV file.

The Rutgers HDB record layout changed over the decades, so the sale fields
are not guaranteed to be named the same way (or to exist at all) in every
vintage. Run this before enabling the ratio study:

    python probe_sale_fields.py --raw-dir ../data/raw

Copy the reported names into SALE_COLUMNS in ratio_study.py.
"""
import argparse
import glob
import os
import re

import duckdb

PATTERNS = [
    ("sale price", r"sale.*price|price.*sale|sr1a.*price|consideration"),
    ("sale date", r"sale.*date|deed.*date|date.*sale|transfer.*date"),
    ("sale assessment", r"sale.*assess|assess.*sale"),
    ("non-usable code", r"\bnu\b|nu.?code|non.?usable|usable"),
    ("deed book/page", r"deed.*(book|page)|book.*page"),
    ("building desc", r"building.*desc|bldg.*desc|bldg.*class"),
    ("living area", r"sq.?ft|square.*feet|living.*area|floor.*area"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", required=True)
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(args.raw_dir, "mod_iv_*.csv")))
    if not paths:
        raise SystemExit(f"no mod_iv_*.csv files in {args.raw_dir}")

    con = duckdb.connect()
    for path in paths:
        cols = [
            r[0]
            for r in con.execute(
                f"DESCRIBE SELECT * FROM read_csv_auto('{path}', all_varchar=true)"
            ).fetchall()
        ]
        print(f"\n{os.path.basename(path)}  ({len(cols)} columns)")
        for label, pattern in PATTERNS:
            hits = [c for c in cols if re.search(pattern, c, re.I)]
            marker = "  " if hits else "!!"
            print(f"  {marker} {label:<18} {hits if hits else 'NOT FOUND'}")

        # non-null rate for anything that looks like a sale price, so you can
        # tell a present-but-empty column from a usable one
        price_cols = [c for c in cols if re.search(PATTERNS[0][1], c, re.I)]
        for c in price_cols:
            n, nonzero = con.execute(f"""
                SELECT count(*),
                       sum(CASE WHEN TRY_CAST("{c}" AS BIGINT) > 1000 THEN 1 ELSE 0 END)
                FROM read_csv_auto('{path}', all_varchar=true)""").fetchone()
            print(f"     {c}: {nonzero or 0:,} of {n:,} rows have a value > $1,000")


if __name__ == "__main__":
    main()
