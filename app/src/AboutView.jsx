const SOURCES = [
  {
    name: "N.J. MOD-IV Historical Database",
    who: "Rutgers, Bloustein School — Center for Urban Policy Research",
    url: "https://modiv.rutgers.edu/",
    what:
      "Every assessment on this site. MOD-IV is the standardised annual extract of each municipality's certified tax list, and Rutgers maintains a searchable archive going back more than thirty years. The Glen Ridge extract used here covers 1989 through 2025 — about 88,000 parcel-year records — and carries land and improvement values, property class, deductions, and the most recent sale for each parcel.",
  },
  {
    name: "Property Tax Tables",
    who: "N.J. Department of Community Affairs, Division of Local Government Services",
    url: "https://www.nj.gov/dca/dlgs/resources/Property_Tax_info.shtml",
    what:
      "Annual workbooks with each municipality's tax levy, split between school, county, and municipal purposes, plus the general tax rate and net valuation taxable. These are the source for the levy charts.",
  },
  {
    name: "Statistical Information — Director's Ratio History, General Tax Rates",
    who: "N.J. Department of the Treasury, Division of Taxation",
    url: "https://nj.gov/treasury/taxation/lpt/statdata.shtml",
    what:
      "The equalization ratio (also called the Director's Ratio) that converts assessed values to estimated market values, and the certified general and effective tax rates. The same page publishes the Chapter 123 common level ranges, the state's own coefficients of deviation, and the raw SR1A sales files.",
  },
  {
    name: "Standard on Ratio Studies",
    who: "International Association of Assessing Officers",
    url: "https://www.iaao.org/",
    what:
      "The methodology behind the fairness page, and the source of the thresholds shown there. The statistics computed here — COD, PRD, PRB — and their acceptable ranges are defined by this standard, which state oversight agencies also work to.",
  },
];

const QUESTIONS = [
  "How often do home assessments actually happen?",
  "How big is the typical increase in assessed value?",
  "How much does the tax rate change?",
  "How much does the total tax on my house typically change?",
  "How does the total tax levy for Glen Ridge change over time?",
];

export default function AboutView() {
  return (
    <article className="prose about">
      <h2>About this site</h2>

      <p>
        After our home was reassessed this year, I went looking for answers to a
        few basic questions and could not find them anywhere in one place:
      </p>
      <ul className="about-questions">
        {QUESTIONS.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <p>
        Every one of these is answerable from public records. The assessments
        are published, the levies are published, and the state's own valuation
        figures are published. They are simply spread across three agencies, in
        formats that change from decade to decade, and nobody had put them
        together for one small borough. So this site does that.
      </p>

      <h3 className="prose-sub">What is here</h3>
      <dl className="about-list">
        <div>
          <dt>The town</dt>
          <dd>
            Where the tax levy goes, split between the school district, the
            county, and the borough, with the general tax rate over the same
            period. Alongside it, the tax base those dollars are raised on —
            total assessed ratables against the estimated market value of the
            same properties — and what sits off the rolls entirely.
          </dd>
        </div>
        <div>
          <dt>One property</dt>
          <dd>
            The full assessment history of any parcel in the borough: land and
            improvement values year by year, the estimated market value implied
            by each year's equalization ratio, and the estimated tax. There is
            a box for entering a 2026 assessment from your notice, and a rough
            Chapter 123 screen that checks whether an assessment looks
            appealable.
          </dd>
        </div>
        <div>
          <dt>A group</dt>
          <dd>
            The same history for a set of properties at once, for comparing a
            street, a block, or a handful of similar homes.
          </dd>
        </div>
        <div>
          <dt>Is it fair?</dt>
          <dd>
            The question underneath all of this. Everyone pays the same rate,
            but not everyone is assessed at the same share of what their home is
            worth. This page measures that using the same statistics the state
            uses to police assessment quality.
          </dd>
        </div>
        <div>
          <dt>Glossary</dt>
          <dd>
            Property tax has a vocabulary of its own, most of which appears on
            an assessment notice without explanation.
          </dd>
        </div>
      </dl>

      <h3 className="prose-sub">How it works</h3>
      <p>
        A Python pipeline reads the raw MOD-IV extract and the state rate
        tables, checks them against each other, and writes a single compressed
        file. Everything you see is computed from that file in your browser.
        There is no server, no account, and no tracking — the site is a static
        page and a data file.
      </p>
      <p>
        Estimated market value is each year's assessment divided by that year's
        state equalization ratio. It is an arithmetic conversion applied
        uniformly to the whole town, not an appraisal of any individual
        property.
      </p>
      <p>
        The fairness statistics come from pairing every arm's-length sale in the
        borough with the assessment that property carried at the moment it sold.
        Sales the state marks as non-usable — transfers between family members,
        sheriff's sales, estate settlements — are excluded, since their prices
        do not reflect the market. Ratios far outside the normal range are
        trimmed, and any year with fewer than thirty usable sales is either
        pooled with neighbouring years or withheld. Because a town this size
        produces only sixty to a hundred usable sales a year, confidence
        intervals are shown alongside every figure, and where an interval
        crosses a standard the site says the data cannot settle the question
        rather than picking a side.
      </p>

      <h3 className="prose-sub">Where the data comes from</h3>
      <dl className="about-list">
        {SOURCES.map((s) => (
          <div key={s.name}>
            <dt>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
              <span className="about-who">{s.who}</span>
            </dt>
            <dd>{s.what}</dd>
          </div>
        ))}
      </dl>

      <h3 className="prose-sub">Limitations worth knowing</h3>
      <p>
        The state's online record of equalization ratios and tax rates begins in
        1997. Assessments go back to 1989, so estimated market value and
        estimated tax are blank for the earliest years — the gap is in the
        public record, not in the pipeline. The earlier tables exist in print
        and could be requested, but they are not online.
      </p>
      <p>
        MOD-IV carries no floor area, so nothing here can adjust for the size or
        condition of a house. Two properties with identical assessments may be
        worth very different amounts. The comparable-sales estimate behind the
        appeal screen leans on the assessor being roughly right about how
        neighbouring properties compare to each other, which is a reasonable
        assumption in aggregate and an unreliable one for any single house.
      </p>
      <p>
        Owner names are never shown. New Jersey's Daniel's Law requires certain
        personal information to be withheld from public property records, and
        this site displays addresses and assessments only.
      </p>
      <p className="about-disclaimer">
        This is an independent project, not affiliated with Glen Ridge Borough,
        Essex County, or the State of New Jersey, and not an official record.
        Nothing here is legal or tax advice. For anything that matters, check
        the borough assessor's office or the Essex County Board of Taxation.
      </p>
    </article>
  );
}
