#!/usr/bin/env python3
"""Print the ratio study from a published bundle.

    python show_ratio_study.py                     # defaults to ../data/published
    python show_ratio_study.py --quintiles 2024
"""
import argparse
import gzip
import json


def fmt(v, spec, dash="—"):
    return dash.rjust(len(f"{0:{spec}}")) if v is None else f"{v:{spec}}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", default="../data/published/glen-ridge.json.gz")
    ap.add_argument("--quintiles", type=int, help="show quintile detail for this year")
    args = ap.parse_args()

    with gzip.open(args.bundle) as f:
        rs = json.load(f).get("ratio_study")
    if not rs:
        raise SystemExit("bundle has no ratio_study block")

    m = rs["method"]
    print(f"\n{len(rs['sales']):,} usable sales   "
          f"trim={m['trim']}  min_n={m['min_n']}  windows={m.get('rolling_windows')}")
    print(f"pairing: {m['assessment_pairing']}")

    print(f"\n{'year':>6} {'w':>2} {'n':>5} {'median':>7} {'eq':>6} "
          f"{'COD':>6} {'COD 95% CI':>16} {'PRD':>7} {'PRB':>7}")
    print("-" * 78)
    for r in rs.get("by_window", []):
        ci = r.get("cod_ci")
        ci_s = f"[{ci[0]:.1f}, {ci[1]:.1f}]" if ci else "—"
        eq = r.get("state_equalization_ratio")
        star = " *reval" if r.get("reval_year") else ""
        print(f"{r['year']:>6} {r.get('window', 1):>2} {r['n']:>5} "
              f"{fmt(r.get('median_ratio'), '7.3f')} {fmt(eq, '6.3f')} "
              f"{fmt(r.get('cod'), '6.1f')} {ci_s:>16} "
              f"{fmt(r.get('prd'), '7.3f')} {fmt(r.get('prb'), '7.3f')}{star}")

    b = rs["benchmarks"]
    print(f"\nIAAO: COD <= {b['cod']['acceptable']}  "
          f"PRD {b['prd']['low']}-{b['prd']['high']}  "
          f"PRB {b['prb']['low']} to {b['prb']['high']}")
    print("'eq' is the state equalization ratio; median should track it closely.")

    if args.quintiles:
        rows = [q for q in rs["by_quintile"] if q["year"] == args.quintiles]
        if not rows:
            raise SystemExit(f"no quintile rows for {args.quintiles}")
        print(f"\nvalue quintiles, {args.quintiles} "
              f"(window {rows[0].get('window', 1)})")
        print(f"{'q':>2} {'n':>5} {'price range':>26} {'median ratio':>13}")
        print("-" * 50)
        for q in rows:
            rng = f"${q['price_floor']:,} - ${q['price_ceiling']:,}"
            print(f"{q['quintile']:>2} {q['n']:>5} {rng:>26} {q['median_ratio']:>13.3f}")
        lo = rows[0]["median_ratio"]
        hi = rows[-1]["median_ratio"]
        if lo and hi:
            print(f"\ntop-to-bottom gap: {100 * (hi - lo) / lo:+.1f}% "
                  f"(negative = regressive)")
    print()


if __name__ == "__main__":
    main()
