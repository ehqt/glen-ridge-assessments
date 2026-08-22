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
import { screen } from "./appeal.js";

const COLORS = {
  land: "#6B7F5C",
  improvement: "#A3543F",
  market: "#C9972C",
};

export default function ParcelView({ parcel, townByYear, eq, onToggleEq, comps }) {
  // 2026 is a revaluation year and its MOD-IV file is not published yet, so
  // the assessment can only come from the notice the owner received. Let them
  // type it in and see the consequence rather than wait for the data.
  const [proj, setProj] = useState({ land: "", improvement: "", rate: "" });
  const [ownEstimate, setOwnEstimate] = useState("");

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
  const latestRow = rows[rows.length - 1];
  const num = (v) => Number(String(v).replace(/[^0-9.]/g, "")) || 0;
  const projLand = num(proj.land);
  const projImp = num(proj.improvement);
  const projAssessed = projLand + projImp;
  const projRate = num(proj.rate);
  const projection =
    projAssessed > 0
      ? {
          year: 2026,
          land: projLand || null,
          improvement: projImp || null,
          total: projAssessed,
          net_taxable: projAssessed,
          ratio: 1,
          rate: projRate > 0 ? projRate : null,
          market: projAssessed,
          est_tax: projRate > 0 ? Math.round((projAssessed * projRate) / 100) : null,
          projected: true,
        }
      : null;

  // Appeal screening runs against the most recent assessment on the roll.
  // The equalization ratio for that year is often not published yet, so fall
  // back to the most recent one that exists and say which year it came from —
  // that is what a practitioner would do rather than give up.
  const ratioRow = [...rows].reverse().find((r) => r.ratio) || null;
  const appeal = screen({
    subject: {
      pin: parcel.pin,
      block: parcel.block,
      assessed: latestRow.total,
    },
    comps,
    avgRatio: ratioRow?.ratio,
    overrideValue: Number(String(ownEstimate).replace(/[^0-9.]/g, "")) || null,
  });

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
        <div className="chart-head">
          <h3>Estimated tax by year</h3>
          <button
            className="download-btn"
            onClick={() =>
              downloadCSV(
                `${parcel.block}-${parcel.lot}-est-tax.csv`,
                [
                  { label: "year", get: (r) => r.year },
                  { label: "net_taxable", get: (r) => r.net_taxable },
                  { label: "tax_rate", get: (r) => r.rate },
                  { label: "est_tax", get: (r) => r.est_tax },
                ],
                chartRows
              )
            }
          >
            Download CSV
          </button>
        </div>
        <p className="chart-note chart-intro">
          Net taxable value multiplied by that year's general tax rate. This is
          the bill itself rather than the valuation behind it, and it is the
          series that answers whether a revaluation actually cost you anything.
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={{ stroke: "#D8DED6" }}
              tick={{ fontFamily: "IBM Plex Mono", fontSize: 12, fill: "#5C6B60" }}
            />
            <YAxis
              tickFormatter={fmtUSDShort}
              tickLine={false}
              axisLine={false}
              width={62}
              tick={{ fontFamily: "IBM Plex Mono", fontSize: 12, fill: "#5C6B60" }}
            />
            <Tooltip
              formatter={(v) => [fmtUSD(v), "Estimated tax"]}
              labelFormatter={(y) => `Tax year ${y}`}
              contentStyle={{
                fontFamily: "IBM Plex Mono",
                fontSize: 13,
                border: "1px solid #D8DED6",
                background: "#FFFFFF",
              }}
            />
            <Line
              dataKey="est_tax"
              name="Estimated tax"
              stroke="#A3543F"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: "#A3543F" }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="chart-note">
          Gaps before 1998 are not a gap in this property's history. New
          Jersey's online records of the equalization ratio and the general tax
          rate begin in 1997, so estimated market value and estimated tax cannot
          be computed for the earlier years even though the assessments
          themselves go back to 1989. The earlier state tables exist in print
          but are not published online.
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
            2026 land value
            <input
              type="text"
              inputMode="numeric"
              value={proj.land}
              onChange={(e) => setProj((p) => ({ ...p, land: e.target.value }))}
              placeholder="450,000"
            />
          </label>
          <label>
            2026 improvement value
            <input
              type="text"
              inputMode="numeric"
              value={proj.improvement}
              onChange={(e) =>
                setProj((p) => ({ ...p, improvement: e.target.value }))
              }
              placeholder="800,000"
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
              <span className="figure-label">
                2026 assessed {fmtUSD(projAssessed)} · est. tax
              </span>
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

      <section className="chart-block">
        <h3>Could this assessment be appealed?</h3>
        <p className="chart-note chart-intro">
          New Jersey does not grant relief simply because an assessment exceeds
          market value. Under Chapter 123 an appeal only succeeds if the
          assessment falls outside a tolerance band around the town's average
          ratio — the law concedes that assessments are imprecise and
          deliberately set below market. This is a rough screen against that
          test, not advice, and not an appraisal.
        </p>

        <AppealScreen
          appeal={appeal}
          year={latestRow.year}
          ratioYear={ratioRow?.year}
          assessed={latestRow.total}
          ownEstimate={ownEstimate}
          setOwnEstimate={setOwnEstimate}
        />

        <p className="chart-note">
          <strong>What this can and cannot tell you.</strong> The market
          estimate is built from nearby sales, scaled onto this property using
          the assessor's own relative valuation of each pair. That leans on the
          assessor being roughly right about how properties compare to each
          other, even where the overall level is stale. It has no idea about
          floor area, condition, renovations, or which side of the street you
          are on — the MOD-IV extract carries no square footage. Two houses with
          identical assessments can be worth very different amounts, and only
          you know which yours is.
        </p>
        <p className="chart-note">
          <strong>2026 changes the picture.</strong> Chapter 123 does not apply
          in the year a town implements a revaluation, because assessments have
          just been reset to market and are judged directly against it. This
          screen runs on the pre-revaluation roll and is best read as
          background. For the 2027 tax year the corridor applies again, with a
          filing deadline of April 1 and the burden of proof on the owner.
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

