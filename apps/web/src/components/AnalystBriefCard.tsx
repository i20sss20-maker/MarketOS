import type {
  MarketSymbol,
} from "@marketos/market-core";
import type {
  AnalystBriefSnapshot,
} from "../lib/analystBrief";

type Props = {
  brief:
    AnalystBriefSnapshot;
  refreshing:
    | "radar"
    | "performance"
    | null;
  onSelectSymbol:
    (symbol: MarketSymbol) =>
      void;
  onOpenAnalyst: () => void;
};

function directionLabel(
  direction:
    "bull" | "base" | "bear",
) {
  if (direction === "bull") {
    return "صاعد";
  }

  if (direction === "bear") {
    return "هابط";
  }

  return "محايد";
}

function changeLabel(
  change:
    NonNullable<
      AnalystBriefSnapshot[
        "topChange"
      ]
    >["change"],
) {
  if (
    change === "reversal"
  ) {
    return "انعكاس";
  }

  if (
    change ===
    "strengthening"
  ) {
    return "تقوّت";
  }

  if (
    change === "weakening"
  ) {
    return "ضعفت";
  }

  if (change === "new") {
    return "جديدة";
  }

  return "ثابتة";
}

function signed(
  value: number,
  suffix = "",
) {
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function attentionKindLabel(
  kind:
    AnalystBriefSnapshot["attention"]["items"][number]["kind"],
) {
  if (kind === "reversal") {
    return "انعكاس";
  }

  if (kind === "strengthening") {
    return "تقوّي";
  }

  if (kind === "watch-near") {
    return "قرب التفعيل";
  }

  if (kind === "catalyst") {
    return "Catalyst";
  }

  return "تحقق";
}

function performanceDriftLabel(
  status:
    AnalystBriefSnapshot["performance"]["driftStatus"],
) {
  if (status === "improving") {
    return "الأداء الحديث يتحسن";
  }

  if (status === "watch") {
    return "الأداء تحت المراقبة";
  }

  if (status === "degrading") {
    return "الأداء الحديث يتدهور";
  }

  if (status === "stable") {
    return "الأداء مستقر";
  }

  return "Drift: عينة غير كافية";
}

function timeLabel(
  value: number | null,
) {
  if (!value) return "—";

  return new Date(
    value,
  ).toLocaleTimeString(
    "ar-SA",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

export default function AnalystBriefCard({
  brief,
  refreshing,
  onSelectSymbol,
  onOpenAnalyst,
}: Props) {
  return (
    <section className="home-dashboard-card home-analyst-brief">
      <div className="home-dashboard-card-head home-analyst-brief-head">
        <div>
          <span>
            MARKETOS ANALYST BRIEF
          </span>
          <strong>
            الملخص الذكي
          </strong>
          <small>
            Radar · Forecast Watch ·
            Catalyst · Performance
          </small>
        </div>

        <div className="home-analyst-brief-head-actions">
          <span
            className={
              refreshing
                ? "refreshing"
                : ""
            }
          >
            {refreshing ===
            "radar"
              ? "Radar يحدّث…"
              : refreshing ===
                  "performance"
                ? "النتائج تتحقق…"
                : (
                    <>
                      Radar{" "}
                      {brief.radarUpdatedAt
                        ? timeLabel(
                            brief.radarUpdatedAt,
                          )
                        : "غير مفحوص"}
                    </>
                  )}
          </span>
          <button
            onClick={
              onOpenAnalyst
            }
          >
            فتح المحلل ←
          </button>
        </div>
      </div>

      {!brief.available ? (
        <div className="home-analyst-brief-empty">
          <div>
            <strong>
              ابنِ أول لقطة Analyst
            </strong>
            <small>
              شغّل Radar أو تحليل أصل؛
              بعدها يبدأ الملخص يجمع
              التغيّرات والدقة والمحفزات.
            </small>
          </div>
          <button
            onClick={
              onOpenAnalyst
            }
          >
            فتح MarketOS Analyst
          </button>
        </div>
      ) : (
        <div className="home-analyst-brief-grid">
          <div className="home-analyst-brief-block primary">
            <span>
              أقوى حالة الآن
            </span>
            {brief.topSetup ? (
              <button
                onClick={() =>
                  onSelectSymbol(
                    brief.topSetup!
                      .symbol,
                  )
                }
              >
                <strong>
                  {
                    brief.topSetup
                      .symbol.ticker
                  }
                </strong>
                <b
                  className={
                    `direction-${brief.topSetup.direction}`
                  }
                >
                  {directionLabel(
                    brief.topSetup
                      .direction,
                  )}
                  {" "}
                  {
                    brief.topSetup
                      .probability
                  }
                  %
                </b>
                <small>
                  ثقة{" "}
                  {
                    brief.topSetup
                      .confidence
                  }
                  % · وضوح{" "}
                  {
                    brief.topSetup
                      .clarity
                  }
                  % ·{" "}
                  {brief.topSetup
                    .dataMode ===
                  "provider"
                    ? brief.topSetup
                        .provider
                    : "Demo"}
                </small>
              </button>
            ) : (
              <em>
                لا توجد لقطة Radar
              </em>
            )}
          </div>

          <div className="home-analyst-brief-block">
            <span>
              أهم تغيّر
            </span>
            {brief.topChange ? (
              <button
                onClick={() =>
                  onSelectSymbol(
                    brief.topChange!
                      .symbol,
                  )
                }
              >
                <strong>
                  {
                    brief.topChange
                      .symbol.ticker
                  }
                </strong>
                <b
                  className={
                    `change-${brief.topChange.change}`
                  }
                >
                  {changeLabel(
                    brief.topChange
                      .change,
                  )}
                </b>
                <small>
                  {brief.topChange
                    .change ===
                    "reversal" &&
                  brief.topChange
                    .previousDirection
                    ? `${directionLabel(
                        brief.topChange
                          .previousDirection,
                      )} → ${directionLabel(
                        brief.topChange
                          .currentDirection,
                      )}`
                    : `احتمال ${signed(
                        brief.topChange
                          .probabilityDelta,
                        "%",
                      )} · وضوح ${signed(
                        brief.topChange
                          .clarityDelta,
                      )}`}
                </small>
              </button>
            ) : (
              <em>
                لا يوجد تغيّر بارز
              </em>
            )}
          </div>

          <div className="home-analyst-brief-block">
            <span>
              Quant Catalyst
            </span>
            {brief.catalyst ? (
              <button
                onClick={() =>
                  onSelectSymbol(
                    brief.catalyst!
                      .symbol,
                  )
                }
              >
                <strong>
                  {
                    brief.catalyst
                      .symbol.ticker
                  }
                </strong>
                <b
                  className={
                    brief.catalyst
                      .direction ===
                    "positive"
                      ? "positive"
                      : "negative"
                  }
                >
                  {brief.catalyst
                    .direction ===
                  "positive"
                    ? "إيجابي"
                    : "سلبي"}
                </b>
                <small>
                  Score{" "}
                  {
                    brief.catalyst
                      .score
                  }
                  {" · "}
                  {brief.catalyst
                    .latestSurprisePercent !==
                  undefined
                    ? `Surprise ${signed(
                        brief.catalyst
                          .latestSurprisePercent,
                        "%",
                      )}`
                    : `${brief.catalyst.sampleSize} عينة`}
                </small>
              </button>
            ) : (
              <em>
                لا يوجد أثر كمي بارز
              </em>
            )}
          </div>

          <div className="home-analyst-brief-block performance">
            <span>
              أداء المحلل
            </span>
            <div>
              <strong>
                {brief.performance
                  .accuracy === null
                  ? "—"
                  : `${brief.performance.accuracy}%`}
              </strong>
              <b>
                {
                  brief.performance
                    .correct
                }
                /
                {
                  brief.performance
                    .resolved
                }
              </b>
              <small>
                {brief.performance.scope ===
                "current-engine"
                  ? "المحرك الحالي"
                  : "إجمالي التاريخ"}
                {brief.performance.engine
                  ? ` · ${brief.performance.engine}`
                  : ""}
                <br />
                {brief.performance.scope ===
                "current-engine"
                  ? brief.performance.accuracyLow95 !==
                      null &&
                    brief.performance.accuracyHigh95 !==
                      null
                    ? `95%: ${brief.performance.accuracyLow95}–${brief.performance.accuracyHigh95}% · `
                    : ""
                  : brief.performance.engine &&
                      brief.performance.currentEngineResolved <
                        5
                    ? `المحرك الحالي يجمع عينة ${brief.performance.currentEngineResolved}/5 · `
                    : ""}
                Brier{" "}
                {brief.performance
                  .brier ?? "—"}
                {" · "}
                قيد التحقق{" "}
                {
                  brief.performance
                    .pending
                }
                <br />
                {performanceDriftLabel(
                  brief.performance
                    .driftStatus,
                )}
                {brief.performance.driftAccuracyDelta !==
                null
                  ? ` · دقة ${signed(
                      brief.performance
                        .driftAccuracyDelta,
                      " نقطة",
                    )}`
                  : ""}
              </small>
            </div>
          </div>

          <div className="home-analyst-brief-block watch">
            <span>
              مراقبة السيناريو
            </span>
            <div>
              <strong>
                {brief.watchCount}
              </strong>
              <b>
                Forecast Watch
              </b>
              <small>
                تنبيهات نشطة تطابق
                مستويات سيناريوهات
                Radar الحالية
              </small>
            </div>
          </div>
        </div>
      )}

      {brief.attention.items.length > 0 ? (
        <div className="home-analyst-attention">
          <div className="home-analyst-attention-head">
            <div>
              <span>
                ATTENTION QUEUE
              </span>
              <strong>
                يحتاج انتباهك
              </strong>
            </div>
            <small>
              {brief.attention.criticalCount > 0
                ? `${brief.attention.criticalCount} عاجل`
                : `${brief.attention.items.length} حالة`}
            </small>
          </div>

          <div className="home-analyst-attention-list">
            {brief.attention.items.map(
              (item) => (
                <button
                  key={item.id}
                  className={
                    `attention-${item.kind}`
                  }
                  onClick={() =>
                    onSelectSymbol(
                      item.symbol,
                    )
                  }
                >
                  <span className="home-analyst-attention-symbol">
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
                      {item.dataMode
                        ? ` · ${item.dataMode === "provider" ? "Provider" : "Demo"}`
                        : ""}
                    </small>
                  </span>

                  <span className="home-analyst-attention-main">
                    <b>
                      {item.title}
                    </b>
                    <small>
                      {item.detail}
                    </small>
                  </span>

                  <span className="home-analyst-attention-kind">
                    {attentionKindLabel(
                      item.kind,
                    )}
                  </span>
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}

      <footer className="home-analyst-brief-footer">
        <span>
          Provider Radar{" "}
          {
            brief.radarProviderCount
          }
          {" · "}
          Demo{" "}
          {brief.radarDemoCount}
        </span>
        <span>
          الملخص معلوماتي واحتمالي؛
          لا ينفذ صفقات.
        </span>
      </footer>
    </section>
  );
}
