import type { AssetClass, MarketOverviewItem } from "@marketos/market-core";

export type ScreenerSortField = "change" | "volume" | "price";
export type ScreenerSortDirection = "asc" | "desc";

export type SmartScreenerRule = {
  assetClasses?: AssetClass[];
  minChangePercent?: number;
  maxChangePercent?: number;
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  maxVolume?: number;
  sortBy?: ScreenerSortField;
  sortDirection?: ScreenerSortDirection;
  limit?: number;
};

export type SmartScreenerParseResult = {
  rule: SmartScreenerRule;
  recognized: string[];
  ignored: string[];
  summary: string;
};

const arabicDigits: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

function normalizeDigits(value: string) {
  return value.replace(/[٠-٩]/g, (digit) => arabicDigits[digit] ?? digit);
}

function normalizeText(value: string) {
  return normalizeDigits(value)
    .toLowerCase()
    .replace(/[٪]/g, "%")
    .replace(/[،]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCompactNumber(raw: string): number | undefined {
  const normalized = raw.trim().toLowerCase().replace(/,/g, "");
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([kmb])?$/i);
  if (!match) return undefined;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;

  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === "k" ? 1_000 :
    suffix === "m" ? 1_000_000 :
    suffix === "b" ? 1_000_000_000 :
    1;

  return value * multiplier;
}

function addAssetClass(rule: SmartScreenerRule, assetClass: AssetClass) {
  const current = new Set(rule.assetClasses ?? []);
  current.add(assetClass);
  rule.assetClasses = [...current];
}

function parseAssetClasses(text: string, rule: SmartScreenerRule, recognized: string[]) {
  const mappings: Array<[RegExp, AssetClass[]]> = [
    [/(الأسهم|الاسهم|stocks?|equities)/i, ["stock"]],
    [/(المؤشرات|indices|indexes)/i, ["index"]],
    [/(الصناديق|etfs?)/i, ["etf"]],
    [/(الفوركس|forex|fx)/i, ["forex"]],
    [/(الكريبتو|العملات الرقمية|crypto|bitcoin)/i, ["crypto"]],
    [/(العقود|futures?)/i, ["future"]],
    [/(السلع|commodities|commodity)/i, ["commodity"]],
  ];

  for (const [pattern, classes] of mappings) {
    if (!pattern.test(text)) continue;
    for (const assetClass of classes) addAssetClass(rule, assetClass);
    recognized.push(`asset:${classes.join("+")}`);
  }
}

function setChangeRule(
  rule: SmartScreenerRule,
  operator: "min" | "max",
  value: number,
  recognized: string[],
) {
  if (operator === "min") rule.minChangePercent = value;
  else rule.maxChangePercent = value;
  recognized.push(`change:${operator}:${value}`);
}

function parseChange(text: string, rule: SmartScreenerRule, recognized: string[]) {
  const positiveWord = /(صاعد|صاعدة|رابح|رابحة|مرتفع|ارتفاع|gainers?|up\b|positive)/i;
  const negativeWord = /(هابط|هابطة|خاسر|خاسرة|منخفض|انخفاض|losers?|down\b|negative)/i;

  if (positiveWord.test(text) && rule.minChangePercent === undefined) {
    rule.minChangePercent = 0;
    recognized.push("change:positive");
  }
  if (negativeWord.test(text) && rule.maxChangePercent === undefined) {
    rule.maxChangePercent = 0;
    recognized.push("change:negative");
  }

  const patterns: Array<[RegExp, "min" | "max"]> = [
    [
      /(?:التغير|التغيير|الحركة|change|move)?\s*(?:فوق|أكثر من|اكثر من|اكبر من|أكبر من|above|over|greater than|more than|>=?)\s*(-?\d+(?:\.\d+)?)\s*%/i,
      "min",
    ],
    [
      /(?:التغير|التغيير|الحركة|change|move)?\s*(?:تحت|أقل من|اقل من|اصغر من|أصغر من|below|under|less than|<=?)\s*(-?\d+(?:\.\d+)?)\s*%/i,
      "max",
    ],
  ];

  for (const [pattern, operator] of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) setChangeRule(rule, operator, value, recognized);
  }

  const simplePositive = text.match(
    /(?:صاعد|صاعدة|رابح|رابحة|up|gainer)[^\d-]*?(\d+(?:\.\d+)?)\s*%/i,
  );
  if (simplePositive) {
    const value = Number(simplePositive[1]);
    if (Number.isFinite(value)) setChangeRule(rule, "min", value, recognized);
  }

  const simpleNegative = text.match(
    /(?:هابط|هابطة|خاسر|خاسرة|down|loser)[^\d-]*?(-?\d+(?:\.\d+)?)\s*%/i,
  );
  if (simpleNegative) {
    const raw = Number(simpleNegative[1]);
    if (Number.isFinite(raw)) {
      setChangeRule(rule, "max", raw > 0 ? -raw : raw, recognized);
    }
  }
}

