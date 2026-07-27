import type { ScoringWeights } from "./api";

const WEIGHT_KEYS: (keyof ScoringWeights)[] = [
  "dense",
  "bm25",
  "tfidf",
  "keyword",
  "positional_skill",
  "experience_skill",
  "resume_quality",
];

export function rebalanceWeights(
  weights: ScoringWeights,
  changedKey: keyof ScoringWeights,
  requestedPercent: number,
): ScoringWeights {
  const changedPercent = Math.min(100, Math.max(0, Math.round(requestedPercent)));
  const remainingPercent = 100 - changedPercent;
  const otherKeys = WEIGHT_KEYS.filter((key) => key !== changedKey);
  const currentOtherTotal = otherKeys.reduce(
    (sum, key) => sum + Math.max(0, weights[key] * 100),
    0,
  );

  const idealPercentages = otherKeys.map((key) =>
    currentOtherTotal > 0
      ? (Math.max(0, weights[key] * 100) / currentOtherTotal) * remainingPercent
      : remainingPercent / otherKeys.length,
  );
  const wholePercentages = idealPercentages.map(Math.floor);
  let pointsLeft =
    remainingPercent - wholePercentages.reduce((sum, percentage) => sum + percentage, 0);

  const remainderOrder = idealPercentages
    .map((percentage, index) => ({ index, remainder: percentage - wholePercentages[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of remainderOrder) {
    if (pointsLeft <= 0) break;
    wholePercentages[index] += 1;
    pointsLeft -= 1;
  }

  const balanced = { ...weights, [changedKey]: changedPercent / 100 };
  otherKeys.forEach((key, index) => {
    balanced[key] = wholePercentages[index] / 100;
  });
  return balanced;
}
