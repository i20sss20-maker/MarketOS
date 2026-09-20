import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AnalystForecastResponse,
  MarketSymbol,
} from "@marketos/market-core";
import {
  getAnalystForecast,
} from "../lib/aiApi";
import {
  buildAnalystRadarDeltas,
  buildAnalystRadarItem,
  prepareRadarSymbols,
  rankAnalystRadar,
  type AnalystRadarFailure,
  type AnalystRadarItem,
} from "../lib/analystRadar";
import {
  isAnalystRadarCacheStale,
  loadAnalystRadarCache,
  saveAnalystRadarCache,
} from "../lib/analystRadarCache";

type Props = {
  activeSymbol:
    MarketSymbol;
  symbols:
    MarketSymbol[];
  onSelectSymbol:
    (symbol: MarketSymbol) =>
      void;
};

function directionLabel(
  direction:
    AnalystRadarItem["direction"],
) {
  if (
    direction === "bull"
  ) {
    return "صاعد";
  }

  if (
    direction === "bear"
  ) {
    return "هابط";
  }

  return "محايد";
}

function riskLabel(
  risk:
    AnalystForecastResponse["risk"],
) {
  if (risk === "high") {
    return "مخاطرة مرتفعة";
  }

  if (risk === "medium") {
    return "مخاطرة متوسطة";
  }

  return "مخاطرة منخفضة";
}

function changeLabel(
  change:
    "new" |
    "strengthening" |
    "weakening" |
    "stable" |
    "reversal",
) {
  if (change === "strengthening") {
    return "تقوّت";
  }

  if (change === "weakening") {
    return "ضعفت";
  }

  if (change === "reversal") {
    return "انعكاس";
  }

  if (change === "new") {
    return "جديد";
  }

  return "ثابت";
}

function signedDelta(
  value: number,
) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatPrice(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      minimumFractionDigits:
        Math.abs(value) < 10
          ? 3
          : 2,
      maximumFractionDigits:
        Math.abs(value) < 10
          ? 5
          : 2,
    },
  ).format(value);
}