function parseMetricRange(
  text: string,
  metricNames: string,
  onMin: (value: number) => void,
  onMax: (value: number) => void,
  recognized: string[],
  label: string,
) {
  const minPattern = new RegExp(
    `(?:${metricNames})\\s*(?:فوق|أكثر من|اكثر من|اكبر من|أكبر من|above|over|greater than|more than|>=?)\\s*([\\d.,]+\\s*[kmb]?)`,
    "i",
  );
  const maxPattern = new RegExp(
    `(?:${metricNames})\\s*(?:تحت|أقل من|اقل من|اصغر من|أصغر من|below|under|less than|<=?)\\s*([\\d.,]+\\s*[kmb]?)`,
    "i",
  );

  const minMatch = text.match(minPattern);
  if (minMatch) {
    const value = parseCompactNumber(minMatch[1]);
    if (value !== undefined) {
      onMin(value);
      recognized.push(`${label}:min:${value}`);
    }
  }

  const maxMatch = text.match(maxPattern);
  if (maxMatch) {
    const value = parseCompactNumber(maxMatch[1]);
    if (value !== undefined) {
      onMax(value);
      recognized.push(`${label}:max:${value}`);
    }
  }
}

function parseVolumeAndPrice(text: string, rule: SmartScreenerRule, recognized: string[]) {
  parseMetricRange(
    text,
    "(?:الحجم|حجم التداول|volume)",
    (value) => { rule.minVolume = value; },
    (value) => { rule.maxVolume = value; },
    recognized,
    "volume",
  );

  parseMetricRange(
    text,
    "(?:السعر|price)",
    (value) => { rule.minPrice = value; },
    (value) => { rule.maxPrice = value; },
    recognized,
    "price",
  );
}