function AppealScreen({ appeal, year, ratioYear, assessed, ownEstimate, setOwnEstimate }) {
  const est = (
    <label className="own-estimate">
      Your own estimate of market value
      <input
        type="text"
        inputMode="numeric"
        value={ownEstimate}
        onChange={(e) => setOwnEstimate(e.target.value)}
        placeholder="optional — overrides the comps"
      />
    </label>
  );

  if (appeal.status === "no_ratio") {
    return (
      <p className="chart-note">
        No equalization ratio is on file for any year, so the Chapter 123
        corridor cannot be drawn. Backfill rates.csv to enable this.
      </p>
    );
  }

  if (appeal.status === "no_comps") {
    return (
      <>
        <p className="chart-note">
          Not enough comparable sales near this property to estimate market
          value. You can enter your own figure — a recent appraisal, or what
          similar homes on your street have sold for.
        </p>
        {est}
      </>
    );
  }

  const { status, band, ratio, estimate, impliedAssessment, reduction, margin } =
    appeal;

  const verdict =
    status === "above"
      ? {
          tone: "flag",
          head: "Outside the corridor — worth investigating",
          body: `At this estimated value the assessment-to-sales ratio is ${ratio.toFixed(
            3
          )}, above the upper limit of ${band.upper.toFixed(
            3
          )}. If that value held up on appeal, the assessment would be reset to about ${fmtUSD(
            impliedAssessment
          )} — a reduction of ${fmtUSD(reduction)}.`,
        }
      : status === "below"
      ? {
          tone: "warn",
          head: "Below the corridor — an appeal could backfire",
          body: `The ratio of ${ratio.toFixed(
            3
          )} sits below the lower limit of ${band.lower.toFixed(
            3
          )}, which means this property looks under-assessed relative to the town. In this position a county board can raise the assessment rather than lower it.`,
        }
      : {
          tone: "ok",
          head: "Inside the corridor — no relief available",
          body: `The ratio of ${ratio.toFixed(
            3
          )} falls within the band of ${band.lower.toFixed(
            3
          )} to ${band.upper.toFixed(3)}, ${
            margin != null && margin < 0.15
              ? "though only just — a different market estimate could push it out either side"
              : "with room to spare"
          }. An appeal on these numbers would not succeed even if the assessment exceeds market value.`,
        };

  return (
    <>
      <div className={"appeal-verdict appeal-" + verdict.tone}>
        <span className="appeal-head">{verdict.head}</span>
        <span className="appeal-body">{verdict.body}</span>
      </div>

      <div className="appeal-grid">
        <Figure label={`Assessed ${year}`} value={fmtUSD(assessed)} sub="on the roll" />
        <Figure
          label="Estimated market value"
          value={fmtUSD(estimate)}
          sub={
            appeal.fromOverride
              ? "your figure"
              : `median of ${appeal.compCount} sales ${appeal.tier === "across the borough" ? appeal.tier : "on " + appeal.tier}`
          }
          accent
        />
        <Figure
          label="Assessment-to-sales ratio"
          value={ratio.toFixed(3)}
          sub={`corridor ${band.lower.toFixed(3)}–${band.upper.toFixed(3)}${
            ratioYear && ratioYear !== year ? ` (${ratioYear} ratio)` : ""
          }`}
        />
      </div>

      {est}

      {appeal.comps.length > 0 && !appeal.fromOverride && (
        <details className="comps">
          <summary>
            The {appeal.compCount} sales behind this estimate
          </summary>
          <table className="ledger">
            <thead>
              <tr>
                <th>Address</th>
                <th className="num">Sold</th>
                <th className="num">Price</th>
                <th className="num">Its assessment</th>
                <th className="num">Implies for yours</th>
              </tr>
            </thead>
            <tbody>
              {appeal.comps.map((c) => (
                <tr key={c.pin + c.year}>
                  <td>{titleCase(c.address || "—")}</td>
                  <td className="num">{c.year}</td>
                  <td className="num">{fmtUSD(c.price)}</td>
                  <td className="num">{fmtUSD(c.assessed)}</td>
                  <td className="num accent">{fmtUSD(c.implied)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="chart-note">
            Each sale price is scaled by the ratio of this property's assessment
            to that one's. The median of the last column is the estimate.
          </p>
        </details>
      )}
    </>
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
