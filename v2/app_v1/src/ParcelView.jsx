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
import { CLASS_NAMES, fmtUSD, fmtUSDShort } from "./data.js";

const COLORS = {
  land: "#6B7F5C",
  improvement: "#A3543F",
  market: "#C9972C",
};

export default function ParcelView({ parcel, townByYear, eq, onToggleEq }) {
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
  const latest = rows[rows.length - 1];
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
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
          Assessed values jump in revaluation years; the market-value line
          divides each year's assessment by that year's state equalization
          ratio to make years comparable.
        </p>
      </section>

      <section>
        <h3>Ledger</h3>
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
            {rows.map((r) => (
              <tr key={r.year}>
                <td>{r.year}</td>
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
