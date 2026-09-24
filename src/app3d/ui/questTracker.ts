// Top-right quest tracker: active quests + the current step hint.
import { store } from "../../game/systems/store";
import { activeQuests } from "../../game/systems/quests";
import { el } from "./dom";
import type { UIContext } from "./context";

export function mountQuestTracker(ctx: UIContext) {
  const { d } = ctx;
  const count = el("span", { class: "olw-quests-count" });
  const toggle = el("button", { class: "olw-quests-head", attrs: { type: "button", "aria-expanded": "false" } }, [
    el("span", { class: "olw-quests-label", text: "Quests" }),
    count,
  ]);
  const list = el("ol", { class: "olw-quests-list" });
  const box = d.node(el("section", { class: "olw-panel olw-quests olw-play-only", attrs: { "aria-label": "Quests" } }, [toggle, list]));
  ctx.layer.append(box);

  // On phones the tracker shows only the first quest until expanded.
  let expanded = false;
  d.listen(toggle, "click", () => {
    expanded = !expanded;
    box.classList.toggle("olw-quests--expanded", expanded);
    toggle.setAttribute("aria-expanded", `${expanded}`);
  });

  const refresh = () => {
    const quests = activeQuests();
    box.classList.toggle("olw-hidden", quests.length === 0);
    count.textContent = `${quests.length}`;
    box.classList.toggle("olw-quests--many", quests.length > 1);
    list.replaceChildren(
      ...quests.map((q) =>
        el("li", { class: "olw-quest" }, [
          el("div", { class: "olw-quest-title", text: q.def.title }),
          el("div", { class: "olw-quest-hint", text: q.hint }),
        ]),
      ),
    );
  };
  refresh();
  d.on(store, "questUpdated", refresh);
  d.on(store, "changed", refresh);
  return { refresh };
}
