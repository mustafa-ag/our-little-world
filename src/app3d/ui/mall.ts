// Mall directory — the 3D stand-in for src/game/scenes/MallScene.ts.
// Entering a mall (worldController.enterMall -> "enterMall") opens a tabbed
// store directory: fashion (outfits with try-on), café (counter + the coffee
// minigame), jewellery, electronics and the food court. The quest hooks the
// Phaser scene had live here too: "enter_mall" on arrival, q_baba_card's
// first-look pick, q_date's two-coffee run and the Baba Shopping entrance.
import { store } from "../../game/systems/store";
import { uiEvents } from "../../game/systems/controls";
import * as quests from "../../game/systems/quests";
import { OUTFIT_UNLOCKS } from "../../game/data/outfits";
import {
  DEPARTMENT_KINDS,
  MALL_DEPARTMENTS,
  MALL_OUTFITS,
  mallById,
  type MallConfig,
  type MallDepartment,
  type MallDepartmentDef,
  type MallProduct,
} from "../../game/data/malls";
import { button, el, icon, type Disposer } from "./dom";
import type { UIContext } from "./context";
import type { ModalHost } from "./modal";
import { swatch } from "./wardrobe";

const FIRST_LOOKS = [
  { id: "elegant", name: "Elegant", description: "The ‘Baba, this was sensible’ option." },
  { id: "summer", name: "Summer", description: "Bright, easy, immediately holiday-coded." },
  { id: "sporty", name: "Sporty", description: "Ready to sprint away from the receipt." },
];

const outfitLabel = (id: string) => OUTFIT_UNLOCKS.find((o) => o.id === id)?.label ?? id;

function owned(p: MallProduct) {
  if (p.rewardType === "accessory") return store.isAccessoryUnlocked(p.rewardId);
  if (p.rewardType === "keepsake") return store.hasKeepsake(p.rewardId);
  if (p.rewardType === "outfit") return store.isOutfitUnlocked(p.rewardId);
  return false; // stackable items can always be bought again
}

function pay(price: number) {
  if (store.spendCoins(price)) return true;
  store.toast("Not enough coins", "#e46d94");
  return false;
}

function grant(p: MallProduct) {
  if (p.rewardType === "accessory") store.unlockAccessory(p.rewardId);
  else if (p.rewardType === "keepsake") store.unlockKeepsake(p.rewardId);
  else if (p.rewardType === "outfit") store.unlockOutfit(p.rewardId);
  else store.addItem(p.rewardId);
}

