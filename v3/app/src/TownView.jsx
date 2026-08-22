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
import { CLASS_NAMES, fmtUSD, fmtUSDShort, downloadCSV } from "./data.js";

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
        <div className="chart-head">
          <h3>Where the levy goes</h3>
          <button
            className="download-btn"
            onClick={() =>
              downloadCSV("glen-ridge-levy.csv", [
                { label: "year", get: (r) => r.year },
                { label: "total_levy", get: (r) => r.levy },
                { label: "school_levy", get: (r) => r.school },
                { label: "county_levy", get: (r) => r.county },
                { label: "municipal_levy", get: (r) => r.municipal },
                { label: "general_tax_rate", get: (r) => r.rate },
              ], rows)
            }
          >
            Download CSV
          </button>
        </div>
        <p className="chart-note chart-intro">
          The levy is the total number of dollars the borough must collect in
          property tax, and it is decided by budgets rather than by
          assessments. Three separate bodies set their own: the school
          district, Essex County, and the borough itself. The bars stack those
          three into the total bill for the town, so the height of a bar is
          everything Glen Ridge property owners paid that year.
        </p>
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
              content={<LevyTooltip />}
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
          The gold line, read against the right-hand axis, is the general tax
          rate per $100 of assessed value. Watch what it does at a
          revaluation: the rate drops steeply while the bars keep climbing. A
          revaluation raises the value the rate is applied to, so the same
          levy needs a smaller rate. A falling tax rate is not a tax cut.
          Schools are consistently the largest single share. Years without
          bars are missing their state tax table and have not been filled in.
        </p>
      </section>

      <section className="chart-block">
        <div className="chart-head">
          <h3>What the levy is raised on</h3>
          <button
            className="download-btn"
            onClick={() =>
              downloadCSV("glen-ridge-ratables.csv", [
                { label: "year", get: (r) => r.year },
                { label: "net_ratables_assessed", get: (r) => r.ratables },
                { label: "equalized_market_value", get: (r) => r.equalized },
                { label: "exempt_value", get: (r) => r.exempt },
                { label: "taxable_parcels", get: (r) => r.parcels },
              ], rows)
            }
          >
            Download CSV
          </button>
        </div>
        <p className="chart-note chart-intro">
          The levy is spread across the town's tax base, so the size of that
          base determines what any one owner pays. The bars are net
          ratables — every taxable assessment in the borough added together.
          The gold line is what the same properties are actually worth.
        </p>
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
          <strong>Equalized (market) value</strong> is the state's estimate of
          the true worth of everything on the tax roll. It is computed by
          dividing total net ratables by the equalization ratio for that year:
          a town assessed at 40% of market with $500 million of ratables has an
          equalized value of about $1.25 billion. The Division of Taxation
          derives the ratio each year by comparing recent arm's length sale
          prices against the assessments those properties carried.
        </p>
        <p className="chart-note">
          The gap between the two lines is the measure of how stale the roll
          has become. They meet in a revaluation year, when assessments are
          reset to market, and then separate again as prices rise while the
          assessments sit frozen. A wide and widening gap is the signal that a
          revaluation is due. Equalized value also matters directly: the county
          apportions its levy across municipalities using this figure, not the
          assessed one, so it determines Glen Ridge's share of the county tax.
        </p>
      </section>

      <section>
        <div className="chart-head">
          <h3>Off the tax rolls, {latestYearData.year}</h3>
          <button
            className="download-btn"
            onClick={() =>
              downloadCSV("glen-ridge-exempt.csv", [
                { label: "class", get: (r) => r.cls },
                { label: "class_name", get: (r) => r.name },
                { label: "assessed_value", get: (r) => r.val },
              ], exemptRows)
            }
          >
            Download CSV
          </button>
        </div>
        <p className="chart-note chart-intro">
          Some property pays no tax at all: schools, churches, borough land,
          and certain nonprofits. That value still exists and still uses
          borough services, but the levy is spread only across everyone else.
        </p>
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

// The stacked bars answer "how is the levy split", but the question people
// actually ask is "what was the whole bill" — so the tooltip shows the total
// as well as the parts.
function LevyTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const parts = payload.filter((p) => p.name !== "Tax rate" && p.value != null);
  const rate = payload.find((p) => p.name === "Tax rate");
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="levy-tip">
      <div className="levy-tip-head">Tax year {label}</div>
      {parts.map((p) => (
        <div key={p.name} className="levy-tip-row">
          <span className="levy-tip-swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="levy-tip-val">{fmtUSD(p.value)}</span>
          <span className="levy-tip-pct">
            {total ? `${((p.value / total) * 100).toFixed(0)}%` : ""}
          </span>
        </div>
      ))}
      <div className="levy-tip-row levy-tip-total">
        <span className="levy-tip-swatch" />
        <span>Total levy</span>
        <span className="levy-tip-val">{fmtUSD(total)}</span>
        <span className="levy-tip-pct">100%</span>
      </div>
      {rate && (
        <div className="levy-tip-rate">
          Tax rate ${Number(rate.value).toFixed(3)} per $100
        </div>
      )}
    </div>
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
