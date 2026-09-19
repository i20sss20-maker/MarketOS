import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Timeframe } from "@marketos/market-core";
import type { ChartDrawing, DrawingPoint, DrawingTool } from "../lib/drawings";
import { createDrawingId } from "../lib/drawings";
import type { IndicatorSelection } from "../lib/indicators";
import {
  calculateBollinger,
  calculateEma,
  calculateRsi,
  calculateSma,
} from "../lib/indicators";

export type ChartView = "candles" | "line" | "area";

type Props = {
  candles: Candle[];
  timeframe: Timeframe;
  chartView: ChartView;
  indicators: IndicatorSelection;
  drawings: ChartDrawing[];
  drawingTool: DrawingTool;
  onDrawingCreated: (drawing: ChartDrawing) => void;
};

function lineData(points: Array<{ time: number; value: number }>) {
  return points.map((point) => ({
    time: point.time as UTCTimestamp,
    value: point.value,
  }));
}

export default function MarketChart({
  candles,
  timeframe,
  chartView,
  indicators,
  drawings,
  drawingTool,
  onDrawingCreated,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#090e19" },
        textColor: "#7e8ca4",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.055)" },
        horzLines: { color: "rgba(148,163,184,0.055)" },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.14)",
        scaleMargins: {
          top: 0.06,
          bottom: 0.08,
        },
      },
      timeScale: {
        borderColor: "rgba(148,163,184,0.14)",
        timeVisible: timeframe !== "1d" && timeframe !== "1w" && timeframe !== "1M",
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 7,
      },
      crosshair: {
        vertLine: {
          color: "rgba(165,180,252,.35)",
          labelBackgroundColor: "#312e81",
        },
        horzLine: {
          color: "rgba(165,180,252,.35)",
          labelBackgroundColor: "#312e81",
        },
      },
      handleScroll: drawingTool === "cursor",
      handleScale: drawingTool === "cursor",
    });

    const candleData = candles.map((point) => ({
      time: point.time as UTCTimestamp,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
    }));

    if (chartView === "candles") {
      const priceSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#20c997",
        downColor: "#f05d6f",
        borderVisible: false,
        wickUpColor: "#20c997",
        wickDownColor: "#f05d6f",
        priceLineVisible: true,
      });
      priceSeries.setData(candleData);
    } else if (chartView === "line") {
      const priceSeries = chart.addSeries(LineSeries, {
        color: "#8b8cf8",
        lineWidth: 2,
        crosshairMarkerRadius: 4,
      });
      priceSeries.setData(
        candles.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.close,
        })),
      );
    } else {
      const priceSeries = chart.addSeries(AreaSeries, {
        lineColor: "#7c7cf5",
        topColor: "rgba(99,102,241,.30)",
        bottomColor: "rgba(99,102,241,.015)",
        lineWidth: 2,
      });
      priceSeries.setData(
        candles.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.close,
        })),
      );
    }

    const interactionSeries = chart.addSeries(LineSeries, {
      color: "rgba(0,0,0,0)",
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    interactionSeries.setData(
      candles.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.close,
      })),
    );

    if (indicators.sma20 && candles.length >= 20) {
      const series = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(lineData(calculateSma(candles, 20)));
    }

    if (indicators.ema20 && candles.length >= 20) {
      const series = chart.addSeries(LineSeries, {
        color: "#38bdf8",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(lineData(calculateEma(candles, 20)));
    }

    if (indicators.ema50 && candles.length >= 50) {
      const series = chart.addSeries(LineSeries, {
        color: "#a78bfa",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(lineData(calculateEma(candles, 50)));
    }

    if (indicators.bollinger20 && candles.length >= 20) {
      const bands = calculateBollinger(candles, 20, 2);
      const upper = chart.addSeries(LineSeries, {
        color: "rgba(129,140,248,.62)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const middle = chart.addSeries(LineSeries, {
        color: "rgba(129,140,248,.30)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const lower = chart.addSeries(LineSeries, {
        color: "rgba(129,140,248,.62)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      upper.setData(lineData(bands.upper));
      middle.setData(lineData(bands.middle));
      lower.setData(lineData(bands.lower));
    }

    const volumeData = candles
      .filter((point) => point.volume !== undefined)
      .map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.volume ?? 0,
        color: point.close >= point.open
          ? "rgba(32,201,151,.34)"
          : "rgba(240,93,111,.34)",
      }));

    let nextPaneIndex = 1;

    if (volumeData.length > 0) {
      const volumePaneIndex = nextPaneIndex;
      nextPaneIndex += 1;

      const volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          lastValueVisible: false,
          priceLineVisible: false,
        },
        volumePaneIndex,
      );
      volumeSeries.setData(volumeData);
      chart.panes()[volumePaneIndex]?.setHeight(105);
    }

    if (indicators.rsi14 && candles.length > 14) {
      const rsiPaneIndex = nextPaneIndex;
      const rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: "#f472b6",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          title: "RSI 14",
        },
        rsiPaneIndex,
      );
      rsiSeries.setData(lineData(calculateRsi(candles, 14)));
      rsiSeries.createPriceLine({
        price: 70,
        color: "rgba(240,93,111,.35)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "70",
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: "rgba(32,201,151,.35)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "30",
      });
      chart.panes()[rsiPaneIndex]?.setHeight(120);
    }

    for (const drawing of drawings) {
      if (drawing.type === "horizontal") {
        interactionSeries.createPriceLine({
          price: drawing.price,
          color: "#818cf8",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "H",
        });
        continue;
      }

      const [firstPoint, secondPoint] = [...drawing.points].sort((a, b) => a.time - b.time);
      const trendSeries = chart.addSeries(LineSeries, {
        color: "#c084fc",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      trendSeries.setData([
        { time: firstPoint.time as UTCTimestamp, value: firstPoint.price },
        { time: secondPoint.time as UTCTimestamp, value: secondPoint.price },
      ]);
    }

    let pendingTrendPoint: DrawingPoint | null = null;

    const handleClick = (param: Parameters<Parameters<typeof chart.subscribeClick>[0]>[0]) => {
      if (drawingTool === "cursor" || !param.point || typeof param.time !== "number") return;

      const price = interactionSeries.coordinateToPrice(param.point.y);
      if (price === null) return;

      const point: DrawingPoint = {
        time: param.time,
        price,
      };

      if (drawingTool === "horizontal") {
        onDrawingCreated({
          id: createDrawingId(),
          type: "horizontal",
          price,
        });
        return;
      }

      if (!pendingTrendPoint) {
        pendingTrendPoint = point;
        return;
      }

      onDrawingCreated({
        id: createDrawingId(),
        type: "trend",
        points: [pendingTrendPoint, point],
      });
      pendingTrendPoint = null;
    };

    chart.subscribeClick(handleClick);

    const resize = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });

    resize.observe(container);
    chart.timeScale().fitContent();

    return () => {
      resize.disconnect();
      chart.unsubscribeClick(handleClick);
      chart.remove();
    };
  }, [candles, timeframe, chartView, indicators, drawings, drawingTool, onDrawingCreated]);

  return (
    <div
      className={`chart-canvas ${drawingTool === "cursor" ? "" : "drawing-active"}`}
      ref={containerRef}
    />
  );
}
