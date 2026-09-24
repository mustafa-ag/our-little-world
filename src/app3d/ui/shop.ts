// Shop panel — DOM port of UIScene.buildShop (home furniture / ADNOC treats).
import { store } from "../../game/systems/store";
import * as quests from "../../game/systems/quests";
import { button, el, icon, type Disposer } from "./dom";

export type ShopMode = "home" | "adnoc";

interface CatalogItem {
  tex: string;
  name: string;
  price: number;
  kind?: "fit" | "treat";
}

const ADNOC: CatalogItem[] = [
  { tex: "ui_coin", name: "Karak", price: 4, kind: "treat" },
  { tex: "ui_coin", name: "Coffee", price: 5, kind: "treat" },
  { tex: "ui_heart", name: "Chocolate", price: 6, kind: "treat" },
  { tex: "f_lamp", name: "Road-trip lamp", price: 10 },
];

const HOME: CatalogItem[] = [
  { tex: "f_sofa", name: "Sofa", price: 30 },
  { tex: "f_tv", name: "TV", price: 35 },
  { tex: "f_table", name: "Table", price: 20 },
  { tex: "f_plant", name: "Plant", price: 10 },
  { tex: "f_bookshelf", name: "Bookshelf", price: 25 },
  { tex: "f_lamp", name: "Lamp", price: 8 },
  { tex: "f_fridge", name: "Fridge", price: 30 },
  { tex: "f_chair", name: "Chair", price: 8 },
  { tex: "f_vanity", name: "Vanity", price: 28 },
  { tex: "f_desk", name: "Study desk", price: 24 },
  { tex: "ui_star", name: "Sneakers", price: 18, kind: "fit" },
  { tex: "ui_heart", name: "Chocolate", price: 6, kind: "treat" },
];

// Same house slots the 2D shop used (HouseScene pixel coords).
const SLOTS = [
  { x: 13 * 16, y: 4.5 * 16 },
  { x: 8 * 16, y: 9 * 16 },
  { x: 13 * 16, y: 9 * 16 },
  { x: 6 * 16, y: 5.5 * 16 },
  { x: 10 * 16, y: 5 * 16 },
  { x: 15 * 16, y: 6.5 * 16 },
];

function pay(price: number) {
  if (store.spendCoins(price)) return true;
  store.toast("Not enough coins", "#e46d94");
  return false;
}

function buy(c: CatalogItem) {
  if (!pay(c.price)) return;
  if (c.kind === "fit") {
    store.setFlag("bought_sneakers");
    store.unlockOutfit("sneakers");
    store.toast("Mall sneakers — unlocked", "#f4a6c0");
  } else if (c.kind === "treat") {
    store.addItem(c.name.toLowerCase());
  } else {
    const slot = SLOTS[store.state.furniture.length % SLOTS.length];
    store.placeFurniture({ tex: c.tex, x: slot.x, y: slot.y });
    quests.onBuy(c.tex);
    store.toast("Added to your home!", "#7be0a3");
  }
}

export function shopTitle(mode: ShopMode) {
  return mode === "adnoc"
    ? { title: "ADNOC Oasis Shop", subtitle: "Karak, snacks, and road-trip comforts" }
    : { title: "Home Shop", subtitle: "Buy things for your home" };
}

export function shopBody(md: Disposer, mode: ShopMode): Node {
  const catalog = mode === "adnoc" ? ADNOC : HOME;
  const wallet = el("p", { class: "olw-shop-wallet" });
  const setWallet = () => {
    wallet.textContent = `You have ${store.state.coins} coins`;
  };
  setWallet();
  md.on(store, "coins", setWallet);
  const grid = el("ul", { class: "olw-shop-grid" });
  for (const c of catalog) {
    const kind = c.kind === "fit" ? "Outfit" : c.kind === "treat" ? "Treat" : "Furniture";
    grid.append(
      el("li", { class: "olw-shop-item" }, [
        el("span", { class: `olw-shop-glyph olw-shop-glyph--${c.kind ?? "home"}`, text: c.name.charAt(0), attrs: { "aria-hidden": "true" } }),
        el("span", { class: "olw-shop-meta" }, [
          el("span", { class: "olw-shop-name", text: c.name }),
          el("span", { class: "olw-shop-kind", text: kind }),
        ]),
        (() => {
          const b = button(md, `${c.price}`, "olw-btn olw-btn--small olw-btn--gold", () => buy(c));
          b.prepend(icon("coin"));
          b.setAttribute("aria-label", `Buy ${c.name} for ${c.price} coins`);
          return b;
        })(),
      ]),
    );
  }
  return el("div", {}, [wallet, grid]);
}
