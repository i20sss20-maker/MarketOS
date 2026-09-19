import {
  createPaperAccount,
  type PaperAccountState,
} from "@marketos/paper-core";

const STORAGE_KEY = "marketos:paper-account";

function safeStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidAccount(value: unknown): value is PaperAccountState {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<PaperAccountState>;

  return account.version === 1 &&
    Number.isFinite(account.commissionBps) &&
    Boolean(account.wallets) &&
    Array.isArray(account.positions) &&
    Array.isArray(account.orders);
}

export function loadPaperAccount(): PaperAccountState {
  const storage = safeStorage();
  if (!storage) return createPaperAccount();

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createPaperAccount();

    const parsed = JSON.parse(raw) as unknown;
    return isValidAccount(parsed)
      ? parsed
      : createPaperAccount();
  } catch {
    return createPaperAccount();
  }
}

export function savePaperAccount(account: PaperAccountState) {
  const storage = safeStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(account));
  } catch {
    // Ignore restricted storage environments.
  }
}
