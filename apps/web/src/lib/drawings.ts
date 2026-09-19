export type DrawingTool = "cursor" | "horizontal" | "trend";

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

export type ChartDrawing = HorizontalDrawing | TrendDrawing;

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
      if (drawing.type === "trend") {
        return Array.isArray(drawing.points) &&
          drawing.points.length === 2 &&
          drawing.points.every((point) => Number.isFinite(point.time) && Number.isFinite(point.price));
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
