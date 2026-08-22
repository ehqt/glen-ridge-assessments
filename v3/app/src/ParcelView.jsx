import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { useState } from "react";
import { CLASS_NAMES, fmtUSD, fmtUSDShort, downloadCSV } from "./data.js";

const COLORS = {
  land: "#6B7F5C",
  improvement: "#A3543F",
  market: "#C9972C",
};

export default function ParcelView({ parcel, townByYear, eq, onToggleEq }) {
  // 2026 is a revaluation year and its MOD-IV file is not published yet, so
  // the assessment can only come from the notice the owner received. Let them
  // type it in and see the consequence rather than wait for the data.
  const [proj, setProj] = useState({ assessed: "", rate: "" });

  const rows = parcel.years.map((y) => {
    const town = townByYear.get(y.year) || {};
    const ratio = town.equalization_ratio || null;
    const rate = town.general_tax_rate || null;
    return {
      ...y,
      ratio,
      rate,
      market: ratio ? Math.round(y.total / ratio) : null,
      est_tax: rate ? Math.round((y.net_taxable * rate) / 100) : null,
      reval: town.reval_flag || false,
    };
  });
  const projAssessed = Number(String(proj.assessed).replace(/[^0-9.]/g, ""));
  const projRate = Number(String(proj.rate).replace(/[^0-9.]/g, ""));
  const projection =
    projAssessed > 0
      ? {
          year: 2026,
          land: null,
          improvement: null,
          total: projAssessed,
          net_taxable: projAssessed,
          ratio: 1,
          rate: projRate > 0 ? projRate : null,
          market: projAssessed,
          est_tax: projRate > 0 ? Math.round((projAssessed * projRate) / 100) : null,
          projected: true,
        }
      : null;

  const chartRows = projection ? [...rows, projection] : rows;
  const ledgerRows = [...(projection ? [projection] : []), ...rows].sort(
    (a, b) => b.year - a.year
  );
  const latest = rows[rows.length - 1];
  const priorTax = rows.map((r) => r.est_tax).filter(Boolean).pop();
  const yearBuilt = rows.map((r) => r.year_built).filter(Boolean).pop();
  const acreage = rows.map((r) => r.acreage).filter(Boolean).pop();

  return (
    <article>
      <div className="stamp">
        <div className="stamp-ids">
          <span>BLOCK {parcel.block}</span>
          <span>LOT {parcel.lot}</span>
          {parcel.qual && <span>QUAL {parcel.qual}</span>}
          <span>{(CLASS_NAMES[parcel.prop_class] || parcel.prop_class).toUpperCase()}</span>
        </div>
        <h2 className="stamp-addr">{titleCase(parcel.address)}</h2>
        <div className="stamp-facts">
          {yearBuilt ? <span>Built {yearBuilt}</span> : null}
          {acreage ? <span>{acreage.toFixed(2)} acres</span> : null}
          <span>
            {rows.length} assessment {rows.length === 1 ? "year" : "years"} on
            record
          </span>
        </div>
      </div>

      <section className="figures">
        <Figure
          label={`Assessed ${latest.year}`}
          value={fmtUSD(latest.total)}
          sub={`${fmtUSDShort(latest.land)} land + ${fmtUSDShort(latest.improvement)} improvements`}
        />
        <Figure
          label={`Est. market value ${latest.year}`}
          value={fmtUSD(latest.market)}
          sub={
            latest.ratio
              ? `assessed at ${(latest.ratio * 100).toFixed(1)}% of market`
              : "needs equalization ratio"
          }
          accent
        />
        <Figure
          label={`Est. property tax ${latest.year}`}
          value={fmtUSD(latest.est_tax)}
          sub={latest.rate ? `at $${latest.rate.toFixed(3)} per $100` : "needs tax rate"}
        />
      </section>

      <section className="chart-block">
        <div className="chart-head">
          <h3>Assessment history</h3>
          <label className="toggle">
            <input type="checkbox" checked={eq} onChange={onToggleEq} />
            <span>Show estimated market value</span>
          </label>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={{ stroke: "#D8DED6" }}
              tick={{ fontFamily: "IBM Plex Mono", fontSize: 12, fill: "#22352C" }}
            />
            <YAxis
              tickFormatter={fmtUSDShort}
              tickLine={false}
              axisLine={false}
              width={54}
              tick={{ fontFamily: "IBM Plex Mono", fontSize: 12, fill: "#5C6B60" }}
            />
            <Tooltip
              formatter={(v, name) => [fmtUSD(v), name]}
              labelFormatter={(y) => `Tax year ${y}`}
              contentStyle={{
                fontFamily: "IBM Plex Mono",
                fontSize: 13,
                border: "1px solid #D8DED6",
                background: "#FFFFFF",
              }}
            />
            <Legend
              wrapperStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13 }}
              iconType="square"
            />
            <Bar dataKey="land" name="Land" stackId="a" fill={COLORS.land} maxBarSize={64} />
            <Bar
              dataKey="improvement"
              name="Improvements"
              stackId="a"
              fill={COLORS.improvement}
              maxBarSize={64}
            />
            {eq && (
              <Line
                dataKey="market"
                name="Est. market value"
                stroke={COLORS.market}
                strokeWidth={2.5}
                dot={{ r: 4, fill: COLORS.market }}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        <p className="chart-note">
          The stacked bars are what the borough assessed this property at, split
          between the land and the buildings on it. Assessed values sit well
          below what a property would actually sell for, and they stay frozen
          for years at a time — which is why the bars jump in a revaluation
          year rather than climbing steadily.
        </p>
        <p className="chart-note">
          <strong>How the estimated market value is worked out.</strong> Each
          year's assessment is divided by that year's state equalization ratio.
          A $450,000 assessment in a year with a ratio of 0.64 implies a market
          value of about $703,000. This is an arithmetic conversion applied to
          the whole town, not an appraisal of this particular property — it
          says what the average Glen Ridge home at this assessment was worth,
          and any individual house can sit well above or below that.
        </p>
        <p className="chart-note">
          <strong>The state equalization ratio</strong> is the New Jersey
          Division of Taxation's estimate of how far the borough's whole tax
          roll sits below market. Each year the state compares recent arm's
          length sale prices against the assessments those properties carried,
          and certifies the resulting town-wide fraction each October. A ratio
          of 0.64 means Glen Ridge assessments run at roughly 64% of true
          value. It resets to near 1.00 after a revaluation and then drifts
          down again as the market rises and the roll stays put.
        </p>
      </section>

      <section className="chart-block">
        <h3>Project your 2026 assessment</h3>
        <p className="chart-note">
          The 2026 revaluation reset every assessment in the borough, and the
          MOD-IV file for it is not published yet. Enter the figure from your
          notice to see it alongside the history. Nothing is saved or sent
          anywhere — this stays in your browser.
        </p>
        <div className="projection">
          <label>
            2026 assessed value
            <input
              type="text"
              inputMode="numeric"
              value={proj.assessed}
              onChange={(e) => setProj((p) => ({ ...p, assessed: e.target.value }))}
              placeholder="1,250,000"
            />
          </label>
          <label>
            2026 tax rate (per $100)
            <input
              type="text"
              inputMode="decimal"
              value={proj.rate}
              onChange={(e) => setProj((p) => ({ ...p, rate: e.target.value }))}
              placeholder="from your tax bill"
            />
          </label>
          {projection && (
            <div className="projection-out">
              <span className="figure-label">Estimated 2026 tax</span>
              <span className="figure-value">
                {projection.est_tax ? fmtUSD(projection.est_tax) : "enter a rate"}
              </span>
              {projection.est_tax && priorTax ? (
                <span className="figure-sub">
                  {projection.est_tax >= priorTax ? "up" : "down"}{" "}
                  {fmtUSD(Math.abs(projection.est_tax - priorTax))} from{" "}
                  {latest.year}
                </span>
              ) : null}
            </div>
          )}
        </div>
        <p className="chart-note">
          In a revaluation year assessments are reset to full market value, so
          the ratio is about 1.00 and the tax rate drops sharply to raise the
          same levy from a much larger base. A higher assessment does not by
          itself mean a higher bill: what matters is whether your assessment
          rose by more or less than the town average.
        </p>
      </section>

      <section>
        <div className="chart-head">
          <h3>Ledger</h3>
          <button
            className="download-btn"
            onClick={() =>
              downloadCSV(
                `${parcel.block}-${parcel.lot}-assessments.csv`,
                [
                  { label: "year", get: (r) => r.year },
                  { label: "land", get: (r) => r.land },
                  { label: "improvement", get: (r) => r.improvement },
                  { label: "total_assessed", get: (r) => r.total },
                  { label: "net_taxable", get: (r) => r.net_taxable },
                  { label: "equalization_ratio", get: (r) => r.ratio },
                  { label: "est_market_value", get: (r) => r.market },
                  { label: "tax_rate", get: (r) => r.rate },
                  { label: "est_tax", get: (r) => r.est_tax },
                  { label: "projected", get: (r) => (r.projected ? "yes" : "") },
                ],
                ledgerRows
              )
            }
          >
            Download CSV
          </button>
        </div>
        <table className="ledger">
          <thead>
            <tr>
              <th>Year</th>
              <th className="num">Land</th>
              <th className="num">Improvements</th>
              <th className="num">Total assessed</th>
              <th className="num">Net taxable</th>
              <th className="num">Est. market</th>
              <th className="num">Est. tax</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.map((r) => (
              <tr key={r.year} className={r.projected ? "row-projected" : undefined}>
                <td>{r.year}{r.projected ? " *" : ""}</td>
                <td className="num">{fmtUSD(r.land)}</td>
                <td className="num">{fmtUSD(r.improvement)}</td>
                <td className="num">{fmtUSD(r.total)}</td>
                <td className="num">{fmtUSD(r.net_taxable)}</td>
                <td className="num accent">{fmtUSD(r.market)}</td>
                <td className="num">{fmtUSD(r.est_tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  );
}

function Figure({ label, value, sub, accent }) {
  return (
    <div className={"figure" + (accent ? " figure-accent" : "")}>
      <span className="figure-label">{label}</span>
      <span className="figure-value">{value}</span>
      <span className="figure-sub">{sub}</span>
    </div>
  );
}

function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Ave|St|Rd|Pl|Ct|Ter|Dr)\b\.?/g, (m) => m);
}
