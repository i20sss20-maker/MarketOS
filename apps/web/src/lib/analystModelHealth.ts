import {
  buildForecastPerformance,
  type ForecastPerformanceReport,
  type ForecastPerformanceSampleStatus,
} from "./forecastPerformance";
import type {
  ForecastJournalRecord,
} from "./forecastJournal";

export type AnalystModelHealthStatus =
  | "learning"
  | "healthy"
  | "watch"
  | "degraded";

export type AnalystModelHealth = {
  engine: string | null;
  status:
    AnalystModelHealthStatus;
  resolved: number;
  sampleStatus:
    ForecastPerformanceSampleStatus | null;
  accuracy: number | null;
  accuracyLow95: number | null;
  accuracyHigh95: number | null;
  brierScore: number | null;
  driftStatus:
    ForecastPerformanceReport["drift"]["status"];
  driftAccuracyDelta:
    number | null;
  driftBrierDelta:
    number | null;
  reliabilityStatus:
    ForecastPerformanceReport["reliability"]["status"];
  reliabilityEce:
    number | null;
  reliabilityResolved:
    number;
  notes: string[];
};

function fromReport(
  report:
    ForecastPerformanceReport,
): AnalystModelHealth {
  const current =
    report.currentEnginePerformance;

  if (
    !report.currentEngine ||
    !current
  ) {
    return {
      engine:
        report.currentEngine,
      status: "learning",
      resolved: 0,
      sampleStatus: null,
      accuracy: null,
      accuracyLow95: null,
      accuracyHigh95: null,
      brierScore: null,
      driftStatus:
        report.drift.status,
      driftAccuracyDelta:
        report.drift
          .accuracyDelta,
      driftBrierDelta:
        report.drift
          .brierDelta,
      reliabilityStatus:
        report.reliability
          .status,
      reliabilityEce:
        report.reliability
          .ece,
      reliabilityResolved:
        report.reliability
          .resolved,
      notes: [
        "المحرك الحالي لا يملك نتائج Provider محسومة بعد.",
      ],
    };
  }

  const notes: string[] = [];

  if (current.resolved < 5) {
    notes.push(
      `العينة ما زالت صغيرة: ${current.resolved}/5 قبل اعتماد أداء المحرك الحالي في Home.`,
    );
  }

  if (
    report.drift.status ===
    "insufficient"
  ) {
    notes.push(
      `Drift يحتاج 12 نتيجة محسومة؛ المتاح ${current.resolved}.`,
    );
  }

  if (
    report.reliability.status ===
    "insufficient"
  ) {
    notes.push(
      `معايرة الاحتمالات تحتاج 20 نتيجة؛ المتاح ${report.reliability.resolved}.`,
    );
  }

  if (
    report.drift.status ===
    "degrading"
  ) {
    notes.push(
      "الأداء الحديث أضعف من خط الأساس وفق Drift Monitor.",
    );
  } else if (
    report.drift.status ===
    "watch"
  ) {
    notes.push(
      "Drift Monitor يرصد تغيرًا يستحق المتابعة.",
    );
  } else if (
    report.drift.status ===
    "improving"
  ) {
    notes.push(
      "الأداء الحديث يتحسن مقابل خط الأساس.",
    );
  }

  if (
    report.reliability.status ===
    "poor"
  ) {
    notes.push(
      `معايرة الاحتمالات ضعيفة حاليًا؛ ECE ${report.reliability.ece ?? "—"}.`,
    );
  } else if (
    report.reliability.status ===
    "watch"
  ) {
    notes.push(
      `معايرة الاحتمالات تحتاج مراقبة؛ ECE ${report.reliability.ece ?? "—"}.`,
    );
  } else if (
    report.reliability.status ===
    "good"
  ) {
    notes.push(
      `معايرة الاحتمالات جيدة؛ ECE ${report.reliability.ece ?? "—"}.`,
    );
  }

  let status:
    AnalystModelHealthStatus =
    "learning";

  if (
    report.drift.status ===
      "degrading" ||
    report.reliability.status ===
      "poor"
  ) {
    status = "degraded";
  } else if (
    report.drift.status ===
      "watch" ||
    report.reliability.status ===
      "watch"
  ) {
    status = "watch";
  } else if (
    current.resolved >= 20 &&
    report.reliability.status ===
      "good" &&
    (
      report.drift.status ===
        "stable" ||
      report.drift.status ===
        "improving"
    )
  ) {
    status = "healthy";
  } else {
    status = "learning";
  }

  if (
    notes.length === 0
  ) {
    notes.push(
      "لا توجد إشارات جودة سلبية بارزة في العينة الحالية.",
    );
  }

  return {
    engine:
      report.currentEngine,
    status,
    resolved:
      current.resolved,
    sampleStatus:
      current.sampleStatus,
    accuracy:
      current.accuracy,
    accuracyLow95:
      current.accuracyLow95,
    accuracyHigh95:
      current.accuracyHigh95,
    brierScore:
      current.brierScore,
    driftStatus:
      report.drift.status,
    driftAccuracyDelta:
      report.drift
        .accuracyDelta,
    driftBrierDelta:
      report.drift
        .brierDelta,
    reliabilityStatus:
      report.reliability
        .status,
    reliabilityEce:
      report.reliability
        .ece,
    reliabilityResolved:
      report.reliability
        .resolved,
    notes:
      notes.slice(0, 4),
  };
}

export function buildAnalystModelHealth(
  records:
    ForecastJournalRecord[],
): AnalystModelHealth {
  return fromReport(
    buildForecastPerformance(
      records,
    ),
  );
}
