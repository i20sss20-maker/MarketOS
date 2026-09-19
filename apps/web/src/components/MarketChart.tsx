import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Timeframe } from "@marketos/market-core";
import { createSma } from "../lib/demoData";

export type ChartView = "candles" | "line" | "area";

type Props = {
  candles: Candle[];
  timeframe: Timeframe;
  chartView: ChartView;
  showSma: boolean;
};

export default function MarketChart({ candles, timeframe, chartView, showSma }: Props) {
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
          bottom: 0.24,
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
      handleScroll: true,
      handleScale: true,
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

    if (showSma && candles.length >= 20) {
      const smaSeries = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      smaSeries.setData(
        createSma(candles, 20).map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.value,
        })),
      );
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

    if (volumeData.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volumeSeries.setData(volumeData);
      chart.priceScale("volume").applyOptions({
        scaleMargins: {
          top: 0.80,
          bottom: 0,
        },
      });
    }

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
      chart.remove();
    };
  }, [candles, timeframe, chartView, showSma]);

  return <div className="chart-canvas" ref={containerRef} />;
}
