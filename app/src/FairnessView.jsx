import { useMemo, useState } from "react";
import { downloadCSV } from "./data.js";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Cell,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceArea,
  ReferenceLine,
} from "recharts";


const C = {
  ink: "#22352C",
  soft: "#5C6B60",
  hairline: "#D8DED6",
  green: "#6B7F5C",
  clay: "#A3543F",
  gold: "#C9972C",
  band: "#E8EDE4",
};

const axis = { fontFamily: "IBM Plex Mono", fontSize: 12, fill: C.soft };
const tip = {
  fontFamily: "IBM Plex Mono",
  fontSize: 13,
  border: `1px solid ${C.hairline}`,
  background: "#FFFFFF",
};
const r3 = (v) => (v == null ? "—" : Number(v).toFixed(3));

// Price-band labels must stay distinguishable: $1.05M and $1.15M both render
// as "$1.1M" at one decimal, so bands are labelled in thousands instead.
const fmtK = (n) => `$${Math.round(n / 1000).toLocaleString()}K`;

export default function FairnessView({ ratioStudy }) {
  const windows = ratioStudy?.by_window ?? [];
  const quintiles = ratioStudy?.by_quintile ?? [];

  const rows = useMemo(
    () =>
      windows.map((r) => ({
        year: r.year,
        n: r.n,
        window: r.window,
        median: r.median_ratio,
        eq: r.state_equalization_ratio,
        cod: r.cod,
        codBand: r.cod_ci || null,
        prd: r.prd,
        prb: r.prb,
        prbBand: r.prb_ci || null,
      })),
    [windows]
  );

  const revalYears = useMemo(
    () => windows.filter((r) => r.reval_year).map((r) => r.year),
    [windows]
  );

  const quintileYears = useMemo(
    () => [...new Set(quintiles.map((q) => q.year))].sort((a, b) => b - a),
    [quintiles]
  );
  const [qYear, setQYear] = useState(null);

  // Hooks must run before any early return, so the empty-state check sits here.
  if (!ratioStudy || !rows.length) {
    return (
      <article>
        <p className="chart-note">
          This bundle has no ratio study. Rerun the ingest with sale fields
          enabled to populate it.
        </p>
      </article>
    );
  }

  const activeYear = qYear ?? quintileYears[0];
  const qRows = quintiles.filter((q) => q.year === activeYear);
  const benchmarks = ratioStudy.benchmarks;
  const method = ratioStudy.method;

  // Last row with real statistics. Older bundles can carry rows whose stats
  // were suppressed by trimming; picking those would blank out the findings.
  const latest = [...rows].reverse().find((r) => r.cod != null) || rows[rows.length - 1];
  const gap =
    qRows.length > 1
      ? (100 * (qRows[qRows.length - 1].median_ratio - qRows[0].median_ratio)) /
        qRows[0].median_ratio
      : null;

  const codCeiling = benchmarks.cod.acceptable;
  const prbLo = benchmarks.prb.low;
  const prbHi = benchmarks.prb.high;

  // A COD whose interval straddles the ceiling cannot support a claim either
  // way; say so rather than reporting the point estimate as a verdict.
  const codVerdict = !latest.codBand
    ? "not enough sales to say"
    : latest.codBand[0] > codCeiling
    ? "above the IAAO ceiling"
    : latest.codBand[1] < codCeiling
    ? "within the IAAO range"
    : "too close to call";

  const revalList = rows.filter((r) => revalYears.includes(r.year));
  const lastReval = revalList.length ? revalList[revalList.length - 1] : null;
  const worstCod = rows.reduce((a, b) => ((b.cod ?? 0) > (a.cod ?? 0) ? b : a), rows[0]);
  const bestCod = rows.reduce(
    (a, b) => ((b.cod ?? 99) < (a.cod ?? 99) ? b : a),
    rows[0]
  );
  const worstPrb = rows.reduce(
    (a, b) => ((b.prb ?? 0) < (a.prb ?? 0) ? b : a),
    rows[0]
  );
  const driftSince =
    lastReval && lastReval.median
      ? (100 * (lastReval.median - latest.median)) / lastReval.median
      : null;

  const qFirst = qRows[0];
  const qLast = qRows[qRows.length - 1];
  const qDropAtSecond =
    qRows.length > 1 && qFirst.median_ratio
      ? (100 * (qRows[1].median_ratio - qFirst.median_ratio)) / qFirst.median_ratio
      : null;
  const qRestSpread =
    qRows.length > 2
      ? Math.max(...qRows.slice(1).map((q) => q.median_ratio)) -
        Math.min(...qRows.slice(1).map((q) => q.median_ratio))
      : null;

  const dl = (name, cols, data) => (
    <button className="download-btn" onClick={() => downloadCSV(name, cols, data)}>
      Download CSV
    </button>
  );

  return (
    <article>
      <section className="prose">
        <h2>Is Glen Ridge assessed fairly?</h2>
        <p>
          Everyone in the borough pays the same tax rate. That does not mean
          everyone pays the same share of what their home is actually worth.
          Assessments are estimates, they are made in bulk, and they sit frozen
          for years while the market moves — so some properties drift closer to
          their true value than others. When that happens, two owners with
          equally valuable homes get different bills, and neither of them knows.
        </p>
        <p>
          This page measures that drift. It does not tell you whether Glen
          Ridge's taxes are high; it asks whether the burden is spread evenly.
        </p>
        <h3 className="prose-sub">How it is measured</h3>
        <p>
          Every arm's length sale in the borough since 1989 is paired with the
          assessment that property carried at the moment it sold. Dividing one
          by the other gives an <strong>assessment-to-sales ratio</strong>, and
          thousands of them together describe how the whole roll behaves. This is the same method
          the State of New Jersey uses to police assessment quality, run here
          on the borough's own published records.
        </p>
        <p>
          Sales that are not arm's length are excluded — transfers between
          family members, sheriff's sales, estate settlements — because their
          prices do not reflect the market. The state marks these, and about one
          Glen Ridge sale in six carries such a mark.{" "}
          {ratioStudy.sales.length.toLocaleString()} usable sales remain.
        </p>
      </section>

      <details className="terms">
        <summary>What the terms on this page mean</summary>
        <dl className="terms-list">
          <div>
            <dt>Assessment-to-sales ratio</dt>
            <dd>
              A single property's assessed value divided by the price it sold
              for. A home assessed at $640,000 that sold for $1,000,000 has a
              ratio of 0.64. Lower means assessed further below what it is
              worth; higher means assessed closer to, or above, its true value.
              Because the tax rate is the same for everyone, a higher ratio
              means a higher effective tax on the same real wealth.
            </dd>
          </div>
          <div>
            <dt>The roll</dt>
            <dd>
              The tax roll: the complete list of every property in the borough
              and the assessment attached to it. "How far below market the roll
              sits" means how far the whole list, taken together, has fallen
              behind actual prices.
            </dd>
          </div>
          <div>
            <dt>State ratio</dt>
            <dd>
              The equalization ratio, certified each October by the New Jersey
              Division of Taxation. The state runs its own version of this
              study, using sales from a sampling window that ends about
              eighteen months before the tax year, and publishes one figure per
              town. It is the official answer to the same question this page
              asks independently.
            </dd>
          </div>
          <div>
            <dt>COD</dt>
            <dd>
              Coefficient of dispersion. How far a typical property's ratio sits
              from the town median, as a percentage. A COD of 12 means the
              average property is about 12% away from the middle. It measures
              consistency: whether two similar houses are treated the same.
              Lower is better.
            </dd>
          </div>
          <div>
            <dt>PRB</dt>
            <dd>
              Price-related bias. How much the assessment level shifts each time
              property value doubles. Zero means expensive and modest homes are
              assessed at the same share of their worth. A PRB of −0.10 means
              that for every doubling in value, a property is assessed about 10%
              further below market.
            </dd>
          </div>
          <div>
            <dt>Regressive</dt>
            <dd>
              When less expensive homes are assessed closer to their true market
              value than expensive ones. The rate is identical for everyone, so
              the effect is that modest homes pay a higher effective tax on the
              same real wealth. The opposite pattern is called progressive.
            </dd>
          </div>
          <div>
            <dt>IAAO</dt>
            <dd>
              The International Association of Assessing Officers, the
              professional body that writes the standards assessors and state
              agencies work to. Its published thresholds — a COD at or under 15
              for older, varied housing, a PRB between −0.05 and 0.05 — are the
              shaded bands on the charts below. They are an outside yardstick,
              not one chosen here.
            </dd>
          </div>
          <div>
            <dt>Ratio gap across value quintiles</dt>
            <dd>
              Sales are sorted by price and cut into five equal groups. The gap
              is the difference in median assessment-to-sales ratio between the
              cheapest fifth and the priciest fifth. A gap of −20% means the most expensive homes
              are assessed about a fifth further below market than the least
              expensive ones.
            </dd>
          </div>
          <div>
            <dt>Confidence interval</dt>
            <dd>
              A small town produces few sales a year, so every figure here
              carries uncertainty. The interval is the range the true value
              plausibly falls in. When it straddles a standard, the data cannot
              settle the question either way, and this page says so rather than
              picking a side.
            </dd>
          </div>
        </dl>
      </details>

      <section className="chart-block">
        <div className="chart-head">
          <h3>How far below market the roll sits</h3>
          {dl("glen-ridge-assessment-level.csv", [
            { label: "sale_year", get: (r) => r.year },
            { label: "sales", get: (r) => r.n },
            { label: "window_years", get: (r) => r.window },
            { label: "median_ratio", get: (r) => r.median },
            { label: "state_equalization_ratio", get: (r) => r.eq },
          ], rows)}
        </div>
        <p className="chart-note chart-intro">
          Each point is the median assessment-to-sales ratio of all sales that
          year: assessed value divided by what the property actually sold for.
          At 0.50 the roll is assessing at about half of market value.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: C.hairline }} tick={axis} />
            <YAxis
              domain={[0, 1.1]}
              ticks={[0, 0.5, 1.0]}
              tickFormatter={(v) => v.toFixed(1)}
              tickLine={false}
              axisLine={false}
              width={72}
              tick={axis}
              label={{
                value: "Median Assessment-to-Sales Ratio",
                angle: -90,
                position: "insideLeft",
                style: {
                  fontFamily: "IBM Plex Sans",
                  fontSize: 12.5,
                  fill: C.soft,
                  textAnchor: "middle",
                },
              }}
            />
            <Tooltip
              formatter={(v, name) => [r3(v), name]}
              labelFormatter={(y) => `Sales in ${y}`}
              contentStyle={tip}
            />
            <Legend wrapperStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13 }} iconType="plainline" />
            {revalYears.map((y) => (
              <ReferenceLine
                key={y}
                x={y}
                stroke={C.clay}
                strokeDasharray="3 3"
                label={{
                  value: "reval",
                  position: "top",
                  fontFamily: "IBM Plex Mono",
                  fontSize: 11,
                  fill: C.clay,
                }}
              />
            ))}
            <Line
              dataKey="median"
              name="This study"
              stroke={C.ink}
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
            <Line
              dataKey="eq"
              name="State ratio"
              stroke={C.gold}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="chart-note">
          The two series are measured over different sale windows. The state's
          figure for a given tax year draws on sales ending about eighteen
          months earlier, so in a fast-rising market it sits above this study
          by design. Through the flat years around 2012 the two agree almost
          exactly, which is the check that this study is built correctly.
        </p>
        <p className="chart-note chart-finding">
          <strong>What this shows for Glen Ridge.</strong> The sawtooth is the
          whole story of a New Jersey tax roll. Assessments are reset to market,
          then frozen while prices climb, so the line slides downward year after
          year until the next revaluation snaps it back.{" "}
          {revalList.length >= 2 && (
            <>
              Two full cycles are visible here, at{" "}
              {revalList.map((r) => r.year).join(" and ")}.{" "}
            </>
          )}
          {lastReval && driftSince > 0 && (
            <>
              Since the {lastReval.year} reset the roll has drifted{" "}
              {driftSince.toFixed(0)}% further below market, reaching{" "}
              {r3(latest.median)} by {latest.year}. The 2026 revaluation is the
              next reset, and this is the gap it closes.
            </>
          )}
        </p>
      </section>

      <section className="chart-block">
        <div className="chart-head">
          <h3>Are similar homes treated alike?</h3>
          {dl("glen-ridge-cod.csv", [
            { label: "sale_year", get: (r) => r.year },
            { label: "sales", get: (r) => r.n },
            { label: "cod", get: (r) => r.cod },
            { label: "cod_ci_low", get: (r) => r.codBand?.[0] },
            { label: "cod_ci_high", get: (r) => r.codBand?.[1] },
          ], rows)}
        </div>
        <p className="chart-note chart-intro">
          This is about consistency, not level. Everyone being assessed at 60%
          of market would be perfectly fair; the problem is when one owner is at
          50% and their neighbour in an identical house is at 75%.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: C.hairline }} tick={axis} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={62}
              tick={axis}
              label={{
                value: "COD",
                angle: -90,
                position: "insideLeft",
                style: {
                  fontFamily: "IBM Plex Sans",
                  fontSize: 12.5,
                  fill: C.soft,
                  textAnchor: "middle",
                },
              }}
            />
            <Tooltip
              formatter={(v, name) =>
                Array.isArray(v)
                  ? [`${v[0].toFixed(1)} – ${v[1].toFixed(1)}`, name]
                  : [Number(v).toFixed(1), name]
              }
              labelFormatter={(y) => `Sales in ${y}`}
              contentStyle={tip}
            />
            <ReferenceArea y1={0} y2={codCeiling} fill={C.band} fillOpacity={0.7} />
            <ReferenceLine
              y={codCeiling}
              stroke={C.green}
              strokeWidth={1.5}
              label={{
                value: `IAAO ceiling ${codCeiling}`,
                position: "insideTopLeft",
                fontFamily: "IBM Plex Mono",
                fontSize: 11,
                fill: C.green,
              }}
            />
            <Area
              dataKey="codBand"
              name="95% interval"
              stroke="none"
              fill={C.clay}
              fillOpacity={0.16}
              connectNulls
            />
            <Line dataKey="cod" name="COD" stroke={C.clay} strokeWidth={2.5} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="chart-note">
          The coefficient of dispersion measures how far a typical property's
          ratio sits from the town median. Anything inside the shaded band meets
          the IAAO standard for older, varied housing stock. The lighter ribbon
          is the 95% confidence interval; where it crosses the line, the data
          cannot settle the question.
        </p>
        <p className="chart-note chart-finding">
          <strong>What this shows for Glen Ridge.</strong> Uniformity tracks the
          revaluation cycle just as the level does. The roll is at its most
          consistent in the years following a reset — {bestCod.cod?.toFixed(1)}{" "}
          in {bestCod.year} — and its worst at the end of a long freeze, reaching{" "}
          {worstCod.cod?.toFixed(1)} in {worstCod.year}, above the IAAO ceiling
          of {codCeiling}. In {latest.year} it stands at {latest.cod?.toFixed(1)}
          {latest.codBand
            ? `, with a confidence interval of ${latest.codBand[0].toFixed(
                1
              )} to ${latest.codBand[1].toFixed(1)}`
            : ""}
          .{" "}
          {codVerdict === "too close to call"
            ? "That interval straddles the standard, so the honest answer is that the borough is close to the line and the data cannot say which side it falls on."
            : codVerdict === "above the IAAO ceiling"
            ? "The whole interval sits above the standard, so the borough currently fails the uniformity test."
            : "The whole interval sits below the standard, so the borough currently passes the uniformity test."}
        </p>
      </section>

      <section className="chart-block">
        <div className="chart-head">
          <h3>Does the burden tilt by price?</h3>
          {dl("glen-ridge-prb.csv", [
            { label: "sale_year", get: (r) => r.year },
            { label: "sales", get: (r) => r.n },
            { label: "prb", get: (r) => r.prb },
            { label: "prd", get: (r) => r.prd },
          ], rows)}
        </div>
        <p className="chart-note chart-intro">
          The previous chart asked whether similar homes are treated alike. This
          one asks something different: whether the assessment level depends on
          how expensive the home is.
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: C.hairline }} tick={axis} />
            <YAxis
              tickFormatter={(v) => v.toFixed(2)}
              tickLine={false}
              axisLine={false}
              width={66}
              tick={axis}
              label={{
                value: "PRB",
                angle: -90,
                position: "insideLeft",
                style: {
                  fontFamily: "IBM Plex Sans",
                  fontSize: 12.5,
                  fill: C.soft,
                  textAnchor: "middle",
                },
              }}
            />
            <Tooltip
              formatter={(v, name) =>
                Array.isArray(v) ? [`${r3(v[0])} – ${r3(v[1])}`, name] : [r3(v), name]
              }
              labelFormatter={(y) => `Sales in ${y}`}
              contentStyle={tip}
            />
            <ReferenceArea y1={prbLo} y2={prbHi} fill={C.band} fillOpacity={0.7} />
            <ReferenceLine y={0} stroke={C.hairline} />
            <Area
              dataKey="prbBand"
              name="95% interval"
              stroke="none"
              fill={C.ink}
              fillOpacity={0.12}
              connectNulls
            />
            <Line dataKey="prb" name="PRB" stroke={C.ink} strokeWidth={2.5} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="chart-note">
          Price-related bias is the change in assessment level per doubling of
          value. Below the shaded band, modest homes are assessed closer to what
          they sell for than expensive ones — the definition of a regressive
          roll. Above it, the tilt runs the other way.
        </p>
        <p className="chart-note chart-finding">
          <strong>What this shows for Glen Ridge.</strong> The tilt is
          regressive for most of the record, and it follows the revaluation
          cycle. After a reset it recovers into the acceptable band and can
          even tilt the other way, as it did through the mid-2010s. Then it
          turns sharply regressive again as the roll ages, bottoming at{" "}
          {r3(worstPrb.prb)} in {worstPrb.year} — roughly{" "}
          {Math.abs(worstPrb.prb / prbLo).toFixed(0)} times the IAAO tolerance
          of {prbLo}. In {latest.year} it stands at {r3(latest.prb)}, meaning
          that each doubling in a property's value comes with an assessment
          roughly {Math.abs(latest.prb * 100).toFixed(0)}% further below market.
          A $600,000 house and a $2.4M house pay the same nominal rate, but not
          the same share of what they are actually worth.
        </p>
      </section>

      <section className="chart-block">
        <div className="chart-head">
          <h3>Assessment level by price band</h3>
          {dl(`glen-ridge-quintiles-${activeYear}.csv`, [
            { label: "year", get: (r) => r.year },
            { label: "quintile", get: (r) => r.quintile },
            { label: "sales", get: (r) => r.n },
            { label: "price_floor", get: (r) => r.price_floor },
            { label: "price_ceiling", get: (r) => r.price_ceiling },
            { label: "median_ratio", get: (r) => r.median_ratio },
          ], qRows)}
          <label className="toggle">
            Sales year
            <select
              className="year-select"
              value={activeYear}
              onChange={(e) => setQYear(Number(e.target.value))}
            >
              {quintileYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={qRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="quintile"
              tickFormatter={(q) => {
                const row = qRows.find((r) => r.quintile === q);
                return row ? fmtK(row.price_floor) : q;
              }}
              tickLine={false}
              axisLine={{ stroke: C.hairline }}
              tick={axis}
            />
            <YAxis
              tickFormatter={(v) => v.toFixed(2)}
              tickLine={false}
              axisLine={false}
              width={46}
              tick={axis}
            />
            <Tooltip
              cursor={{ fill: C.band, fillOpacity: 0.5 }}
              formatter={(v) => [r3(v), "Median ratio"]}
              labelFormatter={(q) => {
                const row = qRows.find((r) => r.quintile === q);
                return row
                  ? `${fmtK(row.price_floor)}–${fmtK(row.price_ceiling)} · ${
                      row.n
                    } sales`
                  : `Quintile ${q}`;
              }}
              contentStyle={tip}
            />
            <Bar dataKey="median_ratio" maxBarSize={78} radius={[2, 2, 0, 0]}>
              {qRows.map((row, i) => (
                <Cell key={row.quintile} fill={i === 0 ? C.clay : C.green} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="chart-note">
          Sales in {activeYear} split into five equal groups by price, labelled
          with each group's floor. A level roll would show five bars of the same
          height. Taller bars on the left mean the least expensive homes are
          assessed closer to what they actually sell for — the same regressive
          pattern the price-related bias chart above measures as a single
          number. The two charts are two views of one finding: this one shows
          its shape in a single year, that one tracks its strength over time.
          {qRows[0]?.window > 1 && (
            <> Thin years are pooled across {qRows[0].window} years of sales.</>
          )}
        </p>
        <p className="chart-note chart-finding">
          <strong>What this shows for Glen Ridge.</strong>{" "}
          {gap != null && (
            <>
              In {activeYear} the priciest fifth is assessed{" "}
              {Math.abs(gap).toFixed(0)}%{" "}
              {gap < 0 ? "further below" : "closer to"} market than the cheapest
              fifth.{" "}
            </>
          )}
          {qDropAtSecond != null && qRestSpread != null && qRestSpread < 0.05 && (
            <>
              But the decline is not a smooth slope. Almost all of it happens in
              a single step between the first and second bands
              ({qDropAtSecond.toFixed(0)}%), after which the remaining four sit
              within {(qRestSpread * 100).toFixed(1)} percentage points of each
              other. The fair reading is that the least expensive fifth of the
              market is assessed noticeably high, rather than that assessments
              decline steadily as prices rise.{" "}
            </>
          )}
          With {qRows.reduce((n, q) => n + q.n, 0)} sales split five ways, each
          bar rests on {Math.round(qRows.reduce((n, q) => n + q.n, 0) / 5)} or so
          transactions, so read the overall shape rather than any single bar.
        </p>
      </section>

      <p className="chart-note chart-method">
        Built from {ratioStudy.sales.length.toLocaleString()} arm's-length sales,
        each paired with the assessment in force at the time of transfer.
        Non-usable transfers are excluded per the state's SR-1A codes. Ratios
        beyond {method.trim.replace("_", " ")} of the interquartile range are
        trimmed, and years with fewer than {method.min_n} sales are pooled or
        withheld. Not an official ratio study.
      </p>
    </article>
  );
}

