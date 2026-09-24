// Post-dialogue gift menu — port of UIScene.openGiftMenu.
import { store } from "../../game/systems/store";
import { uiEvents } from "../../game/systems/controls";
import * as quests from "../../game/systems/quests";
import { NPCS } from "../../game/data/npcs";
import { ITEMS } from "../../game/data/items";
import { button, el, type Disposer } from "./dom";

export function giftName(npcId: string) {
  return NPCS.find((n) => n.id === npcId)?.name ?? npcId;
}

export function giftBody(md: Disposer, close: () => void, npcId: string): Node {
  const name = giftName(npcId);
  const list = el("ul", { class: "olw-gift-list" });
  for (const id of store.giftableItems()) {
    const def = ITEMS[id];
    const b = button(md, "", "olw-gift", () => {
      const res = store.giveGift(npcId, id);
      close();
      if (res) {
        const done = quests.onGive(npcId, id);
        uiEvents.emit("dialogue", name, [res.line, done ? done.complete : `${name} ♡ +${res.gain}`]);
      }
    });
    b.append(
      el("span", { class: "olw-gift-name", text: def?.name ?? id }),
      el("span", { class: "olw-gift-qty", text: `×${store.getItemQuantity(id)}` }),
    );
    list.append(el("li", {}, [b]));
  }
  return el("div", {}, [list, el("div", { class: "olw-modal-actions" }, [button(md, "Not now", "olw-btn olw-btn--ghost", () => close())])]);
}
