import assert from "node:assert/strict";
import { DemoEventsProvider } from "../services/api/dist/src/events/demoEventsProvider.js";

const provider = new DemoEventsProvider();
const events = await provider.getEvents({
  startDate: "2026-09-19",
  endDate: "2026-09-26",
  symbols: ["AAPL", "2222", "NVDA"],
});

assert.equal(events.length, 3, "Demo events provider should return one sample event per requested symbol");
assert.ok(events.every((event) => event.type === "earnings"), "Demo events should be earnings events");
assert.ok(events.every((event) => event.source === "demo-events"), "Demo events should identify their source");
assert.ok(
  events.every((event) => event.date >= "2026-09-19" && event.date <= "2026-09-26"),
  "Every event should stay inside the requested range",
);

console.log(`Market events smoke test passed: ${events.length} events from ${provider.id}`);
