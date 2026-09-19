import assert from "node:assert/strict";
import { DemoFeedProvider } from "../services/api/dist/src/feed/demoFeedProvider.js";

const provider = new DemoFeedProvider();
const symbols = [
  {
    id: "XNAS:AAPL",
    ticker: "AAPL",
    name: "Apple Inc.",
    exchange: "NASDAQ",
    micCode: "XNAS",
    assetClass: "stock",
    currency: "USD",
  },
  {
    id: "XSAU:2222",
    ticker: "2222",
    name: "Saudi Aramco",
    exchange: "Saudi Exchange",
    micCode: "XSAU",
    country: "Saudi Arabia",
    assetClass: "stock",
    currency: "SAR",
  },
];

const releases = await provider.getFeed({
  symbols,
  outputSize: 3,
});

assert.equal(releases.length, 4, "Demo feed should return two sample releases per symbol");
assert.ok(releases.every((release) => release.source === "demo-company-feed"));
assert.ok(releases.every((release) => release.bodyText.includes("not a real corporate announcement")));
assert.ok(releases.some((release) => release.symbol === "AAPL"));
assert.ok(releases.some((release) => release.symbol === "2222"));
assert.ok(
  releases.every((release, index) =>
    index === 0 || releases[index - 1].datetime >= release.datetime,
  ),
  "Demo feed should be sorted newest-first",
);

console.log(`Company feed smoke passed: ${releases.length} demo releases`);
