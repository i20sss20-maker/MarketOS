import assert from "node:assert/strict";
import {
  createPaperAccount,
  ensurePaperWallet,
  executePaperOrder,
  getPaperSnapshot,
  resetPaperAccount,
  setPaperCommission,
  updatePaperLastPrices,
} from "../packages/paper-core/dist/index.js";

const aapl = {
  id: "XNAS:AAPL",
  ticker: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  micCode: "XNAS",
  assetClass: "stock",
  currency: "USD",
};

const aramco = {
  id: "XSAU:2222",
  ticker: "2222",
  name: "Saudi Aramco",
  exchange: "Saudi Exchange",
  micCode: "XSAU",
  country: "Saudi Arabia",
  assetClass: "stock",
  currency: "SAR",
};

let account = createPaperAccount({ USD: 100_000, SAR: 100_000 }, 10);

assert.equal(account.wallets.USD.cash, 100_000);
assert.equal(account.wallets.SAR.cash, 100_000);
assert.equal(account.commissionBps, 10);

account = executePaperOrder(account, {
  symbol: aapl,
  side: "buy",
  quantity: 10,
  price: 100,
  executedAt: 1_700_000_000_000,
  orderId: "buy-aapl-1",
});

assert.equal(account.orders.length, 1);
assert.equal(account.orders[0].commission, 1);
assert.ok(Math.abs(account.wallets.USD.cash - 98_999) < 1e-9);
assert.equal(account.positions.length, 1);
assert.ok(Math.abs(account.positions[0].averageCost - 100.1) < 1e-9);
assert.equal(account.positions[0].quantity, 10);
assert.equal(account.wallets.SAR.cash, 100_000, "SAR wallet must remain untouched by USD trade");

let snapshot = getPaperSnapshot(account, "USD", {
  [aapl.id]: 110,
});

assert.ok(Math.abs(snapshot.marketValue - 1_100) < 1e-9);
assert.ok(Math.abs(snapshot.unrealizedPnl - 99) < 1e-9);
assert.ok(Math.abs(snapshot.equity - 100_099) < 1e-9);
assert.ok(Math.abs(snapshot.totalPnl - 99) < 1e-9);
assert.ok(snapshot.returnPercent > 0);

account = executePaperOrder(account, {
  symbol: aapl,
  side: "sell",
  quantity: 4,
  price: 110,
  executedAt: 1_700_000_100_000,
  orderId: "sell-aapl-1",
});

assert.equal(account.positions[0].quantity, 6);
assert.ok(Math.abs(account.wallets.USD.realizedPnl - 39.16) < 1e-9);
assert.ok(Math.abs(account.wallets.USD.cash - 99_438.56) < 1e-9);

snapshot = getPaperSnapshot(account, "USD", {
  [aapl.id]: 110,
});

assert.ok(Math.abs(snapshot.realizedPnl - 39.16) < 1e-9);
assert.ok(Math.abs(snapshot.unrealizedPnl - 59.4) < 1e-9);
assert.ok(Math.abs(snapshot.totalPnl - 98.56) < 1e-9);

account = updatePaperLastPrices(account, {
  [aapl.id]: 105.5,
});
assert.equal(account.positions[0].lastPrice, 105.5);

assert.throws(
  () => executePaperOrder(account, {
    symbol: aapl,
    side: "sell",
    quantity: 7,
    price: 105,
  }),
  /Cannot sell more/,
);

assert.throws(
  () => executePaperOrder(account, {
    symbol: aapl,
    side: "buy",
    quantity: 100_000,
    price: 1_000,
  }),
  /Insufficient USD paper cash/,
);

assert.throws(
  () => setPaperCommission(account, 501),
  /between 0 and 500 bps/,
);

account = executePaperOrder(account, {
  symbol: aramco,
  side: "buy",
  quantity: 100,
  price: 30,
  executedAt: 1_700_000_200_000,
  orderId: "buy-aramco-1",
});

const sarSnapshot = getPaperSnapshot(account, "SAR", {
  [aramco.id]: 31,
});
assert.equal(sarSnapshot.positions.length, 1);
assert.equal(sarSnapshot.positions[0].symbol.ticker, "2222");
assert.ok(sarSnapshot.cash < 100_000);
assert.ok(account.wallets.USD.cash > 99_000);

const withEur = ensurePaperWallet(account, "EUR", 50_000);
assert.equal(withEur.wallets.EUR.initialCash, 50_000);
assert.equal(withEur.wallets.EUR.cash, 50_000);

const reset = resetPaperAccount(account);
assert.equal(reset.positions.length, 0);
assert.equal(reset.orders.length, 0);
assert.equal(reset.wallets.USD.cash, reset.wallets.USD.initialCash);
assert.equal(reset.wallets.SAR.cash, reset.wallets.SAR.initialCash);
assert.equal(reset.commissionBps, 10);

console.log(
  `Paper Trading smoke passed: USD equity=${snapshot.equity.toFixed(2)}, SAR equity=${sarSnapshot.equity.toFixed(2)}, orders=${account.orders.length}`,
);
