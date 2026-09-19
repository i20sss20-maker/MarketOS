export type CommandPaletteDescriptor = {
  id: string;
  group: string;
  label: string;
  description?: string;
  keywords?: string[];
  shortcut?: string;
  badge?: string;
  priority?: number;
};

export function normalizeCommandText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function scoreField(
  haystack: string,
  needle: string,
  weight: number,
) {
  if (!haystack || !needle) return 0;
  if (haystack === needle) return 100 * weight;
  if (haystack.startsWith(needle)) return 70 * weight;
  if (haystack.includes(needle)) return 45 * weight;

  const tokens = needle.split(" ").filter(Boolean);
  if (
    tokens.length > 1 &&
    tokens.every((token) => haystack.includes(token))
  ) {
    return 30 * weight;
  }

  return 0;
}

export function rankCommandEntries<T extends CommandPaletteDescriptor>(
  entries: T[],
  query: string,
  limit = 14,
): T[] {
  const normalizedQuery = normalizeCommandText(query);
  const bounded = Math.max(1, Math.min(50, Math.floor(limit)));

  if (!normalizedQuery) {
    return [...entries]
      .sort(
        (a, b) =>
          (b.priority ?? 0) - (a.priority ?? 0) ||
          a.group.localeCompare(b.group) ||
          a.label.localeCompare(b.label),
      )
      .slice(0, bounded);
  }

  return entries
    .map((entry) => {
      const label = normalizeCommandText(entry.label);
      const description = normalizeCommandText(entry.description ?? "");
      const group = normalizeCommandText(entry.group);
      const keywords = normalizeCommandText((entry.keywords ?? []).join(" "));

      const score = Math.max(
        scoreField(label, normalizedQuery, 1),
        scoreField(keywords, normalizedQuery, 0.82),
        scoreField(description, normalizedQuery, 0.58),
        scoreField(group, normalizedQuery, 0.46),
      ) + (entry.priority ?? 0) * 0.01;

      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.entry.priority ?? 0) - (a.entry.priority ?? 0) ||
        a.entry.label.localeCompare(b.entry.label),
    )
    .slice(0, bounded)
    .map((item) => item.entry);
}
