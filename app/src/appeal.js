// Chapter 123 appeal screening.
//
// The whole difficulty here is estimating market value. It cannot come from
// dividing the assessment by the town equalization ratio: that is circular,
// since the resulting ratio would then equal the town ratio by construction
// and every property would land dead centre of the corridor. So the estimate
// is built from comparable sales instead.
//
// The method is the standard assessment-adjusted comparison. For each nearby
// sale, the assessor's own relative valuation of the two properties is used
// to scale the comp's sale price onto the subject:
//
//     implied value = comp sale price x (subject assessed / comp assessed)
//
// This leans on the assessor being roughly right about RELATIVE value between
// neighbouring properties even when the overall LEVEL is stale, which is what
// a ratio study measures separately. It is a screen, not an appraisal.

// Ranked search: same block first, then progressively wider, stopping as soon
// as a tier yields enough comps. Assessment similarity filters out the
// mansion three doors down from a modest cape.
const TIERS = [
  { label: "the same block", blockRadius: 0, spread: 0.4 },
  { label: "adjacent blocks", blockRadius: 3, spread: 0.4 },
  { label: "nearby blocks", blockRadius: 12, spread: 0.35 },
  { label: "across the borough", blockRadius: Infinity, spread: 0.3 },
];

const MIN_COMPS = 3;

export function findComps(subject, comps) {
  if (!subject?.assessed || !comps?.length) return null;
  const subjBlock = Number(subject.block);

  for (const tier of TIERS) {
    const pool = comps.filter((c) => {
      if (c.pin === subject.pin) return false;
      if (!c.assessed || !c.price) return false;
      const blockDist = Math.abs(Number(c.block) - subjBlock);
      if (!(blockDist <= tier.blockRadius)) return false;
      const rel = c.assessed / subject.assessed;
      return rel >= 1 - tier.spread && rel <= 1 + tier.spread;
    });
    if (pool.length >= MIN_COMPS) {
      return {
        tier: tier.label,
        comps: pool
          .map((c) => ({
            ...c,
            implied: Math.round(c.price * (subject.assessed / c.assessed)),
          }))
          .sort((a, b) => b.year - a.year || a.implied - b.implied),
      };
    }
  }
  return null;
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Chapter 123: the corridor is the average ratio plus or minus 15% OF ITSELF,
// with the upper limit capped at 1.00 — an assessment above full market value
// gets relief regardless of where the arithmetic lands.
export function corridor(avgRatio) {
  if (!avgRatio) return null;
  return {
    ratio: avgRatio,
    lower: avgRatio * 0.85,
    upper: Math.min(avgRatio * 1.15, 1.0),
  };
}

export function screen({ subject, comps, avgRatio, overrideValue }) {
  const band = corridor(avgRatio);
  if (!band) return { status: "no_ratio" };

  const found = overrideValue ? null : findComps(subject, comps);
  const estimate = overrideValue || (found ? median(found.comps.map((c) => c.implied)) : null);
  if (!estimate) return { status: "no_comps", band };

  const ratio = subject.assessed / estimate;

  // Where the assessment would land if an appeal succeeded: proven market
  // value multiplied by the average ratio, not reduced to the average ratio's
  // own arithmetic. Only meaningful above the upper limit.
  const impliedAssessment = Math.round(estimate * avgRatio);

  let status;
  if (ratio > band.upper) status = "above";
  else if (ratio < band.lower) status = "below";
  else status = "inside";

  // Distance to the nearest edge, as a share of the corridor width, for
  // conveying "comfortably inside" versus "a hair from the line".
  const width = band.upper - band.lower;
  const margin =
    status === "inside"
      ? Math.min(band.upper - ratio, ratio - band.lower) / width
      : null;

  return {
    status,
    band,
    ratio,
    estimate,
    impliedAssessment,
    reduction: status === "above" ? subject.assessed - impliedAssessment : 0,
    margin,
    tier: found?.tier,
    comps: found?.comps.slice(0, 8) || [],
    compCount: found?.comps.length || 0,
    fromOverride: Boolean(overrideValue),
  };
}