function parseSortAndLimit(text: string, rule: SmartScreenerRule, recognized: string[]) {
  const topMatch = text.match(/(?:أعلى|اعلى|افضل|top|highest)\s*(\d{1,3})?/i);
  if (topMatch) {
    rule.sortBy = "change";
    rule.sortDirection = "desc";
    if (topMatch[1]) rule.limit = Math.min(100, Math.max(1, Number(topMatch[1])));
    recognized.push(\`sort:change:desc\${rule.limit ? \`:\${rule.limit}\` : ""}\`);
  }

  const bottomMatch = text.match(/(?:أدنى|ادنى|أسوأ|اسوء|bottom|lowest|worst)\s*(\d{1,3})?/i);
  if (bottomMatch) {
    rule.sortBy = "change";
    rule.sortDirection = "asc";
    if (bottomMatch[1]) rule.limit = Math.min(100, Math.max(1, Number(bottomMatch[1])));
    recognized.push(\`sort:change:asc\${rule.limit ? \`:\${rule.limit}\` : ""}\`);
  }

  if (/(أعلى حجم|اعلى حجم|highest volume|most volume)/i.test(text)) {
    rule.sortBy = "volume";
    rule.sortDirection = "desc";
    recognized.push("sort:volume:desc");
  }

  if (/(أعلى سعر|اعلى سعر|highest price)/i.test(text)) {
    rule.sortBy = "price";
    rule.sortDirection = "desc";
    recognized.push("sort:price:desc");
  }

  const limitMatch = text.match(/(?:أول|اول|اعرض|show|limit)\s*(\d{1,3})/i);
  if (limitMatch) {
    rule.limit = Math.min(100, Math.max(1, Number(limitMatch[1])));
    recognized.push(\`limit:\${rule.limit}\`);
  }
}

function humanSummary(rule: SmartScreenerRule) {
  const parts: string[] = [];

  if (rule.assetClasses?.length) parts.push(`الأصول: ${rule.assetClasses.join(", ")}`);
  if (rule.minChangePercent !== undefined) parts.push(`التغير ≥ ${rule.minChangePercent}%`);
  if (rule.maxChangePercent !== undefined) parts.push(`التغير ≤ ${rule.maxChangePercent}%`);
  if (rule.minPrice !== undefined) parts.push(`السعر ≥ ${rule.minPrice}`);
  if (rule.maxPrice !== undefined) parts.push(`السعر ≤ ${rule.maxPrice}`);
  if (rule.minVolume !== undefined) parts.push(`الحجم ≥ ${rule.minVolume.toLocaleString("en-US")}`);
  if (rule.maxVolume !== undefined) parts.push(`الحجم ≤ ${rule.maxVolume.toLocaleString("en-US")}`);
  if (rule.sortBy) parts.push(`ترتيب: ${rule.sortBy} ${rule.sortDirection ?? "desc"}`);
  if (rule.limit !== undefined) parts.push(`الحد: ${rule.limit}`);

  return parts.length ? parts.join(" · ") : "لم يتم التعرف على فلاتر محددة.";
}

export function parseSmartScreenerQuery(query: string): SmartScreenerParseResult {
  const text = normalizeText(query);
  const rule: SmartScreenerRule = {};
  const recognized: string[] = [];

  parseAssetClasses(text, rule, recognized);
  parseChange(text, rule, recognized);
  parseVolumeAndPrice(text, rule, recognized);
  parseSortAndLimit(text, rule, recognized);

  const tokens = text
    .split(/[s,]+/)
    .filter(Boolean);

  const ignored = recognized.length === 0 ? tokens.slice(0, 20) : [];

  return {
    rule,
    recognized,
    ignored,
    summary: humanSummary(rule),
  };
}

export function applySmartScreener(
  items: MarketOverviewItem[],
  rule: SmartScreenerRule,
): MarketOverviewItem[] {
  let filtered = items.filter((item) => {
    const change = item.quote.percentChange ?? 0;
    const price = item.quote.price;
    const volume = item.quote.volume ?? 0;

    if (rule.assetClasses?.length && !rule.assetClasses.includes(item.symbol.assetClass)) return false;
    if (rule.minChangePercent !== undefined && change < rule.minChangePercent) return false;
    if (rule.maxChangePercent !== undefined && change > rule.maxChangePercent) return false;
    if (rule.minPrice !== undefined && price < rule.minPrice) return false;
    if (rule.maxPrice !== undefined && price > rule.maxPrice) return false;
    if (rule.minVolume !== undefined && volume < rule.minVolume) return false;
    if (rule.maxVolume !== undefined && volume > rule.maxVolume) return false;

    return true;
  });

  if (rule.sortBy) {
    const direction = rule.sortDirection === "asc" ? 1 : -1;
    filtered = [...filtered].sort((a, b) => {
      const aValue =
        rule.sortBy === "change" ? a.quote.percentChange ?? 0 :
        rule.sortBy === "volume" ? a.quote.volume ?? 0 :
        a.quote.price;
      const bValue =
        rule.sortBy === "change" ? b.quote.percentChange ?? 0 :
        rule.sortBy === "volume" ? b.quote.volume ?? 0 :
        b.quote.price;

      return (aValue - bValue) * direction;
    });
  }

  if (rule.limit !== undefined) filtered = filtered.slice(0, rule.limit);

  return filtered;
}
