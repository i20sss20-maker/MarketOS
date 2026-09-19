import {
  app,
  type InvocationContext,
  type Timer,
} from "@azure/functions";
import { runAlertSweep } from "../alertSweep.js";

const schedule =
  process.env.ALERT_SWEEP_SCHEDULE?.trim() ||
  "0 */5 * * * *";

export async function alertSweepTimer(
  timer: Timer,
  context: InvocationContext,
): Promise<void> {
  if (timer.isPastDue) {
    context.warn("MarketOS alert sweep timer is running late.");
  }

  const startedAt = Date.now();

  const summary = await runAlertSweep();

  context.log(
    "MarketOS alert sweep completed",
    {
      pages: summary.pages,
      processedUsers: summary.processedUsers,
      checkedGroups: summary.checkedGroups,
      triggeredCount: summary.triggeredCount,
      failureCount: summary.failureCount,
      cappedUsers: summary.cappedUsers,
      durationMs: Date.now() - startedAt,
    },
  );
}

app.timer("alertSweepTimer", {
  schedule,
  runOnStartup: false,
  useMonitor: true,
  handler: alertSweepTimer,
});
