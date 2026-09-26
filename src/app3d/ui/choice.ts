// "choice" panel (UIScene's choice card): a titled prompt with a few option
// buttons. Used by the 3D world events (lost tourist, street dance). The
// chosen option's id goes to spec.onChoose after the panel closes, so the
// callback can open a dialogue or minigame of its own.
import { uiEvents, type ChoiceSpec } from "../../game/systems/controls";
import { button, el } from "./dom";
import type { UIContext } from "./context";
import type { ModalHost } from "./modal";

export function mountChoice(ctx: UIContext, host: ModalHost) {
  ctx.d.on(uiEvents, "choice", (spec: ChoiceSpec) => {
    host.open({
      kind: "choice",
      title: spec.title,
      subtitle: spec.kicker,
      body: (md, close) => {
        const list = el(
          "div",
          { class: "olw-modal-actions", style: { flexDirection: "column", alignItems: "stretch" } },
          spec.choices.map((c) => {
            const b = button(md, "", "olw-btn olw-btn--rose", () => {
              close();
              spec.onChoose(c.id);
            });
            b.append(
              el("span", { text: `${c.icon ? `${c.icon} ` : ""}${c.label}`, style: { fontWeight: "800" } }),
              c.description ? el("span", { text: ` · ${c.description}`, style: { opacity: "0.85" } }) : "",
            );
            return b;
          }),
        );
        if (spec.cancelLabel) list.append(button(md, spec.cancelLabel, "olw-btn olw-btn--ghost", () => close()));
        return el("div", {}, [el("p", { text: spec.prompt }), list]);
      },
    });
  });
}
