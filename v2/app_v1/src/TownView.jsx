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
  school: "#22352C",
  county: "#6B7F5C",
  municipal: "#A3543F",
  rate: "#C9972C",
  exempt: "#5C6B60",
};

export default function TownView({ townSeries, exemptBreakdown, municipality }) {
  const rows = townSeries.map((t) => ({
    year: t.year,
    levy: t.levy,
    school: t.levy_breakdown?.school ?? null,
    county: t.levy_breakdown?.county ?? null,
    municipal: t.levy_breakdown?.municipal ?? null,
    rate: t.general_tax_rate,
    ratables: t.net_ratables,
    equalized: t.equalized_value,
    exempt: t.exempt_value,
    parcels: t.taxable_parcels,
  }));
  const latest = [...rows].reverse().find((r) => r.levy) || rows[rows.length - 1];
  const first = rows.find((r) => r.levy);
  const latestYearData = rows[rows.length - 1];
  const exemptLatest = exemptBreakdown?.[String(latestYearData.year)] || {};
  const exemptRows = Object.entries(exemptLatest)
    .map(([cls, val]) => ({ cls, name: CLASS_NAMES[cls] || cls, val }))
    .sort((a, b) => b.val - a.val);
  const exemptTotal = exemptRows.reduce((s, r) => s + r.val, 0);

  return (
    <article>
      <section className="figures figures-town">
        <Figure
          label={`Total tax levy ${latest.year}`}
          value={fmtUSD(latest.levy)}
          sub={
            first && first.year !== latest.year
              ? `up from ${fmtUSDShort(first.levy)} in ${first.year}`
              : "certified levy"
          }
          accent
        />
        <Figure
          label={`Net ratables ${latestYearData.year}`}
          value={fmtUSDShort(latestYearData.ratables)}
          sub={`${latestYearData.parcels.toLocaleString()} taxable parcels`}
        />
        <Figure
          label={`General tax rate ${latest.year}`}
          value={latest.rate ? `$${latest.rate.toFixed(3)}` : "—"}
          sub="per $100 of assessed value"
        />
        <Figure
          label={`Exempt value ${latestYearData.year}`}
          value={fmtUSDShort(latestYearData.exempt)}
          sub="assessed value off the tax rolls"
        />
      </section>

      <section className="chart-block">
        <h3>Where the levy goes</h3>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={{ stroke: "#D8DED6" }}
              tick={{ fontFamily: "IBM Plex Mono", fontSize: 12, fill: "#22352C" }}
            />
            <YAxis
              yAxisId="levy"
              tickFormatter={fmtUSDShort}
              tickLine={false}
              axisLine={false}
              width={54}
              tick={{ fontFamily: "IBM Plex Mono", fontSize: 12, fill: "#5C6B60" }}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              tickFormatter={(v) => `$${v}`}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={[0, "auto"]}
              tick={{ fontFamily: "IBM Plex Mono", fontSize: 12, fill: "#8A6512" }}
            />
            <Tooltip
              formatter={(v, name) =>
                name === "Tax rate"
                  ? [`$${Number(v).toFixed(3)} per $100`, name]
                  : [fmtUSD(v), name]
              }
              labelFormatter={(y) => `Tax year ${y}`}
              contentStyle={{
                fontFamily: "IBM Plex Mono",
                fontSize: 13,
                border: "1px solid #D8DED6",
                background: "#FFFFFF",
              }}
            />
            <Legend wrapperStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13 }} iconType="square" />
            <Bar yAxisId="levy" dataKey="school" name="School" stackId="a" fill={COLORS.school} maxBarSize={64} />
            <Bar yAxisId="levy" dataKey="county" name="County" stackId="a" fill={COLORS.county} maxBarSize={64} />
            <Bar yAxisId="levy" dataKey="municipal" name="Municipal" stackId="a" fill={COLORS.municipal} maxBarSize={64} />
            <Line
              yAxisId="rate"
              dataKey="rate"
              name="Tax rate"
              stroke={COLORS.rate}
              strokeWidth={2.5}
              dot={{ r: 4, fill: COLORS.rate }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="chart-note">
          Bars show the certified levy split between school, county, and
          municipal purposes. The gold line is the general tax rate per $100 of
          assessed value; it falls after revaluations raise assessments, even
          as the levy itself keeps growing. Years without bars are missing
          their DCA tax table.
        </p>
      </section>

      <section className="chart-block">
        <h3>What the levy is raised on</h3>
        <ResponsiveContainer width="100%" height={280}>
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
            <Legend wrapperStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13 }} iconType="square" />
            <Bar dataKey="ratables" name="Net ratables (assessed)" fill={COLORS.county} maxBarSize={64} />
            <Line
              dataKey="equalized"
              name="Equalized (market) value"
              stroke={COLORS.rate}
              strokeWidth={2.5}
              dot={{ r: 4, fill: COLORS.rate }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="chart-note">
          When the gold market line pulls far above the assessed bars, the
          borough is due for a revaluation.
        </p>
      </section>

      <section>
        <h3>Off the tax rolls, {latestYearData.year}</h3>
        <table className="ledger">
          <thead>
            <tr>
              <th>Exempt class</th>
              <th className="num">Assessed value</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {exemptRows.map((r) => (
              <tr key={r.cls}>
                <td>{r.name}</td>
                <td className="num">{fmtUSD(r.val)}</td>
                <td className="num">{((r.val / exemptTotal) * 100).toFixed(1)}%</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total exempt</strong></td>
              <td className="num"><strong>{fmtUSD(exemptTotal)}</strong></td>
              <td className="num">100%</td>
            </tr>
          </tbody>
        </table>
        <p className="chart-note">
          If taxed at the {latestYearData.year} rate, this value would raise
          about{" "}
          {latest.rate
            ? fmtUSD(Math.round((exemptTotal * latest.rate) / 100))
            : "—"}{" "}
          — the cost, in levy terms, of {municipality}'s schools, churches, and
          public property being exempt.
        </p>
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
