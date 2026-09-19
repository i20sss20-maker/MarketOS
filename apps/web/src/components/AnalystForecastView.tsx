import type {
  AnalystForecastResponse,
} from "@marketos/market-core";

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

export default function AnalystForecastView({
  result,
  loading,
  error,
  ticker,
  onRun,
  formatPrice,
}: Props) {
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
