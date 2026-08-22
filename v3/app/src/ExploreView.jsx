import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { CLASS_NAMES, fmtUSD, fmtUSDShort } from "./data.js";

const GOLD = "#C9972C";
const SPRUCE = "#22352C";
const SPAGHETTI = ["#6B7F5C", "#A3543F", "#7A94A8", "#8A6512", "#5C4A72", "#3E6B6B", "#A8788C", "#57703F"];

export default function ExploreView({ db, state, setState }) {
  const [query, setQuery] = useState("");
  const [klass, setKlass] = useState("2");
  const selected = state.pins;

  const classOptions = useMemo(() => {
    const s = new Set(db.parcels.map((p) => p.prop_class));
    return [...s].sort();
  }, [db]);

  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    return db.parcels
      .filter((p) => (klass === "all" ? true : p.prop_class === klass))
      .filter(
        (p) =>
          !q ||
          p.address.toUpperCase().includes(q) ||
          `${p.block}/${p.lot}${p.qual ? "/" + p.qual : ""}`.includes(q) ||
          p.block === q
      )
      .slice(0, 200);
  }, [db, query, klass]);

  const toggle = (pin) =>
    setState((s) => ({
      ...s,
      pins: s.pins.includes(pin)
        ? s.pins.filter((x) => x !== pin)
        : [...s.pins, pin],
    }));
  const addShown = () =>
    setState((s) => ({
      ...s,
      pins: [...new Set([...s.pins, ...shown.map((p) => p.pin)])],
    }));
  const clear = () => setState((s) => ({ ...s, pins: [] }));

  const group = selected.map((pin) => db.byPin.get(pin)).filter(Boolean);

  const chartRows = useMemo(() => {
    if (!group.length) return [];
    const years = [...new Set(group.flatMap((p) => p.years.map((y) => y.year)))].sort();
    return years.map((year) => {
      const vals = [];
      const row = { year };
      for (const p of group) {
        const y = p.years.find((v) => v.year === year);
        if (!y) continue;
        const town = db.townByYear.get(year) || {};
        const v =
          state.eq && town.equalization_ratio
            ? Math.round(y.total / town.equalization_ratio)
            : y.total;
        vals.push(v);
        if (group.length <= 8) row[p.pin] = v;
      }
      vals.sort((a, b) => a - b);
      row.n = vals.length;
      row.sum = vals.reduce((s, v) => s + v, 0);
      row.median = vals.length
        ? vals.length % 2
          ? vals[(vals.length - 1) / 2]
          : Math.round((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2)
        : null;
      return row;
    });
  }, [group, state.eq, db]);

  const agg = state.agg;
  const incomplete = chartRows.some((r) => r.n !== group.length);

  return (
    <article>
      <section className="explore-controls">
        <input
          className="search"
          type="search"
          placeholder="Street name or block (e.g. RIDGEWOOD or 47)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter properties"
        />
        <select
          className="search select"
          value={klass}
          onChange={(e) => setKlass(e.target.value)}
          aria-label="Property class"
        >
          <option value="all">All classes</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>
              {CLASS_NAMES[c] || c}
            </option>
          ))}
        </select>
        <button className="btn" onClick={addShown}>
          Add all shown
        </button>
        {selected.length > 0 && (
          <button className="btn btn-quiet" onClick={clear}>
            Clear group
          </button>
        )}
      </section>

      {group.length > 0 && (
        <section className="chart-block">
          <div className="chart-head">
            <h3>
              Group of {group.length}{" "}
              {group.length === 1 ? "property" : "properties"}
            </h3>
            <div className="chart-toggles">
              <label className="toggle">
                <input
                  type="radio"
                  name="agg"
                  checked={agg === "sum"}
                  onChange={() => setState((s) => ({ ...s, agg: "sum" }))}
                />
                <span>Sum</span>
              </label>
              <label className="toggle">
                <input
                  type="radio"
                  name="agg"
                  checked={agg === "median"}
                  onChange={() => setState((s) => ({ ...s, agg: "median" }))}
                />
                <span>Median</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={state.eq}
                  onChange={() => setState((s) => ({ ...s, eq: !s.eq }))}
                />
                <span>Market value</span>
              </label>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={chartRows}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            >
              <XAxis
                dataKey="year"
                tickLine={false}
                axisLine={{ stroke: "#D8DED6" }}
                tick={{ fontFamily: "IBM Plex Mono", fontSize: 12, fill: SPRUCE }}
              />
              <YAxis
                tickFormatter={fmtUSDShort}
                tickLine={false}
                axisLine={false}
                width={54}
                tick={{ fontFamily: "IBM Plex Mono", fontSize: 12, fill: "#5C6B60" }}
              />
              <Tooltip
                formatter={(v, name) => [fmtUSD(v), tooltipName(name, db)]}
                labelFormatter={(y) => `Tax year ${y}`}
                contentStyle={{
                  fontFamily: "IBM Plex Mono",
                  fontSize: 13,
                  border: "1px solid #D8DED6",
                  background: "#FFFFFF",
                }}
              />
              {group.length <= 8 &&
                group.map((p, i) => (
                  <Line
                    key={p.pin}
                    dataKey={p.pin}
                    name={p.pin}
                    stroke={SPAGHETTI[i % SPAGHETTI.length]}
                    strokeWidth={1.25}
                    strokeOpacity={0.55}
                    dot={false}
                    connectNulls
                    legendType="none"
                  />
                ))}
              <Line
                dataKey={agg}
                name={agg === "sum" ? "Group total" : "Group median"}
                stroke={GOLD}
                strokeWidth={3}
                dot={{ r: 4, fill: GOLD }}
                connectNulls
              />
              <Legend
                wrapperStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13 }}
                iconType="square"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="chart-note">
            {state.eq
              ? "Estimated market value: each year's assessment divided by that year's equalization ratio. "
              : "Total assessed value (land + improvements). "}
            {group.length <= 8 &&
              "Thin lines are the individual properties; the gold line is the group. "}
            {incomplete &&
              "Some properties are missing years, so the sum can dip where the group is incomplete — the median is steadier there."}
          </p>
        </section>
      )}
      {group.length === 0 && (
        <div className="record-empty">
          <p>
            Filter to a street or block, then check properties (or use "Add all
            shown") to chart them as a group. The group is saved in the page
            address, so the chart can be shared as a link.
          </p>
        </div>
      )}

      <section>
        <h3>
          Properties{" "}
          <span className="count">
            ({shown.length}
            {shown.length === 200 ? "+, showing first 200" : ""})
          </span>
        </h3>
        <table className="ledger">
          <thead>
            <tr>
              <th className="check-col" aria-label="Select"></th>
              <th>Address</th>
              <th>Block/Lot</th>
              <th className="num">Latest assessed</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const last = p.years[p.years.length - 1];
              return (
                <tr key={p.pin}>
                  <td className="check-col">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.pin)}
                      onChange={() => toggle(p.pin)}
                      aria-label={`Include ${p.address}`}
                    />
                  </td>
                  <td>{p.address}</td>
                  <td className="mono">
                    {p.block}/{p.lot}
                    {p.qual ? "/" + p.qual : ""}
                  </td>
                  <td className="num">{fmtUSD(last.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </article>
  );
}

function tooltipName(name, db) {
  const p = db.byPin.get(name);
  return p ? p.address : name;
}
