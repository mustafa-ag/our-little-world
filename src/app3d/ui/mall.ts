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
import type { Scene } from "@babylonjs/core/scene";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Light } from "@babylonjs/core/Lights/light";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Materials } from "../rendering/materials";

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

// =============================================================================
// MallScene3D — navigable 3D atrium built in the Babylon scene.
// The DOM mall modal (mountMall above) remains fully functional for the 2D
// game; the 3D game instantiates MallScene3D separately and calls its
// onStorefrontEnter callback to open the same DOM tab when a storefront is
// reached.
// =============================================================================

/** World offset for the 3D mall (far from maps and the house interior). */
const MALL_ORIGIN = { x: 4800, z: 4800 } as const;

const MALL_FW = 24; // floor width  (X axis, east-west)
const MALL_FD = 16; // floor depth  (Z axis, north-south)

interface StoreTrigger {
  category: string;
  wx: number; // local X offset from MALL_ORIGIN
  wz: number; // local Z offset from MALL_ORIGIN
}

/** Storefront definitions.  Only the 5 live MallDepartment IDs get triggers. */
const MALL_STORES: ReadonlyArray<{ category: string | null; x: number; signHex: string }> = [
  { category: "fashion",     x: -10.5, signHex: "#d47ab0" },
  { category: "cafe",        x:  -7.5, signHex: "#c8946a" },
  { category: "jewellery",   x:  -4.5, signHex: "#d4a83c" },
  { category: "electronics", x:  -1.5, signHex: "#7094c8" },
  { category: "food",        x:   1.5, signHex: "#d4884a" },
  { category: null,           x:   4.5, signHex: "#82b880" }, // decorative
  { category: null,           x:   7.5, signHex: "#9898b8" }, // decorative
  { category: null,           x:  10.5, signHex: "#c8c0b0" }, // decorative
];

export class MallScene3D {
  private root: TransformNode;
  private meshes: Mesh[] = [];
  private mats = new Map<string, StandardMaterial>();
  private lights: Light[] = [];
  private triggers: StoreTrigger[] = [];
  private onEnter: ((category: string) => void) | null = null;
  private active = false;
  private lastTrigger = "";
  private lastTriggerTime = 0;

  constructor(
    private scene: Scene,
    private engine: Engine,
    private materials: Materials,
  ) {
    this.root = new TransformNode("mall3d", scene);
    this.root.position.set(MALL_ORIGIN.x, 0, MALL_ORIGIN.z);
    this.build();
  }

  /** Activate proximity checking and store the storefront callback. */
  enter(_playerPos: Vector3, onStorefrontEnter: (category: string) => void): void {
    this.active = true;
    this.lastTrigger = "";
    this.lastTriggerTime = 0;
    this.onEnter = onStorefrontEnter;
  }

  /** Deactivate; the geometry stays in-scene until dispose(). */
  exit(): void {
    this.active = false;
    this.onEnter = null;
    this.lastTrigger = "";
  }

  /**
   * Call every frame while the player is inside the mall.
   * playerPos is world-space; deltaTime is in seconds.
   */
  update(playerPos: Vector3, _deltaTime: number): void {
    if (!this.active || !this.onEnter) return;
    const px = playerPos.x - MALL_ORIGIN.x;
    const pz = playerPos.z - MALL_ORIGIN.z;
    const PROX = 1.5 * 1.5;
    for (const t of this.triggers) {
      const dx = px - t.wx;
      const dz = pz - t.wz;
      if (dx * dx + dz * dz < PROX) {
        const now = performance.now();
        if (t.category !== this.lastTrigger || now - this.lastTriggerTime > 3000) {
          this.lastTrigger = t.category;
          this.lastTriggerTime = now;
          this.onEnter(t.category);
        }
        return;
      }
    }
  }

  dispose(): void {
    this.onEnter = null;
    this.active = false;
    for (const l of this.lights) l.dispose();
    for (const m of this.meshes) m.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.root.dispose();
    this.meshes = [];
    this.lights = [];
  }

  // ---- mesh helpers ----

