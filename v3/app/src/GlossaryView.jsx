import { useMemo, useState } from "react";

// Definitions are written for someone reading their own tax bill, not for an
// assessor. Where a term appears on a chart in this app, the entry says so.
const GROUPS = [
  {
    id: "assessment",
    title: "On your assessment",
    terms: [
      [
        "Assessed value",
        "The value the borough assessor puts on your property for tax purposes. In New Jersey this is usually well below what the property would sell for, and it stays fixed between revaluations even as the market moves.",
      ],
      [
        "Land value and improvement value",
        "The two halves of an assessment: the lot itself, and everything built on it. They add up to the total assessed value. When land is worth more than the structure, the property is often a teardown candidate.",
      ],
      [
        "Net taxable value",
        "Assessed value minus any exemptions or deductions. This is the figure the tax rate is actually applied to, so it is the number that produces your bill.",
      ],
      [
        "Deduction",
        "A fixed reduction in the taxable value for qualifying owners — most commonly veterans, senior citizens, and disabled persons. Deductions come off the assessment before the rate is applied.",
      ],
      [
        "Property class",
        "The category the assessor files a parcel under: vacant land, residential, commercial, industrial, apartment, or one of several exempt classes. Glen Ridge is overwhelmingly class 2, residential.",
      ],
      [
        "Block, lot, and qualifier",
        "The three-part identifier for every parcel in New Jersey. The qualifier distinguishes units within a single lot, such as condominiums. Together they form the parcel ID used throughout this site.",
      ],
    ],
  },
  {
    id: "bill",
    title: "How the bill is set",
    terms: [
      [
        "Levy",
        "The total dollars a government body needs to raise from property tax. It is set by the budget, not by assessments. The borough, school district, and county each set their own, and the sum is what the town must collect.",
      ],
      [
        "Ratables",
        "The sum of every taxable parcel's net taxable value. The levy is spread across this base.",
      ],
      [
        "General tax rate",
        "The levy divided by ratables, expressed per $100 of assessed value. When a revaluation raises everyone's assessment, the rate falls even though the levy keeps growing — which is why a falling rate does not mean a falling bill.",
      ],
      [
        "Equalization ratio",
        "The state's estimate of what fraction of true market value the town's assessments represent. Certified each October. If the ratio is 0.64, the roll is assessing at about 64% of market. Shown as the dashed line on the assessment level chart.",
      ],
      [
        "Equalized value",
        "Assessed value divided by the equalization ratio — roughly what the property is worth on the open market. This is the number most people recognize.",
      ],
      [
        "Equalized tax rate",
        "The general tax rate adjusted by the equalization ratio. Comparing raw tax rates between towns is meaningless because each town assesses at a different level; comparing equalized rates is not.",
      ],
      [
        "Revaluation",
        "A town-wide reset of every assessment to current market value. It raises no additional money on its own — the levy is unchanged — but it moves the burden between properties. Some bills go up, others down.",
      ],
      [
        "2% levy cap",
        "A state limit, effective 2011, on how much a local government can increase its levy year over year. Pension costs, health benefits, and debt service sit outside the cap, so actual growth often exceeds 2%.",
      ],
      [
        "Exempt property",
        "Parcels off the tax roll entirely: schools, churches, municipal land, and certain nonprofits. Their value still exists, but the levy is spread across everyone else.",
      ],
    ],
  },
  {
    id: "fairness",
    title: "Measuring fairness",
    terms: [
      [
        "Sales ratio",
        "A single property's assessed value divided by what it actually sold for. Every measure on the fairness page is built from these.",
      ],
      [
        "Ratio study",
        "An analysis of many sales ratios at once, used to judge whether a town's assessments are accurate and consistent. The state runs one every year; this site runs its own.",
      ],
      [
        "Arm's-length sale",
        "A sale between unrelated parties at market terms. Only these count in a ratio study. Transfers between family members, sheriff's sales, and estate settlements are excluded.",
      ],
      [
        "Non-usable code",
        "The state's marker for a sale that should be left out of a ratio study, and the reason why. Roughly one sale in six in Glen Ridge carries one.",
      ],
      [
        "Horizontal equity",
        "Whether similar properties are assessed similarly. Two identical houses on the same street should carry the same assessment.",
      ],
      [
        "Vertical equity",
        "Whether the assessment level is independent of price. A $500,000 house and a $2,000,000 house should be assessed at the same fraction of what each is worth.",
      ],
      [
        "COD (coefficient of dispersion)",
        "How far a typical property's ratio sits from the town median, as a percentage. Lower means more uniform. Under 15 is the accepted standard for older, varied housing stock like Glen Ridge's.",
      ],
      [
        "PRD (price-related differential)",
        "One measure of vertical equity, comparing the average ratio against a value-weighted average. Above 1.0 suggests cheaper homes are assessed at a higher share of market value. It is insensitive at small magnitudes, which is why this site leads with PRB.",
      ],
      [
        "PRB (price-related bias)",
        "The change in assessment level each time property value doubles. A negative number means the assessment level falls as prices rise — that is regressivity. The accepted range is −0.05 to 0.05.",
      ],
      [
        "Regressive assessment",
        "When less expensive homes are assessed closer to their true market value than expensive ones. The nominal tax rate is identical for everyone, but the effective rate is not.",
      ],
      [
        "Sales chasing",
        "Reassessing a property to its sale price while leaving comparable unsold properties alone. It makes a town's ratio study look excellent while the rest of the roll drifts, because the study only examines properties that sold.",
      ],
      [
        "Confidence interval",
        "The range the true value plausibly falls in, given how few sales a small town produces in a year. When an interval crosses a standard, the data cannot settle the question either way.",
      ],
    ],
  },
  {
    id: "appeals",
    title: "Appealing an assessment",
    terms: [
      [
        "Chapter 123",
        "The 1973 law setting the test an assessment appeal must pass. It concedes that assessments are imprecise and deliberately set below market, and grants relief only outside a tolerance band.",
      ],
      [
        "Common level range",
        "That tolerance band: the town's average ratio, plus or minus 15% of itself. Prove your ratio falls above it and the assessment is reduced. Fall below it and the county board can raise your assessment instead.",
      ],
      [
        "Filing deadline",
        "April 1 in a normal year, extended to May 1 in a year the town implements a revaluation. Appeals go to the Essex County Board of Taxation; assessments above $1 million may go directly to the state Tax Court.",
      ],
      [
        "Burden of proof",
        "The owner's, not the assessor's. You must establish what the property is actually worth, usually with recent comparable sales or an appraisal. Taxes also have to be current or the appeal can be dismissed.",
      ],
    ],
  },
  {
    id: "sources",
    title: "Where the numbers come from",
    terms: [
      [
        "MOD-IV",
        "New Jersey's standardized annual extract of every municipal tax list. One certified snapshot per town per year. Every assessment figure on this site comes from it.",
      ],
      [
        "Abstract of Ratables",
        "The county's yearly published summary of assessed values and levies by municipality. Used here to cross-check the totals computed from MOD-IV.",
      ],
      [
        "IAAO",
        "The International Association of Assessing Officers, the professional body that writes the standards assessors and state agencies work to. Its published thresholds are the benchmarks shown on the fairness charts.",
      ],
      [
        "Daniel's Law",
        "New Jersey law requiring certain personal information, including owner names, to be withheld from public property records. This site shows addresses and assessments, never owners.",
      ],
    ],
  },
];

export default function GlossaryView() {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      terms: g.terms.filter(
        ([term, def]) =>
          term.toLowerCase().includes(needle) ||
          def.toLowerCase().includes(needle)
      ),
    })).filter((g) => g.terms.length);
  }, [q]);

  const count = filtered.reduce((n, g) => n + g.terms.length, 0);

  return (
    <article className="glossary">
      <div className="glossary-head">
        <p className="glossary-intro">
          Property tax has a vocabulary of its own, and most of it appears on
          your assessment notice without explanation. These are the terms used
          throughout this site.
        </p>
        <label className="search-label" htmlFor="glossary-search">
          Find a term
        </label>
        <input
          id="glossary-search"
          className="search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ratio, levy, appeal…"
          autoComplete="off"
        />
      </div>

      {count === 0 ? (
        <p className="chart-note">
          Nothing matches “{q}”. Try a shorter word, or clear the box to see
          every term.
        </p>
      ) : (
        filtered.map((g) => (
          <section key={g.id} className="glossary-group">
            <h3>{g.title}</h3>
            <dl className="glossary-list">
              {g.terms.map(([term, def]) => (
                <div key={term} className="glossary-entry">
                  <dt>{term}</dt>
                  <dd>{def}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}
    </article>
  );
}
