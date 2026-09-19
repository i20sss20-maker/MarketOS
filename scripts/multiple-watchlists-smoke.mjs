import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "apps/web/src/lib/watchlistCollections.ts",
  "utf8",
);

for (const expected of [
  "loadWatchlistCollections",
  "createWatchlistCollection",
  "totalWatchlistItems",
  "updateCollectionSymbols",
  "renameWatchlistCollection",
]) {
  assert.ok(
    source.includes(expected),
    `Missing watchlist collection helper: ${expected}`,
  );
}

assert.ok(
  source.includes('"قائمتي"'),
  "Legacy migration should create the default Arabic watchlist",
);

console.log(
  "Multiple Watchlists source smoke passed: migration + collection helpers present",
);
