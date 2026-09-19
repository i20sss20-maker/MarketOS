import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart } from "lightweight-charts";
import type { MarketSymbol } from "@marketos/market-core";
import { createDemoCandles } from "../lib/demoData";

type Props = {
  symbol: MarketSymbol;
};

export default function MarketChart({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1020" },
        textColor: "#9aa7bd",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.08)" },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.18)",
      },
      timeScale: {
        borderColor: "rgba(148,163,184,0.18)",
        timeVisible: true,
      },
      crosshair: {
        mode: 1,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    series.setData(createDemoCandles(symbol.ticker));

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
  }, [symbol.id, symbol.ticker]);

  return <div className="chart-canvas" ref={containerRef} />;
}
