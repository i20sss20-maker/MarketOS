import type { ChartDrawing } from "./drawings";

export type DrawingHistory = {
  past: ChartDrawing[][];
  present: ChartDrawing[];
  future: ChartDrawing[][];
};

const MAX_HISTORY = 50;

function cloneDrawings(drawings: ChartDrawing[]) {
  return drawings.map((drawing) => structuredClone(drawing));
}

export function createDrawingHistory(drawings: ChartDrawing[] = []): DrawingHistory {
  return {
    past: [],
    present: cloneDrawings(drawings),
    future: [],
  };
}

export function commitDrawingHistory(
  history: DrawingHistory,
  next: ChartDrawing[],
): DrawingHistory {
  const serializedCurrent = JSON.stringify(history.present);
  const serializedNext = JSON.stringify(next);

  if (serializedCurrent === serializedNext) return history;

  const past = [...history.past, cloneDrawings(history.present)];
  if (past.length > MAX_HISTORY) past.shift();

  return {
    past,
    present: cloneDrawings(next),
    future: [],
  };
}

export function undoDrawingHistory(history: DrawingHistory): DrawingHistory {
  if (history.past.length === 0) return history;

  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: cloneDrawings(previous),
    future: [cloneDrawings(history.present), ...history.future].slice(0, MAX_HISTORY),
  };
}

export function redoDrawingHistory(history: DrawingHistory): DrawingHistory {
  if (history.future.length === 0) return history;

  const next = history.future[0];
  return {
    past: [...history.past, cloneDrawings(history.present)].slice(-MAX_HISTORY),
    present: cloneDrawings(next),
    future: history.future.slice(1),
  };
}

export function canUndoDrawings(history: DrawingHistory) {
  return history.past.length > 0;
}

export function canRedoDrawings(history: DrawingHistory) {
  return history.future.length > 0;
}
