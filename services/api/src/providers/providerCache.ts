export class AsyncTtlCache<T> {
  private readonly values = new Map<string, { expiresAt: number; value: T }>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries = 250) {}

  async getOrLoad(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    if (cached) this.values.delete(key);

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const promise = loader()
      .then((value) => {
        this.values.set(key, {
          expiresAt: Date.now() + Math.max(0, ttlMs),
          value,
        });
        this.trim();
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, promise);
    return promise;
  }

  clear() {
    this.values.clear();
    this.pending.clear();
  }

  private trim() {
    if (this.values.size <= this.maxEntries) return;

    const entries = [...this.values.entries()]
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt);

    const removeCount = this.values.size - this.maxEntries;
    for (let index = 0; index < removeCount; index += 1) {
      this.values.delete(entries[index][0]);
    }
  }
}
