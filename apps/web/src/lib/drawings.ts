export type DrawingTool =
  | "cursor"
  | "horizontal"
  | "trend"
  | "zone"
  | "fibonacci";

export type DrawingPoint = {
  time: number;
  price: number;
};

export type HorizontalDrawing = {
  id: string;
  type: "horizontal";
  price: number;
};

export type TrendDrawing = {
  id: string;
  type: "trend";
  points: [DrawingPoint, DrawingPoint];
};

export type ZoneDrawing = {
  id: string;
  type: "zone";
  points: [DrawingPoint, DrawingPoint];
};

export type FibonacciDrawing = {
  id: string;
  type: "fibonacci";
  points: [DrawingPoint, DrawingPoint];
};

export type ChartDrawing =
  | HorizontalDrawing
  | TrendDrawing
  | ZoneDrawing
  | FibonacciDrawing;

function safeStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(symbolId: string) {
  return `marketos:drawings:${symbolId}`;
}

export function createDrawingId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPoint(value: unknown): value is DrawingPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<DrawingPoint>;
  return Number.isFinite(point.time) && Number.isFinite(point.price);
}

function isTwoPointDrawing(value: unknown): value is [DrawingPoint, DrawingPoint] {
  return Array.isArray(value) &&
    value.length === 2 &&
    isPoint(value[0]) &&
    isPoint(value[1]);
}

export function loadDrawings(symbolId: string): ChartDrawing[] {
  const storage = safeStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(storageKey(symbolId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChartDrawing[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((drawing) => {
      if (!drawing || typeof drawing.id !== "string") return false;
      if (drawing.type === "horizontal") return Number.isFinite(drawing.price);
      if (
        drawing.type === "trend" ||
        drawing.type === "zone" ||
        drawing.type === "fibonacci"
      ) {
        return isTwoPointDrawing(drawing.points);
      }
      return false;
    });
  } catch {
    return [];
  }
}

export function saveDrawings(symbolId: string, drawings: ChartDrawing[]) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(storageKey(symbolId), JSON.stringify(drawings));
  } catch {
    // Ignore storage restrictions.
  }
}

export function drawingName(drawing: ChartDrawing) {
  if (drawing.type === "horizontal") return "خط أفقي";
  if (drawing.type === "trend") return "خط اتجاه";
  if (drawing.type === "zone") return "منطقة سعر";
  return "Fibonacci";
}

export function drawingDetail(drawing: ChartDrawing) {
  if (drawing.type === "horizontal") return drawing.price.toFixed(2);
  const [first, second] = drawing.points;
  return `${first.price.toFixed(2)} → ${second.price.toFixed(2)}`;
}
