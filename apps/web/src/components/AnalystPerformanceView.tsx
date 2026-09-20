import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  MarketSymbol,
} from "@marketos/market-core";
import {
  buildForecastPerformance,
} from "../lib/forecastPerformance";
import {
  loadForecastJournal,
  saveForecastJournal,
  type ForecastJournalRecord,
  type ForecastOutcome,
} from "../lib/forecastJournal";
import {
  refreshMaturedForecasts,
} from "../lib/forecastMonitor";

type Props = {
  onSelectSymbol:
    (symbol: MarketSymbol) =>
      void;
};

const AUTO_CHECK_KEY =
  "marketos:forecast-performance-last-check";
const AUTO_CHECK_INTERVAL =
  10 * 60 * 1000;

function outcomeLabel(
  outcome: ForecastOutcome,
) {
  if (outcome === "bull") {
    return "صاعد";
  }

  if (outcome === "bear") {
    return "هابط";
  }

  return "محايد";
}

function signed(
  value:
    number | null | undefined,
  suffix = "",
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function dateLabel(
  timestamp?: number,
) {
  if (!timestamp) return "—";

  return new Date(
    timestamp * 1000,
  ).toLocaleDateString(
    "ar-SA",
    {
      month: "short",
      day: "numeric",
    },
  );
}

export default function AnalystPerformanceView({
  onSelectSymbol,
}: Props) {
  const [
    records,
    setRecords,
  ] = useState<
    ForecastJournalRecord[]
  >(
    () =>
      loadForecastJournal(),
  );
  const [
    checking,
    setChecking,
  ] = useState(false);
  const [
    checkMessage,
    setCheckMessage,
  ] = useState<
    string | null
  >(null);
  const [
    checkError,
    setCheckError,
  ] = useState<
    string | null
  >(null);

  const performance =
    useMemo(
      () =>
        buildForecastPerformance(
          records,
        ),
      [records],
    );

  const legacyMatured =
    useMemo(
      () => {
        const now =
          Math.floor(
            Date.now() / 1000,
          );

        return records.filter(
          (record) =>
            record.status ===
              "pending" &&
            record.dueAt <= now &&
            (
              !record.symbol ||
              !record.evaluationTimeframe
            ),
        ).length;
      },
      [records],
    );

  const checkMatured =
    useCallback(
      async (
        automatic = false,
      ) => {
        if (checking) return;

        setChecking(true);
        setCheckError(null);

        if (!automatic) {
          setCheckMessage(null);
        }

        try {
          const result =
            await refreshMaturedForecasts(
              records,
            );

          setRecords(
            result.records,
          );
          saveForecastJournal(
            result.records,
          );

          if (
            typeof window !==
            "undefined"
          ) {
            window.localStorage.setItem(
              AUTO_CHECK_KEY,
              String(Date.now()),
            );
          }

          setCheckMessage(
            result.checkedSymbols ===
            0
              ? `لا توجد توقعات ناضجة قابلة للتحقق الآن · ${result.status.mode === "provider" ? result.status.provider : "Demo"}`
              : [
                  `تم فحص ${result.checkedSymbols} رمز`,
                  `حُسم ${result.resolvedRecords} توقع`,
                  result.resolvedByCandles > 0
                    ? `أفق تاريخي ${result.resolvedByCandles}`
                    : "",
                  result.resolvedByLegacyQuote > 0
                    ? `Legacy ${result.resolvedByLegacyQuote}`
                    : "",
                  result.failures.length >
                  0
                    ? `تعذر ${result.failures.length}`
                    : "",
                  result.status.mode ===
                  "provider"
                    ? result.status.provider
                    : "Demo",
                ]
                  .filter(Boolean)
                  .join(" · "),
          );
        } catch (error) {
          setCheckError(
            error instanceof Error
              ? error.message
              : "تعذر تحديث نتائج التوقعات.",
          );
        } finally {
          setChecking(false);
        }
      },
      [checking, records],
    );

  useEffect(() => {
    const now =
      Math.floor(
        Date.now() / 1000,
      );
    const hasMatured =
      records.some(
        (record) =>
          record.status ===
            "pending" &&
          Boolean(record.symbol) &&
          record.dueAt <= now,
      );

    if (!hasMatured) {
      return;
    }

    let last = 0;

    try {
      last =
        Number(
          window.localStorage.getItem(
            AUTO_CHECK_KEY,
          ),
        ) || 0;
    } catch {
      last = 0;
    }

    if (
      Date.now() - last <
      AUTO_CHECK_INTERVAL
    ) {
      return;
    }

    void checkMatured(true);
  }, []);

  return (
    <section
      className="analyst-performance"
      dir="rtl"
    >
      <div className="analyst-performance-hero">
        <div>
          <span>
            ANALYST PERFORMANCE
          </span>
          <h2>
            أداء المحلل عبر الزمن
          </h2>
          <p>
            يقيس توقعات بيانات المزود
            بعد عدد الشموع الفعلي نفسه
            المستخدم في المعايرة، وليس
            بعد عدد أيام تقويمية أو بسعر
            اليوم.
          </p>
        </div>

        <button
          onClick={() =>
            void checkMatured(
              false,
            )
          }
          disabled={checking}
        >
          {checking
            ? "جاري التحقق…"
            : "تحقق الآن"}
        </button>
      </div>

      {checkError ? (
        <div className="analyst-performance-error">
          {checkError}
        </div>
      ) : null}

      {checkMessage ? (
        <div className="analyst-performance-message">
          {checkMessage}
        </div>
      ) : null}

      <div className="analyst-performance-summary">
        <div>
          <span>الدقة</span>
          <strong>
            {performance.summary
              .providerAccuracy ===
            null
              ? "—"
              : `${performance.summary.providerAccuracy}%`}
          </strong>
          <small>
            {
              performance.summary
                .providerCorrect
            }
            /
            {
              performance.summary
                .providerResolved
            }
            {" "}
            صحيح
          </small>
        </div>

        <div>
          <span>Brier</span>
          <strong>
            {performance.summary
              .providerBrierScore ??
              "—"}
          </strong>
          <small>
            الأقل أفضل
          </small>
        </div>

        <div>
          <span>السلسلة</span>
          <strong>
            {
              performance
                .currentStreak
            }
          </strong>
          <small>
            أفضل{" "}
            {
              performance
                .bestStreak
            }
          </small>
        </div>

        <div>
          <span>قيد التحقق</span>
          <strong>
            {
              performance.summary
                .pending
            }
          </strong>
          <small>
            توقع محفوظ
          </small>
        </div>
      </div>

      <div className="analyst-performance-calibration">
        <header>
          <strong>
            معايرة الثقة
          </strong>
          <small>
            Provider فقط
          </small>
        </header>

        <div>
          <span>
            متوسط احتمال السيناريو الأعلى
          </span>
          <b>
            {performance
              .averageExpectedProbability ===
            null
              ? "—"
              : `${performance.averageExpectedProbability}%`}
          </b>
        </div>

        <div>
          <span>
            الدقة المحققة
          </span>
          <b>
            {performance.summary
              .providerAccuracy ===
            null
              ? "—"
              : `${performance.summary.providerAccuracy}%`}
          </b>
        </div>

        <div>
          <span>
            الفرق
          </span>
          <b>
            {signed(
              performance
                .calibrationGap,
              "%",
            )}
          </b>
        </div>

        <p>
          فرق قريب من الصفر يعني أن
          الاحتمالات المعروضة أقرب لما
          تحقق فعليًا. يحتاج هذا المقياس
          عينة كافية قبل الحكم عليه.
        </p>
      </div>

      <div className="analyst-performance-section-head">
        <strong>
          الأداء حسب الاتجاه
        </strong>
        <small>
          النتيجة المتوقعة
        </small>
      </div>

      <div className="analyst-performance-directions">
        {performance.directions.map(
          (item) => (
            <div
              key={item.outcome}
              className={
                `direction-${item.outcome}`
              }
            >
              <span>
                {outcomeLabel(
                  item.outcome,
                )}
              </span>
              <strong>
                {item.accuracy ===
                null
                  ? "—"
                  : `${item.accuracy}%`}
              </strong>
              <small>
                {item.correct}/
                {item.resolved}
                {" · "}
                احتمال{" "}
                {item.averageProbability ??
                  "—"}
                %
              </small>
            </div>
          ),
        )}
      </div>

      <div className="analyst-performance-section-head">
        <strong>
          حسب درجة الثقة
        </strong>
        <small>
          هل ترتفع الدقة مع الثقة؟
        </small>
      </div>

      <div className="analyst-confidence-buckets">
        {performance
          .confidenceBuckets
          .map(
            (bucket) => (
              <div
                key={bucket.id}
              >
                <header>
                  <span>
                    {bucket.label}
                  </span>
                  <b>
                    {bucket.accuracy ===
                    null
                      ? "—"
                      : `${bucket.accuracy}%`}
                  </b>
                </header>
                <div>
                  <span
                    style={{
                      width:
                        `${bucket.accuracy ?? 0}%`,
                    }}
                  />
                </div>
                <small>
                  {bucket.correct}/
                  {bucket.resolved}
                  {" "}
                  صحيح
                </small>
              </div>
            ),
          )}
      </div>

      {performance.symbols.length >
      0 ? (
        <>
          <div className="analyst-performance-section-head">
            <strong>
              حسب الرمز
            </strong>
            <small>
              أعلى عينة متاحة
            </small>
          </div>

          <div className="analyst-performance-symbols">
            {performance.symbols.map(
              (item) => {
                const record =
                  records.find(
                    (candidate) =>
                      candidate
                        .symbolId ===
                        item.symbolId &&
                      candidate
                        .symbol,
                  );

                return (
                  <button
                    key={
                      item.symbolId
                    }
                    disabled={
                      !record?.symbol
                    }
                    onClick={() => {
                      if (
                        record?.symbol
                      ) {
                        onSelectSymbol(
                          record.symbol,
                        );
                      }
                    }}
                  >
                    <span>
                      <strong>
                        {item.ticker}
                      </strong>
                      <small>
                        {item.correct}/
                        {item.resolved}
                        {" "}
                        صحيح
                      </small>
                    </span>
                    <span>
                      <b>
                        {item.accuracy}%
                      </b>
                      <small>
                        متوسط الحركة{" "}
                        {signed(
                          item.averageReturn,
                          "%",
                        )}
                      </small>
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </>
      ) : null}

      <div className="analyst-performance-section-head">
        <strong>
          آخر النتائج
        </strong>
        <small>
          توقعات مزود محسومة
        </small>
      </div>

      <div className="analyst-performance-recent">
        {performance.recent.map(
          (record) => (
            <div
              key={record.id}
              className={
                record.correct
                  ? "correct"
                  : "miss"
              }
            >
              <span>
                <strong>
                  {record.ticker}
                </strong>
                <small>
                  {outcomeLabel(
                    record
                      .expectedOutcome,
                  )}
                  {" "}
                  {
                    record.expectedProbability
                  }
                  %
                </small>
              </span>

              <span>
                <strong>
                  {record.correct
                    ? "✓ تحقق"
                    : "× لم يتحقق"}
                </strong>
                <small>
                  {signed(
                    record
                      .realizedReturnPercent,
                    "%",
                  )}
                  {" · "}
                  {dateLabel(
                    record
                      .evaluatedAt,
                  )}
                  {" · "}
                  {record.evaluationMethod ===
                  "horizon-bars"
                    ? "عدد الشموع"
                    : record.evaluationMethod ===
                        "horizon-candle"
                      ? "أفق زمني V2"
                      : "Legacy"}
                </small>
              </span>
            </div>
          ),
        )}

        {performance.recent.length ===
        0 ? (
          <div className="analyst-performance-empty">
            ما فيه توقعات Provider محسومة
            إلى الآن. مع الاستخدام يبدأ
            السجل ببناء عينة فعلية.
          </div>
        ) : null}
      </div>

      {legacyMatured > 0 ? (
        <div className="analyst-performance-legacy">
          يوجد{" "}
          {legacyMatured}
          {" "}
          توقع قديم من قبل نظام تقييم
          الأفق الدقيق. يُستخدم له
          fallback متوافق مع السجل
          القديم.
        </div>
      ) : null}

      <footer className="analyst-performance-note">
        التوقعات الجديدة تُقيّم بعد
        عدد الشموع الفعلي المحدد وقت
        التوقع، لذلك الويكند والعطل لا
        تختصر الأفق. السجلات V2 القديمة
        تبقى متوافقة، ونتائج Demo لا
        تدخل في الدقة الرسمية.
      </footer>
    </section>
  );
}
