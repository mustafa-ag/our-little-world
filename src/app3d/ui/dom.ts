// Tiny DOM + lifecycle helpers for the HTML overlay UI.
import type { EventEmitter, Listener } from "../../core/events";

type Attrs = {
  class?: string;
  text?: string;
  html?: never; // never inject raw HTML — game text is always set via textContent
  attrs?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
};

/** Create an element with optional class / text / attributes and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: Attrs = {},
  children: (Node | string | null | undefined | false)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.style) Object.assign(node.style, opts.style);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

/** A <button type="button"> with a click handler registered on the disposer. */
export function button(d: Disposer, label: string, cls: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const b = el("button", { class: cls, text: label, attrs: { type: "button" } });
  d.listen(b, "click", onClick);
  return b;
}

/**
 * Collects every side effect (DOM listeners, emitter listeners, timers,
 * nodes) so one `dispose()` call reliably tears everything down.
 */
export class Disposer {
  private fns = new Set<() => void>();
  private disposed = false;

  /** Register a teardown; returns a function that unregisters it. */
  add(fn: () => void): () => void {
    if (this.disposed) {
      fn();
      return () => {};
    }
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }

  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.add(() => target.removeEventListener(type, fn, opts));
  }

  /** Subscribe to one of the game's EventEmitters (store / uiEvents). */
  on(emitter: EventEmitter, event: string, fn: Listener) {
    emitter.on(event, fn);
    this.add(() => emitter.off(event, fn));
  }

  /** setTimeout that is cleared on dispose (and forgotten once it fires). */
  timeout(fn: () => void, ms: number): () => void {
    const id = window.setTimeout(() => {
      forget();
      fn();
    }, ms);
    const forget = this.add(() => window.clearTimeout(id));
    return () => {
      window.clearTimeout(id);
      forget();
    };
  }

  interval(fn: () => void, ms: number): number {
    const id = window.setInterval(fn, ms);
    this.add(() => window.clearInterval(id));
    return id;
  }

  /** Remove a node from the DOM on dispose. */
  node<T extends Node>(n: T): T {
    this.add(() => n.parentNode?.removeChild(n));
    return n;
  }

  /** A scoped disposer (e.g. one open modal) torn down with its parent too. */
  child(): Disposer {
    const c = new Disposer();
    c.add(this.add(() => c.dispose()));
    return c;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const fns = [...this.fns].reverse();
    this.fns.clear();
    for (const fn of fns) {
      try {
        fn();
      } catch {
        /* keep tearing down */
      }
    }
  }
}

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True for phones/tablets: coarse primary pointer or any touch points. */
export function isTouchDevice() {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return coarse || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0 && !matchMedia("(pointer: fine)").matches);
}

/** Strip a legacy "A · " button hint prefix from 2D prompt strings. */
export function cleanPrompt(p: string) {
  return p.replace(/^[A-Z]\s*·\s*/, "");
}

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  heart: "M12 21s-7.5-4.6-9.6-9.2C.9 8.6 2.9 4.5 6.7 4.5c2.2 0 3.6 1.2 4.4 2.5.8-1.3 2.2-2.5 4.4-2.5 3.8 0 5.8 4.1 4.3 7.3C18.6 16.4 12 21 12 21z",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2.4a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2zm0 1.7a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8z",
  phone: "M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zm0 3v12h8v-12H8zm3 13.2a1 1 0 1 0 2 0 1 1 0 0 0-2 0z",
  map: "M9 3.5 3.5 5.6v15l5.5-2.1 6 2.1 5.5-2.1v-15L15 5.6l-6-2.1zm.9 2.4 4.2 1.5v10.7l-4.2-1.5V5.9z",
  close: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z",
  sparkle: "M12 2.5l1.9 6.1 6.1 1.9-6.1 1.9L12 18.5l-1.9-6.1L4 10.5l6.1-1.9z",
} as const;
export type IconName = keyof typeof ICONS;

/** Inline SVG icon (fill = currentColor). */
export function icon(name: IconName, cls = "olw-icon"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", cls);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name]);
  path.setAttribute("fill", "currentColor");
  path.setAttribute("fill-rule", "evenodd");
  svg.appendChild(path);
  return svg;
}
