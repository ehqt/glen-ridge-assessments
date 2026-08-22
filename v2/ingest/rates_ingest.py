#!/usr/bin/env python3
"""Extract one municipality's tax rate and levy history from DCA Property Tax Tables.

Usage:
    python rates_ingest.py --raw-dir ../data/raw/rates \
        --municipality "Glen Ridge" --out ../data/rates.csv

The DCA publishes these workbooks in several shapes; this script normalizes
them all into one row per tax year:

  * sheet names vary        -- 'A', '2010 Taxes', 'Municipal Tax Summary',
                               'Tax Summary - Municipal Detail'
  * headers sit on any row  -- title and banner rows often come first
  * column names vary       -- '1998 Total Rate', 'CY Total Rate', 'Total Rate'
  * years arrive two ways   -- one file per year (98taxes.xls), or one combined
                               file with a 'Year' column covering many years

Reading .xlsx/.xlsm requires openpyxl; reading legacy .xls requires xlrd.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

import pandas as pd

# --------------------------------------------------------------------------
# What the workbooks look like
# --------------------------------------------------------------------------

# DCA publishes these as '98taxes.xls', '15taxes.xls', etc. Restricting the
# glob keeps unrelated spreadsheets in the same folder from being parsed.
WORKBOOK_GLOB = "*taxes.xls"

# Sheet names drift ('A', '2010 Taxes', 'Municipal Tax Summary',
# 'Tax Summary - Municipal Detail'), so sheets are scored on their words
# rather than matched against a fixed list. Higher scores are tried first.
SHEET_WORD_SCORES = {
    "municipal": 4, "municipalities": 4,
    "summary": 2, "detail": 2, "taxes": 2, "tax": 1,
    # Front matter and per-county rollups: valid sheets, but never preferred.
    "cover": -6, "glossary": -6, "notes": -6, "viewer": -6,
    "county": -4, "citizens": -4,
}

# A header row is recognizable by containing one of these markers.
HEADER_MARKERS = ("municode", "muni-", "municipality", "municipalities")

# How many rows down to search for the header before giving up.
MAX_HEADER_ROW = 6

MUNICIPALITY_HEADERS = ("municipalities", "municipality")
YEAR_HEADERS = ("year", "tax year", "calendar year")

# Output field -> candidate column headers, best first.
COLUMN_ALIASES = {
    "general_tax_rate": ("cy total rate", "total rate"),
    "equalization_ratio_pct": ("state equalization table average ratio",
                               "state equalization table ratio"),
    "total_levy": ("total levy on which tax rate is computed", "total tax levy"),
    "county_levy": ("total county levy",),
    "school_levy": ("total school levy",),
    "municipal_levy": ("total local municipal tax levy", "total local municipal levy"),
    "net_valuation_taxable": ("net valuation taxable", "net  valuation taxable"),
    "equalized_value": ("cy equalized property value (pre-appeal)",
                        "cy equalized value", "equalized value"),
}

# Columns of the emitted CSV, in order. reval_flag and rate_is_implied are
# filled in by hand or by later steps, so they are written empty here.
OUTPUT_FIELDS = (
    "year", "general_tax_rate", "equalization_ratio", "reval_flag",
    "total_levy", "county_levy", "school_levy", "municipal_levy",
    "net_valuation_taxable", "equalized_value", "rate_is_implied", "source_file",
)


class WorkbookError(Exception):
    """A workbook could not be parsed; the file is skipped with a warning."""


def warn(message: str) -> None:
    print(f"WARN {message}", file=sys.stderr)


# --------------------------------------------------------------------------
# Header and column identification
# --------------------------------------------------------------------------

def normalize_header(header: object) -> str:
    """Reduce a raw header cell to a stable lookup key.

    'CY Total\nRate (Col. 6)' -> 'cy total rate'
    '1998 Total Rate'         -> 'cy total rate'   (any 4-digit year -> 'cy')
    """
    text = str(header).replace("\n", " ").strip().lower()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\(col\.? ?\d+\)", "", text).strip()
    return re.sub(r"^(19|20)\d{2} ", "cy ", text)


def find_column(columns, names, fuzzy: bool = False) -> str | None:
    """First column matching `names` exactly.

    With fuzzy=True, also accepts a column that merely contains one of the
    names as a word (so 'municipality name' still resolves). Fuzzy matching is
    opt-in because headers like 'avg. property tax deduction - tax year 2023'
    would otherwise be mistaken for a 'year' column.
    """
    columns = list(columns)
    for name in names:
        if name in columns:
            return name
    if fuzzy:
        wanted = set(names)
        for column in columns:
            if wanted & set(str(column).split()):
                return column
    return None


def looks_like_header(cells) -> bool:
    joined = " ".join(str(c).lower() for c in cells)
    return any(marker in joined for marker in HEADER_MARKERS)


# --------------------------------------------------------------------------
# Loading a sheet
# --------------------------------------------------------------------------

def score_sheet(name: str) -> int:
    words = re.findall(r"[a-z]+", name.lower())
    return sum(SHEET_WORD_SCORES.get(word, 0) for word in words)


def rank_sheets(workbook: pd.ExcelFile) -> list[str]:
    """All sheets, most likely to hold the municipal table first."""
    return sorted(workbook.sheet_names, key=lambda name: -score_sheet(name))


def load_sheet(path: Path) -> tuple[pd.DataFrame, str]:
    """Load the relevant sheet with its real header row located.

    Title and banner rows above the headers are common, so each candidate row
    is tried in turn until one yields a municipality column.

    Returns (dataframe with normalized column names, municipality column name).
    Raises WorkbookError if no candidate row works.
    """
    with pd.ExcelFile(path, engine=None) as workbook:
        sheets = rank_sheets(workbook)
        for sheet in sheets:
            probe = pd.read_excel(workbook, sheet_name=sheet, header=None,
                                  nrows=MAX_HEADER_ROW)

            # Try the row that looks like a header first, then the rest, so an
            # unrecognized banner row costs one extra read at most.
            rows = [i for i in range(len(probe)) if looks_like_header(probe.iloc[i])]
            rows += [i for i in range(min(MAX_HEADER_ROW, len(probe))) if i not in rows]

            for header_row in rows:
                frame = pd.read_excel(workbook, sheet_name=sheet, header=header_row)
                frame.columns = [normalize_header(c) for c in frame.columns]
                municipality_column = find_column(
                    frame.columns, MUNICIPALITY_HEADERS, fuzzy=True
                )
                if municipality_column:
                    if sheet != sheets[0] or header_row != rows[0]:
                        print(f"note {path.name}: using sheet {sheet!r}, "
                              f"headers on row {header_row + 1}")
                    return frame, municipality_column

    raise WorkbookError(
        f"{path.name}: no municipality column in the first {MAX_HEADER_ROW} rows "
        f"of any sheet ({', '.join(sheets)})"
    )


# --------------------------------------------------------------------------
# Turning matched rows into records
# --------------------------------------------------------------------------

def year_from_filename(path: Path) -> int | None:
    """'98taxes.xls' -> 1998. None for combined files, which carry a Year column."""
    match = re.match(r"(\d{2})taxes", path.name.lower())
    if not match:
        return None
    two_digit = int(match.group(1))
    return 2000 + two_digit if two_digit < 50 else 1900 + two_digit


def parse_year(value: object) -> int | None:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None  # subtotal, blank, or footnote row


def to_number(value: object) -> float | None:
    if value is None or pd.isna(value):
        return None
    try:
        return float(str(value).replace(",", "").replace("$", "").strip())
    except ValueError:
        return None


def build_record(row: pd.Series, columns, year: int, source: str) -> dict:
    """Map one spreadsheet row onto the output schema."""
    record = {"year": year, "source_file": source}
    for field, aliases in COLUMN_ALIASES.items():
        column = find_column(columns, aliases)
        record[field] = to_number(row[column]) if column else None

    ratio_pct = record.pop("equalization_ratio_pct")
    record["equalization_ratio"] = round(ratio_pct / 100, 6) if ratio_pct else None
    if record["general_tax_rate"] is not None:
        record["general_tax_rate"] = round(record["general_tax_rate"], 4)
    return record


def extract(path: Path, municipality: str) -> list[dict]:
    """Return one record per tax year for `municipality` in this workbook."""
    frame, municipality_column = load_sheet(path)

    matches = frame[
        frame[municipality_column].astype(str)
        .str.contains(municipality, case=False, na=False)
    ]
    if matches.empty:
        raise WorkbookError(f"{path.name}: no rows match {municipality!r}")

    year_column = find_column(frame.columns, YEAR_HEADERS)
    if year_column is None:
        # One year per file: the filename dates every row, so expect just one.
        file_year = year_from_filename(path)
        if file_year is None:
            raise WorkbookError(
                f"{path.name}: no Year column and no year in the filename"
            )
        if len(matches) > 1:
            warn(f"{path.name}: {len(matches)} rows match {municipality!r} for a "
                 f"single year; using the first")
        matches = matches.head(1)
        years = [file_year]
    else:
        years = [parse_year(value) for value in matches[year_column]]

    return [
        build_record(row, frame.columns, year, path.name)
        for (_, row), year in zip(matches.iterrows(), years)
        if year is not None
    ]


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def find_workbooks(raw_dir: Path) -> list[Path]:
    return sorted(
        path for path in raw_dir.glob(WORKBOOK_GLOB)
        if not path.name.startswith("~$")  # Excel lock files
    )


def format_value(value: object) -> object:
    """Write whole numbers without a trailing '.0'; leave everything else alone."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def write_csv(records: list[dict], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        for record in records:
            record.setdefault("reval_flag", "")
            record.setdefault("rate_is_implied", "false")
            writer.writerow(
                {field: format_value(record.get(field, "")) for field in OUTPUT_FIELDS}
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--municipality", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    workbooks = find_workbooks(args.raw_dir)
    if not workbooks:
        sys.exit(f"no files matching {WORKBOOK_GLOB} in {args.raw_dir}")

    records = []
    for path in workbooks:
        try:
            records.extend(extract(path, args.municipality))
        except WorkbookError as error:
            warn(str(error))
        except Exception as error:  # unreadable file: report, keep going
            warn(f"{path.name}: {type(error).__name__}: {error}")

    # One record per year; later files win when sources overlap.
    by_year = {record["year"]: record for record in records}
    records = sorted(by_year.values(), key=lambda record: record["year"])

    write_csv(records, args.out)
    years = ", ".join(str(record["year"]) for record in records)
    print(f"wrote {args.out}: {len(records)} years ({years})")


if __name__ == "__main__":
    main()