export function mountMall(ctx: UIContext, host: ModalHost) {
  const { d } = ctx;
  let lastTab: MallDepartment = "fashion";

  const open = (mallId: string, tab?: MallDepartment) => {
    const mall = mallById(mallId) ?? mallById("dubai_mall")!;
    if (tab) lastTab = tab;
    host.open({
      kind: "mall",
      title: mall.title,
      subtitle: mall.subtitle,
      className: "olw-mall-modal",
      body: (md, close) => mallBody(md, close, mall),
    });
    return true;
  };

  const storeName = (mall: MallConfig, dept: MallDepartmentDef) => {
    if (dept.id === "food") return dept.fallbackName;
    const kinds = DEPARTMENT_KINDS[dept.id];
    return mall.stores.find((s) => kinds.includes(s.kind))?.label ?? dept.fallbackName;
  };

  // ---------------------------------------------------------------------------
  const mallBody = (md: Disposer, close: () => void, mall: MallConfig): Node => {
    const root = el("div", { class: "olw-mall" });
    const wallet = el("p", { class: "olw-shop-wallet" });
    const setWallet = () => {
      wallet.textContent = `You have ${store.state.coins} coins`;
    };
    setWallet();
    md.on(store, "coins", setWallet);

    // ---- fashion try-on: dress Juju without saving; always undone ----------
    let tryOnOriginal: string | null = null;
    let tryOnId: string | null = null;
    const endTryOn = () => {
      if (tryOnOriginal === null) return;
      store.state.outfit = tryOnOriginal;
      tryOnOriginal = null;
      tryOnId = null;
      store.emit("outfit", store.state.outfit);
    };
    const tryOn = (id: string) => {
      if (tryOnOriginal === null) tryOnOriginal = store.state.outfit;
      tryOnId = id;
      store.state.outfit = id;
      store.emit("outfit", id);
      renderPane();
    };
    md.add(endTryOn);

    const leaveFor = (fn: () => void) => {
      endTryOn();
      close();
      fn();
    };

    // ---- quest banner: Baba Shopping entrance --------------------------------
    const banner = () => {
      const spree = quests.currentStep("q_baba_spree")?.target === "shopping_spree";
      const replay = quests.statusOf("q_baba_spree") === "done";
      if (!spree && !replay) return null;
      return el("div", { class: "olw-mall-banner" }, [
        el("div", { class: "olw-mall-banner-text" }, [
          el("b", { text: spree ? "Baba's Shopping Nightmare" : "Baba Shopping Challenge · replay" }),
          el("small", {
            text: spree ? "One card. Twelve mandatory stores. Baba is already watching the notifications." : "The staff remember the receipts. Quest rewards do not repeat.",
          }),
        ]),
        button(md, spree ? "Begin the trip" : "Start the gauntlet", "olw-btn olw-btn--rose olw-btn--small", () => {
          endTryOn();
          uiEvents.emit("enterBabaShopping", { mallId: mall.id, replay: !spree });
        }),
      ]);
    };

    // ---- tabs ----------------------------------------------------------------
    const tabs = el("div", { class: "olw-tabs olw-mall-tabs", attrs: { role: "tablist" } });
    const pane = el("div", { class: "olw-tabpane olw-mall-pane", attrs: { role: "tabpanel" } });
    const tabBtns = new Map<MallDepartment, HTMLButtonElement>();
    for (const dept of MALL_DEPARTMENTS) {
      const b = button(md, dept.label, "olw-tab", () => {
        lastTab = dept.id;
        renderPane();
      });
      b.setAttribute("role", "tab");
      tabBtns.set(dept.id, b);
      tabs.append(b);
    }

    const buyButton = (label: string, price: number, disabled: boolean, onBuy: () => void, aria: string) => {
      const b = button(md, label, "olw-btn olw-btn--small olw-btn--gold", onBuy);
      if (price > 0) b.prepend(icon("coin"));
      b.disabled = disabled;
      b.setAttribute("aria-label", aria);
      return b;
    };

    const productRow = (p: MallProduct) => {
      const have = owned(p);
      const qty = p.rewardType === "item" ? store.getItemQuantity(p.rewardId) : 0;
      return el("li", { class: `olw-shop-item olw-mall-item${have ? " olw-mall-item--owned" : ""}` }, [
        el("span", { class: "olw-shop-glyph olw-mall-glyph", text: p.icon, attrs: { "aria-hidden": "true" } }),
        el("span", { class: "olw-shop-meta" }, [
          el("span", { class: "olw-shop-name", text: p.name }),
          el("span", { class: "olw-shop-kind", text: have ? "Owned" : qty ? `${p.description} · in bag: ${qty}` : p.description }),
        ]),
        have
          ? el("span", { class: "olw-mall-owned", text: "✓" })
          : buyButton(`${p.price}`, p.price, store.state.coins < p.price, () => {
              endTryOn();
              if (owned(p) || !pay(p.price)) return;
              grant(p);
              quests.onBuy(p.rewardId);
              renderPane();
            }, `Buy ${p.name} for ${p.price} coins`),
      ]);
    };

    // ---- fashion -------------------------------------------------------------
    const renderFashion = (dept: MallDepartmentDef) => {
      const parts: Node[] = [];
      if (quests.currentStep("q_baba_card")?.target === "mall_fashion") {
        parts.push(
          el("div", { class: "olw-mall-quest" }, [
            el("p", { class: "olw-mall-kicker", text: "Choose the first look" }),
            el("p", { class: "olw-mall-note", text: "A tiny fashion decision before the shopping situation escalates." }),
            el(
              "ul",
              { class: "olw-shop-grid" },
              FIRST_LOOKS.map((look) =>
                el("li", { class: "olw-shop-item" }, [
                  swatch(look.id),
                  el("span", { class: "olw-shop-meta" }, [el("span", { class: "olw-shop-name", text: look.name }), el("span", { class: "olw-shop-kind", text: look.description })]),
                  button(md, "Pick", "olw-btn olw-btn--small olw-btn--rose", () =>
                    leaveFor(() => {
                      store.setOutfit(look.id);
                      const done = quests.onInteract("mall_fashion");
                      uiEvents.emit("dialogue", storeName(mall, dept), [
                        `${look.name} it is.`,
                        "One very sensible look. Baba will absolutely notice.",
                        done?.complete ?? "Fashion decision secured.",
                      ]);
                    }),
                  ),
                ]),
              ),
            ),
          ]),
        );
      }

      const mirrorId = tryOnId ?? store.state.outfit;
      const mirrorOffer = tryOnId ? MALL_OUTFITS.find((o) => o.id === tryOnId) : undefined;
      parts.push(
        el("div", { class: "olw-mall-mirror" }, [
          el("span", { class: "olw-mall-mirror-glass" }, [swatch(mirrorId)]),
          el("div", { class: "olw-mall-mirror-text" }, [
            el("b", { text: tryOnId ? `Trying on: ${outfitLabel(tryOnId)}` : `Wearing: ${outfitLabel(store.state.outfit)}` }),
            el("small", { text: tryOnId ? "The mirror says yes. Buy it to keep it — leaving takes it off." : "Tap “Try on” to see a look on Juju." }),
            tryOnId
              ? el("div", { class: "olw-mall-mirror-actions" }, [
                  button(md, "Take it off", "olw-btn olw-btn--ghost olw-btn--small", () => {
                    endTryOn();
                    renderPane();
                  }),
                  mirrorOffer ? buyOutfitButton(mirrorOffer) : null,
                ])
              : null,
          ]),
        ]),
      );

      const rows = [...MALL_OUTFITS].sort((a, b) => Number(store.isOutfitUnlocked(a.id)) - Number(store.isOutfitUnlocked(b.id)));
      parts.push(
        el(
          "ul",
          { class: "olw-mall-list" },
          rows.map((o) => {
            const have = store.isOutfitUnlocked(o.id);
            const wearing = store.state.outfit === o.id && !tryOnId;
            return el("li", { class: `olw-shop-item olw-mall-item${have ? " olw-mall-item--owned" : ""}${tryOnId === o.id ? " olw-mall-item--trying" : ""}` }, [
              swatch(o.id),
              el("span", { class: "olw-shop-meta" }, [
                el("span", { class: "olw-shop-name", text: outfitLabel(o.id) }),
                el("span", { class: "olw-shop-kind", text: have ? (wearing ? "Owned · wearing" : "Owned") : `${o.description} · ${o.price} coins` }),
              ]),
              have
                ? wearing
                  ? el("span", { class: "olw-mall-owned", text: "✓" })
                  : button(md, "Wear", "olw-btn olw-btn--small", () => {
                      endTryOn();
                      store.setOutfit(o.id);
                      renderPane();
                    })
                : el("span", { class: "olw-mall-btns" }, [
                    button(md, tryOnId === o.id ? "On" : "Try on", "olw-btn olw-btn--small olw-btn--ghost", () => tryOn(o.id)),
                    buyOutfitButton(o),
                  ]),
            ]);
          }),
        ),
      );
      return parts;
    };

    const buyOutfitButton = (o: (typeof MALL_OUTFITS)[number]) =>
      buyButton(`${o.price}`, o.price, store.state.coins < o.price, () => {
        const wasTrying = tryOnId === o.id;
        endTryOn();
        if (store.isOutfitUnlocked(o.id) || !pay(o.price)) return renderPane();
        store.setFlag(o.flag);
        store.unlockOutfit(o.id);
        if (wasTrying) store.setOutfit(o.id);
        quests.onBuy(o.id);
        renderPane();
      }, `Buy ${outfitLabel(o.id)} for ${o.price} coins`);

    // ---- café ----------------------------------------------------------------
    const renderCafe = (dept: MallDepartmentDef) => {
      const pair = quests.currentStep("q_date")?.target === "mall_coffee_pair";
      const name = storeName(mall, dept);
      return [
        el("div", { class: `olw-mall-quest${pair ? " olw-mall-quest--on" : ""}` }, [
          el("p", { class: "olw-mall-kicker", text: pair ? "Moomoo's order · two coffees" : "Behind the counter" }),
          el("p", { class: "olw-mall-note", text: pair ? "Make two cups: espresso, milk, two sugars, lid." : "Espresso, milk, sugar, lid. You know the order." }),
          button(md, pair ? "Make two coffees" : "Make his coffee", "olw-btn olw-btn--rose olw-btn--small", () =>
            leaveFor(() =>
              uiEvents.emit("minigame", {
                kind: "coffee",
                title: name,
                hint: pair ? "Make two cups: espresso, milk, two sugars, lid." : "Espresso, milk, sugar, lid. You know the order.",
                skipLabel: "Not now",
                onDone: (ok?: boolean) => {
                  if (!ok) return;
                  store.addItem("coffee");
                  quests.onMinigame(pair ? "mall_coffee_pair" : "coffee");
                  quests.onInteract("cafe");
                  uiEvents.emit("dialogue", name, [pair ? "Two warm cups, two sugars each. Carry them carefully back to Moomoo." : "His exact order. Naturally."]);
                },
              }),
            ),
          ),
        ]),
        el("ul", { class: "olw-shop-grid" }, dept.products.map(productRow)),
      ];
    };

    const renderPane = () => {
      for (const [id, b] of tabBtns) {
        b.classList.toggle("olw-tab--on", id === lastTab);
        b.setAttribute("aria-selected", String(id === lastTab));
      }
      const dept = MALL_DEPARTMENTS.find((x) => x.id === lastTab) ?? MALL_DEPARTMENTS[0];
      const head = el("div", { class: "olw-mall-storehead" }, [
        el("h3", { class: "olw-mall-store", text: storeName(mall, dept) }),
        el("p", { class: "olw-mall-note", text: dept.blurb }),
      ]);
      const body: Node[] =
        dept.id === "fashion" ? renderFashion(dept) : dept.id === "cafe" ? renderCafe(dept) : [el("ul", { class: "olw-shop-grid" }, dept.products.map(productRow))];
      pane.replaceChildren(head, ...body);
    };

    const extras = mall.stores.filter((s) => s.kind === "aquarium" || s.kind === "cinema");
    renderPane();
    root.append(
      wallet,
      ...[banner()].filter((n): n is HTMLDivElement => !!n),
      tabs,
      pane,
      ...(extras.length
        ? [el("p", {
            class: "olw-mall-note olw-mall-extras",
            text: `Also here: ${extras.map((s) => (s.kind === "aquarium" ? `${s.label} — the fish are judging every bag` : `${s.label} — now showing: Tiny Pirates`)).join(" · ")}`,
          })]
        : []),
      el("div", { class: "olw-modal-actions" }, [button(md, "Leave the mall", "olw-btn olw-btn--rose", () => leaveFor(() => undefined))]),
    );
    return root;
  };

  d.on(uiEvents, "enterMall", (opts?: { mallId?: string; tab?: MallDepartment }) => {
    if (ctx.anyModal()) return;
    quests.onInteract("enter_mall");
    open(opts?.mallId ?? "dubai_mall", opts?.tab);
  });

  return { open };
}
