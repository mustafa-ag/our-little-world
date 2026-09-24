// Virtual joystick — port of UIScene.buildJoystick. A touch in the lower-left
// zone plants the stick there; dragging writes controls.moveX/moveY in [-1,1].
// Tracks a single pointer id so a second finger (e.g. on the A button) is safe.
import { controls } from "../../game/systems/controls";
import { el } from "./dom";
import type { UIContext } from "./context";

export const JOY_RADIUS = 42;

export function mountJoystick(ctx: UIContext) {
  const { d } = ctx;
  const thumb = el("div", { class: "olw-joy-thumb" });
  const base = el("div", { class: "olw-joy-base" }, [thumb]);
  const zone = d.node(el("div", { class: "olw-joyzone olw-touch-only olw-play-only", attrs: { "aria-hidden": "true" } }, [base]));
  ctx.layer.append(zone);

  let pointerId = -1;
  let cx = 0;
  let cy = 0;

  const place = (x: number, y: number) => {
    base.style.transform = `translate(${x}px, ${y}px)`;
  };
  const moveThumb = (dx: number, dy: number) => {
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const rest = () => {
    // resting spot: same as the 2D stick (92px from the bottom-left corner)
    const r = zone.getBoundingClientRect();
    cx = 92;
    cy = Math.max(92, r.height - 92);
    place(cx, cy);
    moveThumb(0, 0);
  };

  const release = () => {
    if (pointerId === -1) return;
    try {
      if (zone.hasPointerCapture(pointerId)) zone.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }
    pointerId = -1;
    controls.moveX = 0;
    controls.moveY = 0;
    zone.classList.remove("olw-joy--active");
    rest();
  };

  d.listen(zone, "pointerdown", (e) => {
    if (pointerId !== -1 || ctx.anyModal() || !ctx.started) return;
    e.preventDefault();
    pointerId = e.pointerId;
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events can't be captured */
    }
    const r = zone.getBoundingClientRect();
    cx = e.clientX - r.left;
    cy = e.clientY - r.top;
    place(cx, cy);
    moveThumb(0, 0);
    zone.classList.add("olw-joy--active");
  });
  d.listen(zone, "pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    const r = zone.getBoundingClientRect();
    const dx = e.clientX - r.left - cx;
    const dy = e.clientY - r.top - cy;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, JOY_RADIUS);
    const ang = Math.atan2(dy, dx);
    const tx = Math.cos(ang) * clamped;
    const ty = Math.sin(ang) * clamped;
    moveThumb(tx, ty);
    if (controls.locked) return;
    controls.moveX = tx / JOY_RADIUS;
    controls.moveY = ty / JOY_RADIUS;
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId === pointerId) release();
  };
  d.listen(zone, "pointerup", end);
  d.listen(zone, "pointercancel", end);
  d.listen(zone, "lostpointercapture", end);
  d.listen(window, "blur", release);
  d.listen(window, "resize", () => {
    if (pointerId === -1) rest();
  });
  // a dialogue / menu opening mid-drag must stop the player
  ctx.bus.on("change", () => {
    if (ctx.anyModal() || !ctx.started) release();
    else if (pointerId === -1) rest();
  });
  d.add(() => {
    if (pointerId !== -1) {
      controls.moveX = 0;
      controls.moveY = 0;
    }
  });
  rest();
  return { release };
}
