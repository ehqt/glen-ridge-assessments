#!/usr/bin/env python3
"""Figure out what deed_date_MMDDYY actually contains and which parse works.

    python diagnose_sale_dates.py --raw ../data/raw/mod_iv_data.csv
"""
import argparse

import duckdb

# Candidate parses, tried in order. The first that yields a high hit rate
# with a sane year range is the one to put in CANONICAL_SELECT.
CANDIDATES = {
    "MMDDYY (6-digit, pivot 30)": """
        CASE WHEN regexp_matches(d, '^[0-9]{6}$')
             THEN CASE WHEN CAST(right(d, 2) AS INTEGER) >= 30 THEN 1900 ELSE 2000 END
                  + CAST(right(d, 2) AS INTEGER) END""",
    "MMDDYYYY (8-digit)": """
        CASE WHEN regexp_matches(d, '^[0-9]{8}$')
             THEN CAST(right(d, 4) AS INTEGER) END""",
    "YYYYMMDD (8-digit)": """
        CASE WHEN regexp_matches(d, '^[0-9]{8}$')
             THEN CAST(left(d, 4) AS INTEGER) END""",
    "slashed, 2-digit year": """
        CASE WHEN regexp_matches(d, '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$')
             THEN CASE WHEN CAST(right(d, 2) AS INTEGER) >= 30 THEN 1900 ELSE 2000 END
                  + CAST(right(d, 2) AS INTEGER) END""",
    "slashed, 4-digit year": """
        CASE WHEN regexp_matches(d, '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$')
             THEN CAST(right(d, 4) AS INTEGER) END""",
    "ISO date / timestamp": """
        EXTRACT(year FROM TRY_CAST(d AS DATE))""",
    "any trailing 4 digits 1900-2035": """
        CASE WHEN regexp_matches(d, '(19|20)[0-9]{2}$')
             THEN CAST(regexp_extract(d, '((19|20)[0-9]{2})$', 1) AS INTEGER) END""",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="../data/raw/mod_iv_data.csv")
    ap.add_argument("--col", default="deed_date_MMDDYY")
    args = ap.parse_args()

    con = duckdb.connect()
    base = f"""
        SELECT trim(CAST("{args.col}" AS VARCHAR)) AS d
        FROM read_csv_auto('{args.raw}', all_varchar=true)
        WHERE TRY_CAST(sale_price AS BIGINT) > 1000
          AND nullif(trim(sale_sr1a_non_usable_code), '') IS NULL
    """
    con.execute(f"CREATE TABLE dd AS {base}")
    total = con.execute("SELECT count(*) FROM dd").fetchone()[0]
    print(f"\nusable-sale rows: {total:,}")

    nulls = con.execute(
        "SELECT count(*) FROM dd WHERE d IS NULL OR d = ''").fetchone()[0]
    print(f"empty/NULL date values: {nulls:,}\n")

    print("length distribution and sample values")
    print("-" * 58)
    for length, n, ex in con.execute("""
            SELECT length(d) AS len, count(*) AS n, min(d) AS example
            FROM dd WHERE d IS NOT NULL AND d <> ''
            GROUP BY 1 ORDER BY n DESC LIMIT 10""").fetchall():
        print(f"  len {length:>3}  {n:>8,}  e.g. {ex!r}")

    print("\nfirst 10 raw values")
    print("-" * 58)
    for (v,) in con.execute(
            "SELECT d FROM dd WHERE d IS NOT NULL AND d <> '' LIMIT 10").fetchall():
        print(f"  {v!r}")

    print("\nparse candidates")
    print("-" * 58)
    print(f"  {'candidate':<32} {'parsed':>8} {'range':>14}")
    for label, expr in CANDIDATES.items():
        try:
            n, lo, hi = con.execute(f"""
                SELECT count(y), min(y), max(y) FROM (
                    SELECT {expr} AS y FROM dd WHERE d IS NOT NULL AND d <> ''
                )""").fetchone()
        except Exception as e:
            print(f"  {label:<32} {'error':>8}  {type(e).__name__}")
            continue
        pct = 100 * n / total if total else 0
        rng = f"{lo}-{hi}" if n else "—"
        flag = "  <== use this" if pct > 90 and lo and 1960 <= lo and hi <= 2035 else ""
        print(f"  {label:<32} {n:>8,} ({pct:>5.1f}%) {rng:>12}{flag}")
    print()


if __name__ == "__main__":
    main()