  private mat(name: string, hex: string, alpha = 1): StandardMaterial {
    const key = `${name}:${hex}:${alpha}`;
    let m = this.mats.get(key);
    if (m) return m;
    m = new StandardMaterial(`mall:${key}`, this.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    m.fogEnabled = false;
    if (alpha < 1) m.alpha = alpha;
    this.mats.set(key, m);
    return m;
  }

  private place(mesh: Mesh, x: number, y: number, z: number): Mesh {
    mesh.parent = this.root;
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    this.meshes.push(mesh);
    return mesh;
  }

  private box(n: string, w: number, h: number, d: number, mat: StandardMaterial, x: number, y: number, z: number): Mesh {
    const m = CreateBox(`mall:${n}`, { width: w, height: h, depth: d }, this.scene);
    m.material = mat;
    return this.place(m, x, y, z);
  }

  private cyl(n: string, r: number, rB: number, h: number, mat: StandardMaterial, x: number, y: number, z: number, tess = 14): Mesh {
    const m = CreateCylinder(`mall:${n}`, { diameterTop: r * 2, diameterBottom: rB * 2, height: h, tessellation: tess }, this.scene);
    m.material = mat;
    return this.place(m, x, y, z);
  }

  private sphere(n: string, d: number, mat: StandardMaterial, x: number, y: number, z: number): Mesh {
    const m = CreateSphere(`mall:${n}`, { diameter: d, segments: 8 }, this.scene);
    m.material = mat;
    return this.place(m, x, y, z);
  }

  private unlit(n: string, mesh: Mesh, hex: string, x: number, y: number, z: number): Mesh {
    const m = new StandardMaterial(`mall:unlit:${n}`, this.scene);
    m.disableLighting = true;
    m.emissiveColor = Color3.FromHexString(hex);
    m.fogEnabled = false;
    this.mats.set(`unlit:${n}`, m);
    mesh.material = m;
    return this.place(mesh, x, y, z);
  }

  // ---- build ----

  private build(): void {
    const FW = MALL_FW, FD = MALL_FD;
    const O = MALL_ORIGIN;

    // ---- Floor (off-white polished marble, roughness 0.08) ----
    this.box("floor", FW, 0.05, FD, this.mat("marble", "#e8e4dc"), 0, 0.025, 0).receiveShadows = true;

    // ---- Ceiling (y=6, plain white) ----
    this.box("ceiling", FW + 0.4, 0.2, FD + 0.4, this.mat("ceiling", "#f8f8f8"), 0, 6.1, 0);

    // ---- Skylight: central 8×4 emissive warm-white plane at y=5.9 ----
    this.unlit("skylight",
      CreateBox("mall:skylight", { width: 8, height: 0.04, depth: 4 }, this.scene),
      "#fffdf5", 0, 5.91, 0);

    // ---- Side walls (east x=+12, west x=-12) ----
    const wallMat = this.mat("wall", "#f0ede8");
    this.box("wallE", 0.2, 6, FD, wallMat, FW / 2 + 0.1, 3, 0);
    this.box("wallW", 0.2, 6, FD, wallMat, -FW / 2 - 0.1, 3, 0);

    // ---- Storefronts on north (side=+1, z=+8) and south (side=-1, z=-8) walls ----
    const alMat = this.mat("aluminium", "#d8d4cc");
    for (const side of [1, -1] as const) {
      // Solid backing wall (opaque, behind storefronts)
      const wallZ = side * (FD / 2 + 0.1);    // wall box centre z
      const faceZ = side * (FD / 2 - 0.05);   // inner wall face z
      const glassZ = side * (FD / 2 - 0.15);  // glass / frame z (just inside face)
      const trigZ  = side * (FD / 2 - 1.15);  // trigger zone z (1 unit in from glass)

      this.box(`wallBack${side > 0 ? "N" : "S"}`, FW + 0.4, 6.2, 0.2, wallMat, 0, 3, wallZ);

      MALL_STORES.forEach((store, i) => {
        const sx = store.x;

        // Dark glass front
        const glassMat = this.mat(`sg${i}`, "#a8c8d8", 0.65);
        glassMat.backFaceCulling = false;
        this.box(`glass${i}${side}`, 2.6, 2.7, 0.1, glassMat, sx, 1.4, glassZ);

        // Aluminium frame strips (left, right, top, bottom)
        this.box(`frmL${i}${side}`, 0.1, 2.9, 0.14, alMat, sx - 1.35, 1.4, glassZ);
        this.box(`frmR${i}${side}`, 0.1, 2.9, 0.14, alMat, sx + 1.35, 1.4, glassZ);
        this.box(`frmT${i}${side}`, 2.8, 0.1, 0.14, alMat, sx, 2.85, glassZ);
        this.box(`frmB${i}${side}`, 2.8, 0.1, 0.14, alMat, sx, -0.05, glassZ);

        // Sign panel box above glass
        this.box(`signP${i}${side}`, 2.8, 0.4, 0.14, this.mat(`sgn${i}`, store.signHex), sx, 3.15, glassZ);

        // Invisible trigger in front of each interactive storefront
        if (store.category !== null) {
          const t = CreateBox(`mall:trig${i}${side}`, { width: 2.4, height: 0.1, depth: 0.5 }, this.scene);
          t.parent = this.root;
          t.position.set(sx, 0.05, trigZ);
          t.isPickable = false;
          t.visibility = 0;
          this.meshes.push(t);
          this.triggers.push({ category: store.category, wx: sx, wz: trigZ });
        }
      });

      // Upper railing strip at y=3.0 along this X wall (inner face)
      this.box(`rail${side > 0 ? "N" : "S"}`, FW, 0.08, 0.08, alMat, 0, 3.0, faceZ);
    }

    // ---- Central planter (r=1.2, h=0.5, cream) with simple tree ----
    this.cyl("planterRim", 1.2, 1.2, 0.5, this.mat("planter", "#e8ddc8"), 0, 0.25, 0, 20);
    this.cyl("trunk",      0.15, 0.18, 1.5, this.mat("trunk", "#6a4a2e"), 0, 1.25, 0, 8);
    this.sphere("canopy0", 2.0, this.mat("canopy", "#6b8a4e"), 0, 2.5, 0);
    this.sphere("canopy1", 1.3, this.mat("canopy2", "#8fa87c"), 0.6, 3.1, 0.4);

    // ---- Seating clusters (symmetrical on Z): 2 benches + 1 low table each ----
    const benchMat    = this.mat("bench",  "#d0c4a8");
    const ltableMat   = this.mat("ltable", "#e0d8cc");
    for (const sz of [3.5, -3.5]) {
      const t = sz > 0 ? "a" : "b";
      this.box(`bA${t}`, 1.2, 0.4, 0.45, benchMat,  -2.5, 0.2,  sz);
      this.box(`bB${t}`, 1.2, 0.4, 0.45, benchMat,   2.5, 0.2,  sz);
      this.box(`lt${t}`, 0.6, 0.42, 0.6, ltableMat,  0,   0.21, sz);
    }

    // ---- Lighting ----

    // HemisphericLight: sky #e8dce8, ground #c8b88c, intensity 0.4
    const hemi = new HemisphericLight("mall:hemi", new Vector3(0, 1, 0), this.scene);
    hemi.diffuse = Color3.FromHexString("#e8dce8");
    hemi.groundColor = Color3.FromHexString("#c8b88c");
    hemi.specular = Color3.Black();
    hemi.intensity = 0.4;
    this.lights.push(hemi);

    // DirectionalLight from above: #fff8e8, intensity 1.2, direction (0,-1,0.2)
    const dir = new DirectionalLight("mall:dir", new Vector3(0, -1, 0.2), this.scene);
    dir.diffuse = Color3.FromHexString("#fff8e8");
    dir.specular = Color3.Black();
    dir.intensity = 1.2;
    dir.position = new Vector3(O.x, 12, O.z);
    this.lights.push(dir);

    // 4 PointLights along ceiling: #ffe4b0, intensity 0.8, range 6
    for (let i = 0; i < 4; i++) {
      const lx = -9 + i * 6;
      const pt = new PointLight(`mall:pt${i}`, new Vector3(O.x + lx, 5.5, O.z), this.scene);
      pt.diffuse = Color3.FromHexString("#ffe4b0");
      pt.specular = Color3.Black();
      pt.intensity = 0.8;
      pt.range = 6;
      this.lights.push(pt);
    }

    // Suppress TS unused-field warnings (stored for API contract / future use)
    void this.engine;
    void this.materials;
  }
}
