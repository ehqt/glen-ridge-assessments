import { useEffect, useMemo, useState } from "react";
import { loadBundle, readUrlState, writeUrlState, CLASS_NAMES } from "./data.js";
import ParcelView from "./ParcelView.jsx";
import TownView from "./TownView.jsx";
import ExploreView from "./ExploreView.jsx";
import FairnessView from "./FairnessView.jsx";
import GlossaryView from "./GlossaryView.jsx";
import AboutView from "./AboutView.jsx";

export default function App() {
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState(readUrlState());

  useEffect(() => {
    loadBundle().then(setDb).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    writeUrlState(state);
  }, [state]);

  const results = useMemo(() => {
    if (!db) return [];
    const q = query.trim().toUpperCase();
    if (!q) return db.parcels.slice(0, 40);
    return db.parcels
      .filter(
        (p) =>
          p.address.toUpperCase().includes(q) ||
          `${p.block}/${p.lot}${p.qual ? "/" + p.qual : ""}`.includes(q)
      )
      .slice(0, 60);
  }, [db, query]);

  const selected = db && state.pin ? db.byPin.get(state.pin) : null;

  if (error)
    return (
      <div className="load-msg">
        <p>Could not load the assessment data. {error}</p>
      </div>
    );
  if (!db) return <div className="load-msg"><p>Loading the tax list…</p></div>;

  return (
    <div className="shell">
      <header className="masthead">
        <h1>{db.municipality} Assessments</h1>
        <p className="masthead-sub">
          Property assessment history from the certified MOD-IV tax lists
        </p>
        <nav className="nav">
          <button
            className={"nav-tab" + (state.view === "about" ? " nav-active" : "")}
            onClick={() => setState((s) => ({ ...s, view: "about" }))}
          >
            About
          </button>
          <button
            className={"nav-tab" + (state.view === "town" ? " nav-active" : "")}
            onClick={() => setState((s) => ({ ...s, view: "town" }))}
          >
            The town
          </button>
          <button
            className={"nav-tab" + (state.view === "parcel" ? " nav-active" : "")}
            onClick={() => setState((s) => ({ ...s, view: "parcel" }))}
          >
            One property
          </button>
          <button
            className={"nav-tab" + (state.view === "explore" ? " nav-active" : "")}
            onClick={() => setState((s) => ({ ...s, view: "explore" }))}
          >
            A group
          </button>
          <button
            className={"nav-tab" + (state.view === "fairness" ? " nav-active" : "")}
            onClick={() => setState((s) => ({ ...s, view: "fairness" }))}
          >
            Is it fair?
          </button>
          <button
            className={"nav-tab" + (state.view === "glossary" ? " nav-active" : "")}
            onClick={() => setState((s) => ({ ...s, view: "glossary" }))}
          >
            Glossary
          </button>
        </nav>
      </header>

      {state.view === "town" ? (
        <main className="town">
          <TownView
            townSeries={db.townSeries}
            exemptBreakdown={db.exemptBreakdown}
            municipality={db.municipality}
          />
        </main>
      ) : state.view === "explore" ? (
        <main className="town">
          <ExploreView db={db} state={state} setState={setState} />
        </main>
      ) : state.view === "fairness" ? (
        <main className="town">
          <FairnessView ratioStudy={db.ratioStudy} />
        </main>
      ) : state.view === "glossary" ? (
        <main className="town">
          <GlossaryView />
        </main>
      ) : state.view === "about" ? (
        <main className="town">
          <AboutView />
        </main>
      ) : (
      <div className="columns">
        <aside className="rail">
          <label className="search-label" htmlFor="search">
            Find a property
          </label>
          <input
            id="search"
            className="search"
            type="search"
            placeholder="Address or block/lot"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <ul className="results">
            {results.map((p) => (
              <li key={p.pin}>
                <button
                  className={
                    "result" + (state.pin === p.pin ? " result-active" : "")
                  }
                  onClick={() => setState((s) => ({ ...s, pin: p.pin, view: "parcel" }))}
                >
                  <span className="result-addr">{p.address}</span>
                  <span className="result-meta">
                    {p.block}/{p.lot}
                    {p.qual ? "/" + p.qual : ""} ·{" "}
                    {CLASS_NAMES[p.prop_class] || p.prop_class}
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="result-empty">
                No properties match. Try a street name or a block/lot like
                47/12.
              </li>
            )}
          </ul>
        </aside>

        <main className="record">
          {selected ? (
            <ParcelView
              parcel={selected}
              townByYear={db.townByYear}
              comps={db.ratioStudy?.comps || []}
              eq={state.eq}
              onToggleEq={() => setState((s) => ({ ...s, eq: !s.eq }))}
            />
          ) : (
            <div className="record-empty">
              <p>
                Search for an address on the left to open its assessment
                record.
              </p>
            </div>
          )}
        </main>
      </div>
      )}

      <footer className="colophon">
        Sources: Rutgers N.J. MOD-IV Historical Database; N.J. DCA Property Tax
        Tables. Assessment years {db.townSeries[0].year}–
        {db.townSeries[db.townSeries.length - 1].year}. Not an official record.
      </footer>
    </div>
  );
}
