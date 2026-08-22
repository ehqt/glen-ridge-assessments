// Loads the published municipality bundle (gzipped JSON) and indexes it.
// GitHub Pages serves .json.gz as raw gzip bytes (no Content-Encoding),
// so we decompress with the browser's native DecompressionStream.

export async function loadBundle(url = "data/glen-ridge.json.gz") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Data file not found (${res.status}). Expected ${url}.`);
  let text;
  const isGzip = url.endsWith(".gz");
  if (isGzip && typeof DecompressionStream !== "undefined") {
    try {
      const ds = res.body.pipeThrough(new DecompressionStream("gzip"));
      text = await new Response(ds).text();
    } catch {
      // Some hosts (vite dev server) transparently decode; retry as plain text.
      text = await (await fetch(url)).text();
    }
  } else {
    text = await res.text();
  }
  const raw = JSON.parse(text);
  return index(raw);
}

function index(raw) {
  const cols = raw.columns;
  const ix = Object.fromEntries(cols.map((c, i) => [c, i]));
  const byPin = new Map(); // pin -> { pin, block, lot, qual, address, prop_class, years: [...] }
  for (const row of raw.parcels) {
    const pin = row[ix.pin];
    let p = byPin.get(pin);
    if (!p) {
      p = {
        pin,
        block: row[ix.block],
        lot: row[ix.lot],
        qual: row[ix.qual] || "",
        address: row[ix.address],
        prop_class: row[ix.prop_class],
        years: [],
      };
      byPin.set(pin, p);
    }
    p.years.push({
      year: row[ix.year],
      land: row[ix.land_value],
      improvement: row[ix.improvement_value],
      total: row[ix.total_assessed],
      net_taxable: row[ix.net_taxable],
      acreage: row[ix.acreage],
      year_built: row[ix.year_built],
    });
    // keep the most recent address/class for display
    p.address = row[ix.address];
    p.prop_class = row[ix.prop_class];
  }
  for (const p of byPin.values()) p.years.sort((a, b) => a.year - b.year);

  const townByYear = new Map(raw.town_series.map((t) => [t.year, t]));
  const parcels = [...byPin.values()].sort((a, b) =>
    a.address.localeCompare(b.address)
  );
  return {
    municipality: raw.municipality,
    parcels,
    byPin,
    townByYear,
    townSeries: raw.town_series,
    exemptBreakdown: raw.exempt_breakdown,
    ratioStudy: raw.ratio_study || null,
  };
}

export const CLASS_NAMES = {
  1: "Vacant land",
  2: "Residential",
  "4A": "Commercial",
  "4B": "Industrial",
  "4C": "Apartments",
  "5A": "Railroad class I",
  "5B": "Railroad class II",
  "6A": "Telephone personal property",
  "15A": "Public school",
  "15B": "Other school",
  "15C": "Public property",
  "15D": "Church & charitable",
  "15E": "Cemetery",
  "15F": "Other exempt",
};

export const fmtUSD = (n) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });

export const fmtUSDShort = (n) => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
};

// --- URL state (query params), per design doc section 6.4 ---
export function readUrlState() {
  const q = new URLSearchParams(window.location.search);
  return {
    view: q.get("view") || (q.get("pin") ? "parcel" : "town"),
    pin: q.get("pin") || null,
    pins: q.get("pins") ? q.get("pins").split(",") : [],
    agg: q.get("agg") === "median" ? "median" : "sum",
    eq: q.get("eq") !== "0",
  };
}

export function writeUrlState(state) {
  const q = new URLSearchParams();
  if (state.view && state.view !== "town") q.set("view", state.view);
  if (state.pin) q.set("pin", state.pin);
  if (state.pins && state.pins.length) q.set("pins", state.pins.join(","));
  if (state.agg === "median") q.set("agg", "median");
  if (!state.eq) q.set("eq", "0");
  const qs = q.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}

// --- CSV export -------------------------------------------------------
// Every chart shows a slice of the bundle; this lets someone check the
// numbers in a spreadsheet instead of taking the chart on faith.
export function downloadCSV(filename, columns, rows) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => esc(c.get(r))).join(","))
    .join("\n");
  const blob = new Blob([head + "\n" + body], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
