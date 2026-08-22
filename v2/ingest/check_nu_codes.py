#!/usr/bin/env python3
"""Show how the SR-1A non-usable code field is encoded.

    python check_nu_codes.py --raw ../data/raw/mod_iv_data.csv

The bucket that carries most sales AND shows a median ratio near the state
equalization ratio is the usable one. Non-usable codes give themselves away
with implausible ratios -- a $1 family transfer against a real assessment
lands far above 1.0.
"""
import argparse

import duckdb

SQL = """
SELECT coalesce(nullif(trim(sale_sr1a_non_usable_code), ''), '(blank)') AS nu_code,
       count(*)                                          AS sales,
       median(TRY_CAST(sale_price AS BIGINT))            AS median_price,
       round(median(TRY_CAST(sale_assessment AS BIGINT) * 1.0
                    / nullif(TRY_CAST(sale_price AS BIGINT), 0)), 3) AS median_ratio
FROM read_csv_auto(?, all_varchar=true)
WHERE TRY_CAST(sale_price AS BIGINT) > 1000
GROUP BY 1
ORDER BY sales DESC
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="../data/raw/mod_iv_data.csv")
    args = ap.parse_args()

    rows = duckdb.connect().execute(SQL, [args.raw]).fetchall()
    print(f"\n{'code':>10} {'sales':>8} {'median price':>14} {'median ratio':>13}")
    print("-" * 49)
    for code, n, price, ratio in rows:
        note = ""
        if ratio is not None and (ratio > 1.2 or ratio < 0.15):
            note = "  <- implausible, likely non-usable"
        price_s = f"${price:,.0f}" if price is not None else "—"
        ratio_s = f"{ratio:.3f}" if ratio is not None else "—"
        print(f"{code:>10} {n:>8,} {price_s:>14} {ratio_s:>13}{note}")
    print()


if __name__ == "__main__":
    main()
