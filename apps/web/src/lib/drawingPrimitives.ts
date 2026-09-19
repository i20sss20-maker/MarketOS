import type {
  Coordinate,
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  PrimitivePaneViewZOrder,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { DrawingPoint } from "./drawings";

type ChartPoint = {
  x: Coordinate | null;
  y: Coordinate | null;
};

class ZoneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly first: ChartPoint,
    private readonly second: ChartPoint,
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]) {
    target.useMediaCoordinateSpace(({ context }) => {
      if (
        this.first.x === null ||
        this.first.y === null ||
        this.second.x === null ||
        this.second.y === null
      ) {
        return;
      }

      const left = Math.min(this.first.x, this.second.x);
      const top = Math.min(this.first.y, this.second.y);
      const width = Math.abs(this.second.x - this.first.x);
      const height = Math.abs(this.second.y - this.first.y);

      context.save();
      context.fillStyle = "rgba(99, 102, 241, 0.12)";
      context.strokeStyle = "rgba(129, 140, 248, 0.72)";
      context.lineWidth = 1;
      context.setLineDash([5, 4]);
      context.fillRect(left, top, width, height);
      context.strokeRect(left + 0.5, top + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
      context.restore();
    });
  }
}

class ZoneView implements IPrimitivePaneView {
  private first: ChartPoint = { x: null, y: null };
  private second: ChartPoint = { x: null, y: null };

  constructor(private readonly source: ZonePrimitive) {}

  update() {
    const series = this.source.series;
    const timeScale = this.source.chart.timeScale();
    this.first = {
      x: timeScale.timeToCoordinate(this.source.first.time as Time),
      y: series.priceToCoordinate(this.source.first.price),
    };
    this.second = {
      x: timeScale.timeToCoordinate(this.source.second.time as Time),
      y: series.priceToCoordinate(this.source.second.price),
    };
  }

  renderer() {
    return new ZoneRenderer(this.first, this.second);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }
}

export class ZonePrimitive {
  readonly view: ZoneView;

  constructor(
    readonly chart: IChartApi,
    readonly series: ISeriesApi<SeriesType>,
    readonly first: DrawingPoint,
    readonly second: DrawingPoint,
  ) {
    this.view = new ZoneView(this);
  }

  updateAllViews() {
    this.view.update();
  }

  paneViews() {
    return [this.view];
  }
}

type FibonacciCoordinate = {
  y: Coordinate | null;
  label: string;
};

class FibonacciRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly x1: Coordinate | null,
    private readonly x2: Coordinate | null,
    private readonly levels: FibonacciCoordinate[],
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]) {
    target.useMediaCoordinateSpace(({ context }) => {
      if (this.x1 === null || this.x2 === null) return;
      const left = Math.min(this.x1, this.x2);
      const right = Math.max(this.x1, this.x2);

      context.save();
      context.font = "9px Inter, Segoe UI, sans-serif";
      context.textBaseline = "bottom";

      for (const level of this.levels) {
        if (level.y === null) continue;
        context.beginPath();
        context.strokeStyle = level.label === "0.618"
          ? "rgba(245, 158, 11, 0.92)"
          : "rgba(167, 139, 250, 0.62)";
        context.lineWidth = level.label === "0.618" ? 1.4 : 1;
        context.setLineDash(level.label === "0.618" ? [] : [4, 3]);
        context.moveTo(left, level.y + 0.5);
        context.lineTo(right, level.y + 0.5);
        context.stroke();

        context.fillStyle = "rgba(179, 188, 214, 0.82)";
        context.fillText(level.label, right + 4, level.y - 2);
      }

      context.restore();
    });
  }
}

class FibonacciView implements IPrimitivePaneView {
  private x1: Coordinate | null = null;
  private x2: Coordinate | null = null;
  private levels: FibonacciCoordinate[] = [];

  constructor(private readonly source: FibonacciPrimitive) {}

  update() {
    const timeScale = this.source.chart.timeScale();
    this.x1 = timeScale.timeToCoordinate(this.source.first.time as Time);
    this.x2 = timeScale.timeToCoordinate(this.source.second.time as Time);

    const prices = this.source.levels.map((level) => ({
      label: level.label,
      y: this.source.series.priceToCoordinate(level.price),
    }));
    this.levels = prices;
  }

  renderer() {
    return new FibonacciRenderer(this.x1, this.x2, this.levels);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return "normal";
  }
}

export class FibonacciPrimitive {
  readonly view: FibonacciView;
  readonly levels: Array<{ label: string; price: number }>;

  constructor(
    readonly chart: IChartApi,
    readonly series: ISeriesApi<SeriesType>,
    readonly first: DrawingPoint,
    readonly second: DrawingPoint,
  ) {
    const ratios = [
      { label: "0", ratio: 0 },
      { label: "0.236", ratio: 0.236 },
      { label: "0.382", ratio: 0.382 },
      { label: "0.5", ratio: 0.5 },
      { label: "0.618", ratio: 0.618 },
      { label: "0.786", ratio: 0.786 },
      { label: "1", ratio: 1 },
    ];

    this.levels = ratios.map(({ label, ratio }) => ({
      label,
      price: first.price + (second.price - first.price) * ratio,
    }));
    this.view = new FibonacciView(this);
  }

  updateAllViews() {
    this.view.update();
  }

  paneViews() {
    return [this.view];
  }
}
