import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
} from "lightweight-charts";
import type { MarketSymbol, Timeframe } from "@marketos/market-core";
import { createDemoCandles, createSma } from "../lib/demoData";

export type ChartView = "candles" | "line" | "area";

type Props = {
  symbol: MarketSymbol;
  timeframe: Timeframe;
  chartView: ChartView;
  showSma: boolean;
};

export default function MarketChart({ symbol, timeframe, chartView, showSma }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const candles = createDemoCandles(symbol.ticker, timeframe);

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
          top: 0.08,
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
      handleScroll: true,
      handleScale: true,
    });

    if (chartView === "candles") {
      const priceSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#20c997",
        downColor: "#f05d6f",
        borderVisible: false,
        wickUpColor: "#20c997",
        wickDownColor: "#f05d6f",
        priceLineVisible: true,
      });
      priceSeries.setData(candles);
    } else if (chartView === "line") {
      const priceSeries = chart.addSeries(LineSeries, {
        color: "#8b8cf8",
        lineWidth: 2,
        crosshairMarkerRadius: 4,
      });
      priceSeries.setData(candles.map((point) => ({ time: point.time, value: point.close })));
    } else {
      const priceSeries = chart.addSeries(AreaSeries, {
        lineColor: "#7c7cf5",
        topColor: "rgba(99,102,241,.30)",
        bottomColor: "rgba(99,102,241,.015)",
        lineWidth: 2,
      });
      priceSeries.setData(candles.map((point) => ({ time: point.time, value: point.close })));
    }

    if (showSma) {
      const smaSeries = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      smaSeries.setData(createSma(candles, 20));
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
  }, [symbol.id, symbol.ticker, timeframe, chartView, showSma]);

  return <div className="chart-canvas" ref={containerRef} />;
}
