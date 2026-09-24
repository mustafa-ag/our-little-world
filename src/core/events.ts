// Tiny renderer-agnostic event emitter. API-compatible with the subset of
// Phaser.Events.EventEmitter (eventemitter3) that the game uses:
// on / once / off / emit / removeAllListeners, with optional `this` context.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Listener = (...args: any[]) => void;

interface Entry {
  fn: Listener;
  ctx: unknown;
  once: boolean;
}

export class EventEmitter {
  private events = new Map<string | symbol, Entry[]>();

  on(event: string | symbol, fn: Listener, ctx?: unknown): this {
    return this.add(event, fn, ctx, false);
  }

  addListener(event: string | symbol, fn: Listener, ctx?: unknown): this {
    return this.add(event, fn, ctx, false);
  }

  once(event: string | symbol, fn: Listener, ctx?: unknown): this {
    return this.add(event, fn, ctx, true);
  }

  /**
   * Remove listeners. With no `fn`, removes every listener for `event`.
   * Otherwise removes entries whose fn matches (and ctx, when given).
   */
  off(event: string | symbol, fn?: Listener, ctx?: unknown, once?: boolean): this {
    const list = this.events.get(event);
    if (!list) return this;
    if (!fn) {
      this.events.delete(event);
      return this;
    }
    const kept = list.filter(
      (e) => e.fn !== fn || (once && !e.once) || (ctx !== undefined && e.ctx !== ctx),
    );
    if (kept.length) this.events.set(event, kept);
    else this.events.delete(event);
    return this;
  }

  removeListener(event: string | symbol, fn?: Listener, ctx?: unknown, once?: boolean): this {
    return this.off(event, fn, ctx, once);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string | symbol, ...args: any[]): boolean {
    const list = this.events.get(event);
    if (!list || list.length === 0) return false;
    // snapshot so listeners added/removed during dispatch don't affect this emit
    const snapshot = list.slice();
    for (const e of snapshot) {
      if (e.once) this.off(event, e.fn, e.ctx, true);
      e.fn.apply(e.ctx, args);
    }
    return true;
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined) this.events.clear();
    else this.events.delete(event);
    return this;
  }

  listenerCount(event: string | symbol): number {
    return this.events.get(event)?.length ?? 0;
  }

  listeners(event: string | symbol): Listener[] {
    return (this.events.get(event) ?? []).map((e) => e.fn);
  }

  eventNames(): (string | symbol)[] {
    return [...this.events.keys()];
  }

  private add(event: string | symbol, fn: Listener, ctx: unknown, once: boolean): this {
    if (typeof fn !== "function") throw new TypeError("The listener must be a function");
    const entry: Entry = { fn, ctx: ctx ?? this, once };
    const list = this.events.get(event);
    if (list) list.push(entry);
    else this.events.set(event, [entry]);
    return this;
  }
}
