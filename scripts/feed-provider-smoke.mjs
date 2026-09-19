import assert from "node:assert/strict";
import { TwelveDataFeedProvider } from "../services/api/dist/src/feed/twelveDataFeedProvider.js";

const originalFetch = globalThis.fetch;
let calls = 0;
const requestedUrls = [];

globalThis.fetch = async (input) => {
  calls += 1;
  const url = new URL(String(input));
  requestedUrls.push(url);

  assert.equal(url.pathname, "/press_releases");
  assert.equal(url.searchParams.get("apikey"), "mock-company-feed-key");
  assert.equal(url.searchParams.get("outputsize"), "3");
  assert.equal(url.searchParams.get("page"), "1");

  const symbol = url.searchParams.get("symbol") ?? "UNKNOWN";
  const isApple = symbol === "AAPL";

  const body = isApple
    ? '<script>window.evil=true</script><style>.x{display:none}</style><p>Revenue &amp; outlook improved.</p><br><ul><li>Item one</li></ul>'
    : '<p>GPU platform update &quot;Blackwell&quot;.</p>';

  return new Response(JSON.stringify({
    press_releases: [
      {
        id: `release-${symbol}-1`,
        datetime: isApple ? "2026-09-19T11:00:00Z" : "2026-09-19T10:00:00Z",
        title: `${symbol} corporate release`,
        body,
        style: "full",
        language: ["en"],
      },
    ],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

try {
  const provider = new TwelveDataFeedProvider("mock-company-feed-key");

  const aapl = {
    id: "XNAS:AAPL",
    ticker: "AAPL",
    providerSymbol: "AAPL",
    name: "Apple Inc.",
    exchange: "NASDAQ",
    micCode: "XNAS",
    assetClass: "stock",
    currency: "USD",
  };

  const nvda = {
    id: "XNAS:NVDA",
    ticker: "NVDA",
    providerSymbol: "NVDA",
    name: "NVIDIA Corp.",
    exchange: "NASDAQ",
    micCode: "XNAS",
    assetClass: "stock",
    currency: "USD",
  };

  const [first, second] = await Promise.all([
    provider.getFeed({ symbols: [aapl], outputSize: 3 }),
    provider.getFeed({ symbols: [aapl], outputSize: 3 }),
  ]);

  assert.equal(calls, 1, "Concurrent identical feed loads should coalesce");
  assert.equal(first.length, 1);
  assert.equal(second[0]?.title, "AAPL corporate release");

  const bodyText = first[0].bodyText;
  assert.ok(bodyText.includes("Revenue & outlook improved."));
  assert.ok(bodyText.includes("Item one"));
  assert.ok(!bodyText.includes("<p>"));
  assert.ok(!bodyText.includes("<script"));
  assert.ok(!bodyText.includes("window.evil"));
  assert.ok(!bodyText.includes("<style"));
  assert.ok(!bodyText.includes(".x{display:none}"));

  await provider.getFeed({ symbols: [aapl], outputSize: 3 });
  assert.equal(calls, 1, "Warm feed cache should avoid another provider request");

  const combined = await provider.getFeed({
    symbols: [aapl, nvda],
    outputSize: 3,
  });

  assert.equal(calls, 2, "Only the uncached symbol should require another upstream request");
  assert.equal(combined.length, 2);
  assert.equal(combined[0].symbol, "AAPL", "Feed should remain newest-first");
  assert.equal(combined[1].symbol, "NVDA");
  assert.ok(combined[1].bodyText.includes('GPU platform update "Blackwell".'));

  const firstUrl = requestedUrls[0];
  assert.equal(firstUrl.searchParams.get("symbol"), "AAPL");
  assert.equal(firstUrl.searchParams.get("mic_code"), "XNAS");

  console.log(
    `Company feed provider smoke passed: upstream calls=${calls}, sanitized body length=${bodyText.length}`,
  );
} finally {
  globalThis.fetch = originalFetch;
}
