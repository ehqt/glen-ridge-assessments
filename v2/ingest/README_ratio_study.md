# Ratio study — integration notes

## Status

`probe_sale_fields.py` confirmed the Rutgers HDB extract carries
`sale_price`, `deed_date_MMDDYY`, `sale_assessment`, and
`sale_sr1a_non_usable_code`. The presence of **sale_assessment** is the
important one: it is the assessment in force at the time of the transfer, so
ratios no longer depend on having ingested the sale year. The sparse-panel
problem is gone.

One remaining blocker: `CANONICAL_SELECT` in `ingest.py` does not select any
of these columns. Patch below.

Notes from the probe:

- `sales_price_code` is a code field, not a price, and is empty across all
  88,293 rows. Ignore it.
- `sale_price` is populated on 37,298 rows (42%), which is expected: MOD-IV
  repeats a parcel's most recent sale in every subsequent annual snapshot
  until it trades again. `build_sales` dedupes on
  `(pin, sale_year, sale_price)`, so the distinct sale-event count will be
  far lower than 37,298.
- No living-area or square-footage field, so no price-per-square-foot work
  and no size-adjusted comps. `building_description` is present and gives
  style and story codes, which is a usable second stratification axis.

The SR-1A encoding is confirmed, and the convention CHANGED partway through
the panel. Usable sales carry a **blank** code through roughly 2020 and an
explicit **`00`** from 2021 onward. `USABLE_NU_CODES` is `{"", "00"}`.

The cross-tab that establishes this (`nu_by_year.py`):

| code    | events | years     | median yr | ratio | 2021+ |
|---------|--------|-----------|-----------|-------|-------|
| (blank) | 3,183  | 1981-2024 | 2003      | 0.379 | 110   |
| 00      | 261    | 2021-2024 | 2022      | 0.659 | 261   |

`00` exists only in the last four years and its ratio sits on the modern
equalization ratio, not on the repeat-weighted historical one. Missing this
cost roughly 90% of sales in 2022-2024 on the first real run.

**The methodological trap worth remembering:** do not compare one code's
median ratio against another code's to decide usability. Ratios move with
the assessment era, so codes from different decades will always differ
regardless of what they mean. Compare each code's ratio against the
equalization ratio for *its own* years, and check the year span. That is
what `nu_by_year.py` exists for; `check_nu_codes.py` alone will mislead you.

Roughly 6,500 sales (17.5%) are excluded as non-usable, which is a normal
proportion for a NJ ratio study.

## Patch to `ingest.py`

Add these four lines before the `FROM read_csv_auto(...)` line:

```sql
    TRY_CAST(sale_price AS BIGINT)                  AS sale_price,
    TRY_CAST(sale_assessment AS BIGINT)             AS sale_assessment,
    nullif(trim(sale_sr1a_non_usable_code), '')     AS nu_code,
    CASE WHEN TRY_CAST(trim(deed_date_MMDDYY) AS BIGINT) IS NOT NULL
          AND length(lpad(trim(deed_date_MMDDYY), 6, '0')) = 6
         THEN CASE WHEN TRY_CAST(right(lpad(trim(deed_date_MMDDYY), 6, '0'), 2)
                                 AS INTEGER) >= 30
                   THEN 1900 ELSE 2000 END
              + TRY_CAST(right(lpad(trim(deed_date_MMDDYY), 6, '0'), 2) AS INTEGER)
    END                                             AS sale_year,
```

Then in `main()`, after `town, exempt_breakdown = town_series(...)`:

```python
from ratio_study import build_ratio_study, RatioStudyUnavailable
...
try:
    ratio_study = build_ratio_study(con, rates)
    print(f"  ratio study: {len(ratio_study['sales']):,} usable sales")
except RatioStudyUnavailable as e:
    print(f"  WARN ratio study skipped: {e}")
    ratio_study = None
```

and add `"ratio_study": ratio_study` to the `bundle` dict. A `None` value
lets the frontend hide the whole section cleanly rather than rendering an
empty chart.

Keep `sale_price` and `sale_year` **out** of the per-parcel `cols` list
written to the bundle unless you want them on the Parcel view. They roughly
double the row width, and the ratio study block already carries the sales it
used.

## Validation to add

Two checks worth putting in `validate()`:

- Sale years outside the plausible range (before 1900, after the tax year) —
  a reliable sign the date parse picked the wrong substring.
- Sale price equal to assessed value on more than a handful of parcels, which
  usually means the extract populated the sale price from the assessment
  rather than the deed.

## A note on what the statistics will and won't show

The synthetic test in this module injects a deliberate 9% decline in median
ratio from the cheapest quintile to the most expensive. PRD reports 1.014 —
comfortably inside the IAAO acceptable band of 0.98–1.03. PRB catches it at
−0.036, and the quintile medians show it plainly (0.712 → 0.648).

So PRD alone will under-report regressivity at the magnitudes likely to
exist in a town like Glen Ridge. Lead the presentation with the quintile
chart, treat PRB as the headline vertical-equity statistic, and carry PRD
mainly because it is the number people expect to see.
