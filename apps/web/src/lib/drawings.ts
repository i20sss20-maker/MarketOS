export type DrawingTool =
  | "cursor"
  | "horizontal"
  | "trend"
  | "zone"
  | "fibonacci"
  | "measure"
  | "text";

export type DrawingPoint = {
  time: number;
  price: number;
};

export type DrawingMeta = {
  hidden?: boolean;
  locked?: boolean;
  createdAt?: number;
};

export type HorizontalDrawing = DrawingMeta & {
  id: string;
  type: "horizontal";
  price: number;
};

export type TrendDrawing = DrawingMeta & {
  id: string;
  type: "trend";
  points: [DrawingPoint, DrawingPoint];
};

export type ZoneDrawing = DrawingMeta & {
  id: string;
  type: "zone";
  points: [DrawingPoint, DrawingPoint];
};

export type FibonacciDrawing = DrawingMeta & {
  id: string;
  type: "fibonacci";
  points: [DrawingPoint, DrawingPoint];
};

export type MeasureDrawing = DrawingMeta & {
  id: string;
  type: "measure";
  points: [DrawingPoint, DrawingPoint];
};

export type TextDrawing = DrawingMeta & {
  id: string;
  type: "text";
  point: DrawingPoint;
  text: string;
};

export type ChartDrawing =
  | HorizontalDrawing
  | TrendDrawing
  | ZoneDrawing
  | FibonacciDrawing
  | MeasureDrawing
  | TextDrawing;

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

function hasValidMeta(drawing: Partial<DrawingMeta>) {
  return (drawing.hidden === undefined || typeof drawing.hidden === "boolean") &&
    (drawing.locked === undefined || typeof drawing.locked === "boolean") &&
    (drawing.createdAt === undefined || Number.isFinite(drawing.createdAt));
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
      if (!drawing || typeof drawing.id !== "string" || !hasValidMeta(drawing)) return false;

      if (drawing.type === "horizontal") return Number.isFinite(drawing.price);

      if (
        drawing.type === "trend" ||
        drawing.type === "zone" ||
        drawing.type === "fibonacci" ||
        drawing.type === "measure"
      ) {
        return isTwoPointDrawing(drawing.points);
      }

      if (drawing.type === "text") {
        return isPoint(drawing.point) &&
          typeof drawing.text === "string" &&
          drawing.text.trim().length > 0;
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
  if (drawing.type === "fibonacci") return "Fibonacci";
  if (drawing.type === "measure") return "قياس";
  return "ملاحظة";
}

export function drawingDetail(drawing: ChartDrawing) {
  if (drawing.type === "horizontal") return drawing.price.toFixed(2);
  if (drawing.type === "text") return drawing.text;

  const [first, second] = drawing.points;
  if (drawing.type === "measure") {
    const delta = second.price - first.price;
    const percent = first.price === 0 ? 0 : (delta / first.price) * 100;
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} · ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
  }

  return `${first.price.toFixed(2)} → ${second.price.toFixed(2)}`;
}

export function withDrawingMeta<T extends ChartDrawing>(drawing: T): T {
  return {
    ...drawing,
    createdAt: drawing.createdAt ?? Date.now(),
  };
}
