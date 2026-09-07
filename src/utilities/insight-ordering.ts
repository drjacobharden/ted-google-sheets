export interface RankedInsight {
  id: string;
  group: string;
  score: number;
}

interface DiversityOptions {
  scoreWindow?: number;
  lookback?: number;
}

function familyKey(insight: RankedInsight): string {
  const [namespace, family] = insight.id.split(":");
  return family ? `${namespace}:${family}` : `${insight.group}:${insight.id}`;
}

function baseCompare<T extends RankedInsight>(
  left: T,
  right: T,
  groupOrder: Readonly<Record<string, number>>,
): number {
  return (
    right.score - left.score ||
    (groupOrder[left.group] ?? 99) - (groupOrder[right.group] ?? 99) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Keeps score as the primary ordering signal while spacing repeated detector
 * families and groups whenever a similarly strong alternative is available.
 * Nothing is removed; diversity only decides which qualifying insight comes
 * next in the sequence.
 */
export function sortInsightsWithDiversity<T extends RankedInsight>(
  candidates: readonly T[],
  groupOrder: Readonly<Record<string, number>>,
  options: DiversityOptions = {},
): T[] {
  const scoreWindow = options.scoreWindow ?? 0.2;
  const lookback = Math.max(1, options.lookback ?? 2);
  const remaining = [...candidates].sort((left, right) => baseCompare(left, right, groupOrder));
  const ordered: T[] = [];

  while (remaining.length) {
    const strongestScore = remaining[0]!.score;
    const similarlyStrong = remaining.filter(
      (item) => item.score >= strongestScore - scoreWindow,
    );
    const recent = ordered.slice(-lookback);
    const recentFamilies = new Set(recent.map(familyKey));
    const recentGroups = new Set(recent.map((item) => item.group));
    const diverse = similarlyStrong.filter(
      (item) => !recentFamilies.has(familyKey(item)) && !recentGroups.has(item.group),
    );
    const familyDiverse = similarlyStrong.filter(
      (item) => !recentFamilies.has(familyKey(item)),
    );
    const pool = diverse.length ? diverse : familyDiverse.length ? familyDiverse : similarlyStrong;
    pool.sort((left, right) => baseCompare(left, right, groupOrder));
    const selected = pool[0] ?? remaining[0]!;
    const selectedIndex = remaining.indexOf(selected);
    remaining.splice(selectedIndex, 1);
    ordered.push(selected);
  }

  return ordered;
}

