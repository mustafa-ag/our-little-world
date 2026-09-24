// One-at-a-time modal panel framework. Opening locks controls; closing
// unlocks them (unless a dialogue is still up). Esc / backdrop / × close.
import { button, el, icon, type Disposer } from "./dom";
import type { ModalKind, UIContext } from "./context";

export interface ModalOptions {
  kind: ModalKind;
  title: string;
  subtitle?: string;
  /** Build the body; `md` is disposed when the modal closes. */
  body: (md: Disposer, close: () => void) => Node;
  /** false = only explicit buttons close it (no backdrop / Esc / ×). */
  dismissable?: boolean;
  onClose?: () => void;
  className?: string;
}

export interface ModalHandle {
  close(): void;
}

export class ModalHost {
  private current: { kind: ModalKind; close: () => void; dismissable: boolean } | null = null;

  constructor(private ctx: UIContext) {
    ctx.d.add(() => this.closeAny());
  }

  get kind() {
    return this.current?.kind ?? null;
  }

  open(opts: ModalOptions): ModalHandle | null {
    const { ctx } = this;
    this.closeAny();
    const md = ctx.d.child();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (this.current?.close === close) this.current = null;
      if (ctx.modal === opts.kind) ctx.modal = null;
      backdrop.remove();
      md.dispose();
      ctx.changed();
      ctx.unlockIfIdle();
      opts.onClose?.();
    };

    const dismissable = opts.dismissable !== false;
    const head = el("header", { class: "olw-modal-head" }, [
      el("div", {}, [
        el("h2", { class: "olw-modal-title", text: opts.title }),
        opts.subtitle ? el("p", { class: "olw-modal-sub", text: opts.subtitle }) : null,
      ]),
    ]);
    if (dismissable) {
      const x = button(md, "", "olw-modal-x", () => close());
      x.setAttribute("aria-label", "Close");
      x.append(icon("close"));
      head.append(x);
    }
    const panel = el("div", {
      class: `olw-panel olw-modal ${opts.className ?? ""}`,
      attrs: { role: "dialog", "aria-modal": "true", "aria-label": opts.title },
    }, [head, el("div", { class: "olw-modal-body" }, [opts.body(md, close)])]);
    const backdrop = el("div", { class: "olw-backdrop" }, [panel]);
    if (dismissable) {
      md.listen(backdrop, "click", (e) => {
        if (e.target === backdrop) close();
      });
    }

    ctx.modal = opts.kind;
    this.current = { kind: opts.kind, close, dismissable };
    ctx.lock();
    ctx.layer.append(backdrop);
    ctx.changed();
    // move focus into the panel (Tab reaches its buttons) without a ring
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
    return { close };
  }

  /** Esc: close the current modal if it allows it. Returns true if handled. */
  escape(): boolean {
    if (!this.current) return false;
    if (this.current.dismissable) this.current.close();
    return true;
  }

  closeAny() {
    this.current?.close();
  }
}
