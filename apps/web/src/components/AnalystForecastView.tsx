import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AnalystForecastResponse,
} from "@marketos/market-core";
import {
  loadForecastJournal,
  saveForecastJournal,
  summarizeForecastJournal,
  updateForecastJournal,
} from "../lib/forecastJournal";

type Props = {
  result: AnalystForecastResponse | null;
  loading: boolean;
  error: string | null;
  ticker: string;
  onRun: () => void;
  formatPrice: (
    value?: number,
  ) => string;
};

function biasLabel(
  bias:
    AnalystForecastResponse["bias"],
) {
  if (bias === "bullish") {
    return "ميل صاعد";
  }

  if (bias === "bearish") {
    return "ميل هابط";
  }

  return "ميل محايد";
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

function regimeLabel(
  regime:
    AnalystForecastResponse["regime"],
) {
  if (regime === "trend") {
    return "اتجاه";
  }

  if (regime === "volatile") {
    return "تذبذب مرتفع";
  }

  return "نطاق";
}

function calibrationReliabilityLabel(
  reliability:
    NonNullable<
      AnalystForecastResponse["calibration"]
    >["reliability"],
) {
  if (reliability === "high") {
    return "موثوقية أعلى";
  }

  if (reliability === "medium") {
    return "موثوقية متوسطة";
  }

  return "عينة محدودة";
}

function outcomeLabel(
  outcome:
    "bull" | "base" | "bear",
) {
  if (outcome === "bull") {
    return "صاعد";
  }

  if (outcome === "bear") {
    return "هابط";
  }

  return "محايد";
}

export default function AnalystForecastView({
  result,
  loading,
  error,
  ticker,
  onRun,
  formatPrice,
}: Props) {
  const [journal, setJournal] =
    useState(
      () =>
        loadForecastJournal(),
    );

  useEffect(() => {
    if (!result) return;

    setJournal((current) => {
      const next =
        updateForecastJournal(
          current,
          result,
        );

      saveForecastJournal(next);
      return next;
    });
  }, [result]);

  const symbolJournal =
    useMemo(
      () =>
        result
          ? journal.filter(
              (record) =>
                record.symbolId ===
                result.symbol.id,
            )
          : [],
      [journal, result],
    );

  const scorecard =
    useMemo(
      () =>
        summarizeForecastJournal(
          symbolJournal,
        ),
      [symbolJournal],
    );

  return (
    <section
      className="analyst-forecast"
      dir="rtl"
    >
      <div className="analyst-hero">
        <div>
          <span className="analyst-eyebrow">
            MARKETOS ANALYST
          </span>
          <h2>
            توقع احتمالي لـ {ticker}
          </h2>
          <p>
            يجمع عدة فريمات مع السعر والحجم والأحداث والإفصاحات المتاحة، ثم يبني سيناريوهات واضحة بدل توقع واحد قطعي.
          </p>
        </div>

        <button
          className="analyst-run"
          onClick={onRun}
          disabled={loading}
        >
          {loading
            ? "جاري التحليل…"
            : result
              ? "تحديث التحليل"
              : "حلّل الأصل"}
        </button>
      </div>

      {error ? (
        <div className="analyst-error">
          {error}
        </div>
      ) : null}

      {!result &&
      !loading ? (
        <div className="analyst-empty">
          <span>◎</span>
          <strong>
            تقرير احتمالي كامل
          </strong>
          <small>
            الاتجاه المرجّح · الثقة · الدعم والمقاومة · 3 سيناريوهات · المحفزات · المخاطر
          </small>
        </div>
      ) : null}

      {result ? (
        <>
          <div className="analyst-verdict">
            <div>
              <span
                className={
                  `analyst-bias ${result.bias}`
                }
              >
                {biasLabel(
                  result.bias,
                )}
              </span>
              <strong>
                {result.confidence}%
              </strong>
              <small>
                درجة الثقة
              </small>
            </div>

            <div>
              <span>النظام</span>
              <strong>
                {regimeLabel(
                  result.regime,
                )}
              </strong>
              <small>
                {riskLabel(
                  result.risk,
                )}
              </small>
            </div>

            <div>
              <span>الأفق</span>
              <strong>
                {result.horizon}
              </strong>
              <small>
                {result.timeframes
                  .map(
                    (item) =>
                      item.toUpperCase(),
                  )
                  .join(" · ")}
              </small>
            </div>
          </div>

          <div className="analyst-summary">
            <strong>
              {result.summary}
            </strong>
            <small>
              المصدر:{" "}
              {result.dataProvider} ·{" "}
              {result.dataMode ===
              "provider"
                ? "بيانات مزود"
                : "Demo"}
            </small>
          </div>

          {result.calibration ? (
            <div className="analyst-calibration">
              <header>
                <div>
                  <span>
                    HISTORICAL ANALOG
                  </span>
                  <strong>
                    تحقق تاريخي للحالات المشابهة
                  </strong>
                </div>
                <b>
                  {calibrationReliabilityLabel(
                    result.calibration
                      .reliability,
                  )}
                </b>
              </header>

              <div className="analyst-calibration-grid">
                <div>
                  <span>الفريم</span>
                  <strong>
                    {result.calibration.timeframe.toUpperCase()}
                  </strong>
                  <small>
                    أفق {result.calibration.lookaheadBars} شموع
                  </small>
                </div>
                <div>
                  <span>العينة</span>
                  <strong>
                    {result.calibration.sampleSize}
                  </strong>
                  <small>
                    {result.calibration.comparableSamples} تطابق قريب
                  </small>
                </div>
                <div>
                  <span>تطابق الاتجاه</span>
                  <strong>
                    {result.calibration.directionalHitRate}%
                  </strong>
                  <small>
                    للحالات المختارة
                  </small>
                </div>
                <div>
                  <span>درجة التشابه</span>
                  <strong>
                    {result.calibration.similarityScore}%
                  </strong>
                  <small>
                    وزن الدمج {Math.round(
                      result.calibration.blendWeight * 100,
                    )}%
                  </small>
                </div>
              </div>

              <div className="analyst-calibration-probabilities">
                <div>
                  <span>صاعد</span>
                  <b>
                    {result.calibration.bullProbability}%
                  </b>
                </div>
                <div>
                  <span>محايد</span>
                  <b>
                    {result.calibration.baseProbability}%
                  </b>
                </div>
                <div>
                  <span>هابط</span>
                  <b>
                    {result.calibration.bearProbability}%
                  </b>
                </div>
              </div>

              <p>
                متوسط الحركة اللاحقة{" "}
                <b>
                  {result.calibration.averageForwardReturn > 0
                    ? "+"
                    : ""}
                  {result.calibration.averageForwardReturn}%
                </b>
                {" · "}
                الوسيط{" "}
                <b>
                  {result.calibration.medianForwardReturn > 0
                    ? "+"
                    : ""}
                  {result.calibration.medianForwardReturn}%
                </b>
                {" · "}
                حد تصنيف الحركة ±
                {result.calibration.outcomeThresholdPercent}%
              </p>
            </div>
          ) : null}

          <div className="analyst-scorecard">
            <header>
              <div>
                <span>
                  FORECAST SCORECARD
                </span>
                <strong>
                  سجل دقة التوقعات
                </strong>
              </div>
              <b>
                {scorecard.providerAccuracy ===
                null
                  ? "يتعلم"
                  : `${scorecard.providerAccuracy}%`}
              </b>
            </header>

            <div className="analyst-scorecard-grid">
              <div>
                <span>قيد التحقق</span>
                <strong>
                  {scorecard.pending}
                </strong>
                <small>
                  توقع محفوظ
                </small>
              </div>
              <div>
                <span>محسوم</span>
                <strong>
                  {scorecard.providerResolved}
                </strong>
                <small>
                  بيانات مزود
                </small>
              </div>
              <div>
                <span>إصابات</span>
                <strong>
                  {scorecard.providerCorrect}
                </strong>
                <small>
                  اتجاه صحيح
                </small>
              </div>
              <div>
                <span>Brier</span>
                <strong>
                  {scorecard.providerBrierScore ??
                    "—"}
                </strong>
                <small>
                  الأقل أفضل
                </small>
              </div>
            </div>

            {symbolJournal.length > 0 ? (
              <div className="analyst-journal-list">
                {symbolJournal
                  .slice(0, 5)
                  .map((record) => (
                    <div
                      key={record.id}
                      className={
                        `analyst-journal-row ${record.status}`
                      }
                    >
                      <div>
                        <strong>
                          {outcomeLabel(
                            record.expectedOutcome,
                          )}{" "}
                          {record.expectedProbability}%
                        </strong>
                        <small>
                          {new Date(
                            record.generatedAt *
                              1000,
                          ).toLocaleDateString(
                            "ar-SA",
                          )}
                          {" · "}
                          {record.dataMode ===
                          "provider"
                            ? "Provider"
                            : "Demo"}
                        </small>
                      </div>

                      <div>
                        {record.status ===
                        "resolved" ? (
                          <>
                            <strong>
                              {record.correct
                                ? "✓ صحيح"
                                : "× مختلف"}
                            </strong>
                            <small>
                              {record.realizedReturnPercent !==
                                undefined &&
                              record.realizedReturnPercent >
                                0
                                ? "+"
                                : ""}
                              {record.realizedReturnPercent ??
                                0}
                              % ·{" "}
                              {record.realizedOutcome
                                ? outcomeLabel(
                                    record.realizedOutcome,
                                  )
                                : "—"}
                            </small>
                          </>
                        ) : (
                          <>
                            <strong>
                              قيد التحقق
                            </strong>
                            <small>
                              حتى{" "}
                              {new Date(
                                record.dueAt *
                                  1000,
                              ).toLocaleDateString(
                                "ar-SA",
                              )}
                            </small>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}

            <p>
              الدقة الرسمية تحسب فقط
              توقعات <b>بيانات المزود</b>.
              نتائج Demo تبقى في السجل
              للتجربة ولا تدخل في نسبة
              الدقة.
            </p>
          </div>

          <div className="analyst-levels">
            <div>
              <span>السعر المرجعي</span>
              <strong>
                {formatPrice(
                  result.referencePrice,
                )}
              </strong>
            </div>
            <div>
              <span>الدعم</span>
              <strong>
                {formatPrice(
                  result.support,
                )}
              </strong>
            </div>
            <div>
              <span>المقاومة</span>
              <strong>
                {formatPrice(
                  result.resistance,
                )}
              </strong>
            </div>
            <div>
              <span>النطاق المتوقع</span>
              <strong>
                {formatPrice(
                  result.expectedRangeLow,
                )}
                {" – "}
                {formatPrice(
                  result.expectedRangeHigh,
                )}
              </strong>
            </div>
          </div>

          <div className="analyst-section-title">
            <strong>
              السيناريوهات
            </strong>
            <small>
              مجموع الاحتمالات 100%
            </small>
          </div>

          <div className="analyst-scenarios">
            {result.scenarios.map(
              (scenario) => (
                <article
                  key={scenario.id}
                  className={
                    `analyst-scenario ${scenario.id}`
                  }
                >
                  <header>
                    <strong>
                      {scenario.label}
                    </strong>
                    <b>
                      {
                        scenario.probability
                      }%
                    </b>
                  </header>

                  <div className="analyst-probability-track">
                    <span
                      style={{
                        width:
                          `${scenario.probability}%`,
                      }}
                    />
                  </div>

                  <div className="analyst-target">
                    <span>
                      المنطقة المستهدفة
                    </span>
                    <strong>
                      {formatPrice(
                        scenario.targetLow,
                      )}
                      {" – "}
                      {formatPrice(
                        scenario.targetHigh,
                      )}
                    </strong>
                  </div>

                  <p>
                    <b>Trigger:</b>{" "}
                    {scenario.trigger}
                  </p>
                  <p>
                    <b>Invalidation:</b>{" "}
                    {scenario.invalidation}
                  </p>

                  {scenario.rationale.map(
                    (
                      rationale,
                      index,
                    ) => (
                      <small
                        key={
                          `${scenario.id}-${index}`
                        }
                      >
                        • {rationale}
                      </small>
                    ),
                  )}
                </article>
              ),
            )}
          </div>

          {result.catalysts.length >
          0 ? (
            <>
              <div className="analyst-section-title">
                <strong>
                  محفزات ومخاطر قريبة
                </strong>
                <small>
                  أحداث وإفصاحات متاحة
                </small>
              </div>

              <div className="analyst-catalysts">
                {result.catalysts.map(
                  (
                    catalyst,
                    index,
                  ) => (
                    <div
                      key={
                        `${catalyst.kind}-${index}`
                      }
                    >
                      <span>
                        {catalyst.kind ===
                        "event"
                          ? "حدث"
                          : "إفصاح"}
                      </span>
                      <strong>
                        {
                          catalyst.title
                        }
                      </strong>
                      <small>
                        {catalyst.date ??
                          "—"}
                        {" · "}
                        {
                          catalyst.source
                        }
                      </small>
                    </div>
                  ),
                )}
              </div>
            </>
          ) : null}

          <div className="analyst-section-title">
            <strong>
              لماذا؟
            </strong>
            <small>
              الأدلة المستخدمة
            </small>
          </div>

          <div className="analyst-evidence">
            {result.evidence.map(
              (item, index) => (
                <p
                  key={
                    `evidence-${index}`
                  }
                >
                  {item}
                </p>
              ),
            )}
          </div>

          <div className="analyst-uncertainty">
            {result.uncertaintyNote}
          </div>
        </>
      ) : null}
    </section>
  );
}