export default function AnalystRadarView({
  activeSymbol,
  symbols,
  onSelectSymbol,
}: Props) {
  const [
    items,
    setItems,
  ] = useState<
    AnalystRadarItem[]
  >([]);
  const [
    failures,
    setFailures,
  ] = useState<
    AnalystRadarFailure[]
  >([]);
  const [
    loading,
    setLoading,
  ] = useState(false);
  const [
    progress,
    setProgress,
  ] = useState({
    done: 0,
    total: 0,
  });
  const [
    updatedAt,
    setUpdatedAt,
  ] = useState<
    number | null
  >(null);
  const [
    previousItems,
    setPreviousItems,
  ] = useState<
    AnalystRadarItem[]
  >([]);
  const [
    previousUpdatedAt,
    setPreviousUpdatedAt,
  ] = useState<
    number | null
  >(null);
  const autoBootstrapRef =
    useRef(false);

  const candidates =
    useMemo(
      () =>
        prepareRadarSymbols(
          activeSymbol,
          symbols,
          5,
        ),
      [
        activeSymbol,
        symbols,
      ],
    );

  const ranked =
    useMemo(
      () =>
        rankAnalystRadar(
          items,
        ),
      [items],
    );

  const deltas =
    useMemo(
      () =>
        buildAnalystRadarDeltas(
          ranked,
          previousItems,
        ),
      [
        ranked,
        previousItems,
      ],
    );

  const deltaBySymbol =
    useMemo(
      () =>
        new Map(
          deltas.map(
            (delta) => [
              delta.symbolId,
              delta,
            ],
          ),
        ),
      [deltas],
    );

  const strengtheningCount =
    deltas.filter(
      (item) =>
        item.change ===
        "strengthening",
    ).length;
  const reversalCount =
    deltas.filter(
      (item) =>
        item.change ===
        "reversal",
    ).length;

  const providerCount =
    ranked.filter(
      (item) =>
        item.forecast
          .dataMode ===
        "provider",
    ).length;

  const runRadar =
    async (
      automatic = false,
    ) => {
      if (loading) return;

      setLoading(true);
      if (!automatic) {
        setItems([]);
      }
      setFailures([]);
      setProgress({
        done: 0,
        total:
          candidates.length,
      });

      const nextItems:
        AnalystRadarItem[] = [];
      const nextFailures:
        AnalystRadarFailure[] = [];

      for (
        let index = 0;
        index <
        candidates.length;
        index += 1
      ) {
        const symbol =
          candidates[index];

        try {
          const forecast =
            await getAnalystForecast(
              symbol,
            );

          nextItems.push(
            buildAnalystRadarItem(
              symbol,
              forecast,
            ),
          );
          setItems(
            rankAnalystRadar(
              [...nextItems],
            ),
          );
        } catch (error) {
          nextFailures.push({
            symbol,
            error:
              error instanceof
              Error
                ? error.message
                : "تعذر التحليل.",
          });
          setFailures([
            ...nextFailures,
          ]);
        } finally {
          setProgress({
            done: index + 1,
            total:
              candidates.length,
          });
        }
      }

      const finalItems =
        rankAnalystRadar(
          [...nextItems],
        );
      const finishedAt =
        Date.now();

      setItems(finalItems);
      setUpdatedAt(
        finishedAt,
      );
      const saved =
        saveAnalystRadarCache(
          candidates,
          finalItems,
          finishedAt,
        );

      if (saved) {
        setPreviousItems(
          saved.previousItems,
        );
        setPreviousUpdatedAt(
          saved.previousUpdatedAt ??
            null,
        );
      }

      setLoading(false);
    };

  useEffect(() => {
    if (
      autoBootstrapRef.current
    ) {
      return;
    }

    autoBootstrapRef.current =
      true;

    const cached =
      loadAnalystRadarCache(
        candidates,
      );

    if (cached) {
      setItems(
        cached.items,
      );
      setUpdatedAt(
        cached.updatedAt,
      );
      setPreviousItems(
        cached.previousItems,
      );
      setPreviousUpdatedAt(
        cached.previousUpdatedAt ??
          null,
      );
    }

    if (
      candidates.length > 0 &&
      isAnalystRadarCacheStale(
        cached,
      )
    ) {
      void runRadar(true);
    }
  }, []);

  return (
    <section
      className="analyst-radar"
      dir="rtl"
    >
      <div className="analyst-radar-hero">
        <div>
          <span>
            MARKETOS RADAR
          </span>
          <h2>
            رادار قائمة المتابعة
          </h2>
          <p>
            يفحص حتى 5 أصول بالتتابع
            باستخدام نفس Analyst
            Forecast، ثم يرتب الحالات
            حسب وضوح السيناريو والثقة
            والمعايرة والمخاطر.
          </p>
        </div>

        <button
          onClick={() =>
            void runRadar(false)
          }
          disabled={
            loading ||
            candidates.length === 0
          }
        >
          {loading
            ? `يفحص ${progress.done}/${progress.total}`
            : ranked.length > 0
              ? "إعادة الفحص"
              : "افحص القائمة"}
        </button>
      </div>

      <div className="analyst-radar-meta">
        <span>
          {candidates.length}
          {" "}
          أصول جاهزة
        </span>
        <span>
          {providerCount}
          {" "}
          Provider
        </span>
        <span>
          {failures.length}
          {" "}
          تعذر
        </span>
        <span>
          آخر تحديث{" "}
          {updatedAt
            ? new Date(
                updatedAt,
              ).toLocaleTimeString(
                "ar-SA",
                {
                  hour:
                    "2-digit",
                  minute:
                    "2-digit",
                },
              )
            : "—"}
        </span>
        {previousItems.length > 0 ? (
          <>
            <span>
              تقوّت{" "}
              {strengtheningCount}
            </span>
            <span>
              انعكاس{" "}
              {reversalCount}
            </span>
          </>
        ) : null}
      </div>

      {loading ? (
        <div className="analyst-radar-progress">
          <span
            style={{
              width:
                progress.total > 0
                  ? `${Math.round(
                      (
                        progress.done /
                        progress.total
                      ) *
                        100,
                    )}%`
                  : "0%",
            }}
          />
        </div>
      ) : null}

      {!loading &&
      ranked.length === 0 ? (
        <div className="analyst-radar-empty">
          <strong>
            افحص قائمة المتابعة
          </strong>
          <small>
            الرادار لا ينفذ صفقات ولا
            يعطي ضمانًا؛ يعرض سيناريوهات
            احتمالية مبنية على البيانات
            المتاحة.
          </small>
        </div>
      ) : null}

      <div className="analyst-radar-list">
        {ranked.map(
          (item, index) => {
            const top =
              item.forecast
                .scenarios
                .find(
                  (scenario) =>
                    scenario.id ===
                    item.direction,
                );
            const delta =
              deltaBySymbol.get(
                item.symbol.id,
              );

            return (
              <article
                key={
                  item.symbol.id
                }
                className={
                  `analyst-radar-row ${item.direction}`
                }
              >
                <div className="analyst-radar-rank">
                  {index + 1}
                </div>

                <div className="analyst-radar-symbol">
                  <strong>
                    {
                      item.symbol
                        .ticker
                    }
                  </strong>
                  <small>
                    {
                      item.symbol
                        .exchange
                    }
                    {" · "}
                    {
                      item.forecast
                        .dataMode ===
                      "provider"
                        ? item.forecast
                            .dataProvider
                        : "Demo"
                    }
                  </small>
                  {delta &&
                  previousItems.length >
                    0 ? (
                    <span
                      className={
                        `analyst-radar-change ${delta.change}`
                      }
                    >
                      {changeLabel(
                        delta.change,
                      )}
                      {delta.change ===
                      "reversal" &&
                      delta.previousDirection
                        ? ` · ${directionLabel(
                            delta.previousDirection,
                          )}→${directionLabel(
                            delta.currentDirection,
                          )}`
                        : ` · احتمال ${signedDelta(
                            delta.probabilityDelta,
                          )}`}
                    </span>
                  ) : null}
                </div>

                <div className="analyst-radar-direction">
                  <span>
                    {directionLabel(
                      item.direction,
                    )}
                  </span>
                  <strong>
                    {
                      item.directionProbability
                    }
                    %
                  </strong>
                  <small>
                    السيناريو الأعلى
                  </small>
                </div>

                <div className="analyst-radar-confidence">
                  <span>الثقة</span>
                  <strong>
                    {item.confidence}%
                  </strong>
                  <small>
                    وضوح{" "}
                    {item.clarity}%
                    {delta &&
                    previousItems.length >
                      0
                      ? ` (${signedDelta(
                          delta.clarityDelta,
                        )})`
                      : ""}
                  </small>
                </div>

                <div className="analyst-radar-context">
                  <span>
                    {riskLabel(
                      item.forecast
                        .risk,
                    )}
                  </span>
                  <strong>
                    {formatPrice(
                      item.forecast
                        .referencePrice,
                    )}
                  </strong>
                  <small>
                    {item.calibrated
                      ? `معايرة ${item.forecast.calibration?.sampleSize ?? 0} حالة`
                      : "بدون معايرة"}
                  </small>
                </div>

                <div className="analyst-radar-action">
                  <button
                    onClick={() =>
                      onSelectSymbol(
                        item.symbol,
                      )
                    }
                  >
                    افتح
                  </button>
                  <small>
                    {top
                      ? `${formatPrice(
                          top.targetLow,
                        )} – ${formatPrice(
                          top.targetHigh,
                        )}`
                      : "—"}
                  </small>
                </div>
              </article>
            );
          },
        )}
      </div>

      {failures.length > 0 ? (
        <details className="analyst-radar-failures">
          <summary>
            تعذر تحليل{" "}
            {failures.length}
            {" "}
            أصل
          </summary>
          {failures.map(
            (failure) => (
              <p
                key={
                  failure.symbol
                    .id
                }
              >
                <b>
                  {
                    failure.symbol
                      .ticker
                  }
                </b>
                {" — "}
                {failure.error}
              </p>
            ),
          )}
        </details>
      ) : null}

      {previousUpdatedAt ? (
        <div className="analyst-radar-previous-time">
          المقارنة مع فحص{" "}
          {new Date(
            previousUpdatedAt,
          ).toLocaleTimeString(
            "ar-SA",
            {
              hour: "2-digit",
              minute: "2-digit",
            },
          )}
        </div>
      ) : null}

      <footer className="analyst-radar-note">
        النتائج تُحفظ محليًا لمدة 15
        دقيقة وتُحدّث تلقائيًا عند فتح
        الرادار إذا انتهت صلاحيتها.
        ترتيب «الوضوح» مقياس داخلي
        لتنظيم الحالات وليس توصية شراء
        أو بيع. راجع السيناريو والتفعيل
        والإبطال داخل المحلل لكل أصل.
      </footer>
    </section>
  );
}
