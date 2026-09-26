// Phone tabs ported from the legacy PhoneOverlay: Camera, Album, Stats,
// Contacts (People) and Notes. Each view is rebuilt on every render; the
// little bits of navigation state (open photo / contact) live here so they
// survive re-renders while the phone stays open.
import { store } from "../../game/systems/store";
import { uiEvents } from "../../game/systems/controls";
import { npcWhere } from "../../game/systems/life";
import type { SavedPhoto } from "../../game/systems/save";
import { NPCS } from "../../game/data/npcs";
import { QUESTS } from "../../game/data/quests";
import { MEMORIES } from "../../game/data/memories";
import { SECRETS } from "../../game/data/secrets";
import { SOUVENIRS } from "../../game/data/souvenirs";
import { LIFE_STATS } from "../../game/data/stats";
import { LOCATIONS, getLocation } from "../../game/data/locations";
import { REL_MAX, bandFor } from "../../game/data/relationships";
import { KEEPSAKES, RELATIONSHIP_MILESTONES } from "../../game/data/relationshipMilestones";
import { ADNOC_RANKS, adnocRankDef, adnocRankIndex } from "../../game/data/adnoc";
import { forgetPhotoImage, photoImage, snapPhoto } from "../systems/photoCapture";
import { button, el, type Disposer } from "./dom";

export interface PhoneNav {
  render: () => void;
  /** Jump to the Texts tab showing only this contact. */
  messageContact: (npcId: string) => void;
}

const npcName = (id: string) => NPCS.find((n) => n.id === id)?.name ?? id;
const placeName = (id: string) => getLocation(id).name;
const TIME_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" };

let selectedPhoto: string | undefined;
let selectedContact: string | undefined;
let cameraFlash: string | undefined;
let pendingDelete: string | undefined;

/** Reset per-open navigation (called when the phone opens). */
export function resetPhoneTabs() {
  selectedPhoto = undefined;
  selectedContact = undefined;
  cameraFlash = undefined;
  pendingDelete = undefined;
}

// ---------------------------------------------------------------- photos

/** Newest first: by day, then by save order (later keys are newer). */
function photosNewest(): SavedPhoto[] {
  return Object.values(store.state.photos)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.day - a.p.day || b.i - a.i)
    .map(({ p }) => p);
}

function peopleOf(photo: SavedPhoto) {
  return (photo.participantIds ?? (photo.companionId ? [photo.companionId] : [])).map(npcName);
}

function photoPicture(photo: SavedPhoto, big = false) {
  const src = photoImage(photo.id);
  if (src) return el("img", { class: "olw-polaroid-img", attrs: { src, alt: `Photo at ${placeName(photo.locationId)}`, loading: "lazy" } });
  // text Polaroid: no pixels saved (legacy scene photo or a memory snap)
  return el("div", { class: `olw-polaroid-img olw-polaroid-img--text olw-polaroid-img--${photo.timeOfDay}` }, [
    el("span", { class: "olw-polaroid-place", text: placeName(photo.locationId) }),
    big ? el("span", { class: "olw-polaroid-time", text: TIME_LABEL[photo.timeOfDay] ?? photo.timeOfDay }) : null,
  ]);
}

function polaroid(md: Disposer, photo: SavedPhoto, onOpen: () => void, small = false) {
  const card = button(md, "", `olw-polaroid${small ? " olw-polaroid--small" : ""}`, onOpen);
  card.setAttribute("aria-label", `${photo.title}, day ${photo.day}`);
  const people = peopleOf(photo);
  card.append(photoPicture(photo), el("span", { class: "olw-polaroid-title", text: photo.title }));
  if (!small) {
    const when = `Day ${photo.day} · ${TIME_LABEL[photo.timeOfDay] ?? photo.timeOfDay}`;
    card.append(el("span", { class: "olw-polaroid-meta", text: `${when}${people.length ? ` · ${people.join(" + ")}` : ""}` }));
    if (photo.caption) card.append(el("span", { class: "olw-polaroid-caption", text: photo.caption }));
  }
  return card;
}

export function cameraView(md: Disposer, nav: PhoneNav, openAlbum: () => void): Node {
  const flash = cameraFlash;
  cameraFlash = undefined;
  const recent = photosNewest().slice(0, 3);
  const shutter = button(md, "Take photo", "olw-btn olw-btn--rose olw-camera-shutter", () => {
    const shot = snapPhoto();
    cameraFlash = !shot
      ? "Couldn't save that one. Try again in a moment."
      : shot.withImage
        ? "Photo taken!"
        : "Snapped a memory ♡ (saved as a text Polaroid)";
    nav.render();
  });
  return el("div", { class: "olw-camera" }, [
    el("p", { class: "olw-camera-hint", text: "Snaps whatever's behind the phone — where you are, who's with you, and when." }),
    el("p", { class: "olw-camera-where", text: `${placeName(store.state.currentLocation)} · ${store.clockLabel()}` }),
    shutter,
    flash ? el("p", { class: "olw-camera-flash", text: flash, attrs: { role: "status" } }) : null,
    el("h3", { class: "olw-quest-head", text: "Latest" }),
    recent.length
      ? el(
          "div",
          { class: "olw-polaroid-strip" },
          recent.map((p) =>
            polaroid(md, p, () => {
              selectedPhoto = p.id;
              openAlbum();
            }, true),
          ),
        )
      : el("p", { class: "olw-empty", text: "No photos yet. Your first one goes here." }),
  ]);
}

function photoDetail(md: Disposer, nav: PhoneNav, photo: SavedPhoto): Node {
  const people = peopleOf(photo);
  const caption = el("textarea", { class: "olw-photo-caption-input", attrs: { rows: "2", maxlength: "140", placeholder: "Add a caption…", "aria-label": "Photo caption" } });
  caption.value = photo.caption ?? "";
  const back = button(md, "‹ Album", "olw-btn olw-btn--ghost olw-btn--small", () => {
    selectedPhoto = undefined;
    pendingDelete = undefined;
    nav.render();
  });
  const save = button(md, "Save caption", "olw-btn olw-btn--rose olw-btn--small", () => {
    store.setPhotoCaption(photo.id, caption.value);
    store.toast("Caption saved", "#8ecae6");
    nav.render();
  });
  const confirming = pendingDelete === photo.id;
  const del = button(md, confirming ? "Tap again to delete" : "Delete photo", `olw-btn olw-btn--small ${confirming ? "olw-btn--danger" : "olw-btn--ghost"}`, () => {
    if (!confirming) {
      pendingDelete = photo.id;
      nav.render();
      return;
    }
    store.deletePhoto(photo.id);
    forgetPhotoImage(photo.id);
    selectedPhoto = undefined;
    pendingDelete = undefined;
    store.toast("Photo deleted", "#a08a70");
    nav.render();
  });
  return el("div", { class: "olw-photo-detail" }, [
    back,
    el("figure", { class: "olw-polaroid olw-polaroid--big" }, [
      photoPicture(photo, true),
      el("figcaption", {}, [
        el("span", { class: "olw-polaroid-title", text: photo.title }),
        el("span", { class: "olw-polaroid-meta", text: `${placeName(photo.locationId)} · Day ${photo.day} · ${TIME_LABEL[photo.timeOfDay] ?? photo.timeOfDay}` }),
        people.length ? el("span", { class: "olw-polaroid-meta", text: `With ${people.join(" + ")}` }) : null,
        photo.surprise ? el("span", { class: "olw-polaroid-meta", text: `Photobomb: ${photo.surprise.replace(/_/g, " ")}` }) : null,
      ]),
    ]),
    caption,
    el("div", { class: "olw-photo-actions" }, [save, del]),
  ]);
}

export function albumView(md: Disposer, nav: PhoneNav): Node {
  const photo = selectedPhoto ? store.state.photos[selectedPhoto] : undefined;
  if (photo) return photoDetail(md, nav, photo);
  selectedPhoto = undefined;
  const photos = photosNewest();
  if (!photos.length) return el("p", { class: "olw-empty", text: "No Polaroids yet. Open the Camera tab and snap one." });
  return el("div", {}, [
    el("p", { class: "olw-home-hint", text: `${photos.length} photo${photos.length === 1 ? "" : "s"} · tap one to open it` }),
    el(
      "div",
      { class: "olw-polaroid-grid" },
      photos.map((p) =>
        polaroid(md, p, () => {
          selectedPhoto = p.id;
          nav.render();
        }),
      ),
    ),
  ]);
}

// ---------------------------------------------------------------- stats

function bar(label: string, value: number, max: number, text?: string, cls = "") {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = el("span", { class: "olw-stat-fill" });
  fill.style.width = `${pct}%`;
  return el("li", { class: `olw-stat-bar ${cls}` }, [
    el("span", { class: "olw-stat-row" }, [el("span", { class: "olw-stat-label", text: label }), el("span", { class: "olw-stat-value", text: text ?? `${value}/${max}` })]),
    el("span", { class: "olw-stat-track", attrs: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": `${max}`, "aria-valuenow": `${value}`, "aria-label": label } }, [fill]),
  ]);
}

function lifeStatValue(id: string) {
  const s = store.state;
  if (id === "workdays_completed") return s.adnocWorkdays;
  if (id === "promotions_earned") return s.adnocCareerStats.promotions_earned ?? store.getStat(id);
  return store.getStat(id) || s.adnocCareerStats[id] || 0;
}

export function statsView(): Node {
  const s = store.state;
  const tile = (value: string, label: string) => el("div", { class: "olw-stat-tile" }, [el("span", { class: "olw-stat-tile-value", text: value }), el("span", { class: "olw-stat-tile-label", text: label })]);
  const rank = adnocRankDef(s.adnocRank);
  const memHave = MEMORIES.filter((m) => store.hasMemory(m.id)).length;
  const questsDone = QUESTS.filter((q) => s.quests[q.id]?.status === "done").length;
  const places = Object.keys(LOCATIONS);
  const placesOpen = s.unlockedLocations.filter((id) => places.includes(id)).length;

  const progress = el("ul", { class: "olw-stat-list" }, [
    bar("Jeep fuel", s.fuel, 100, `${s.fuel}%`),
    bar("Memories", memHave, MEMORIES.length),
    bar("Quests completed", questsDone, QUESTS.length),
    bar("Places unlocked", placesOpen, places.length),
    bar("Secrets found", s.discoveredSecrets.length, SECRETS.length),
    bar(`Career · ${rank.label}`, adnocRankIndex(s.adnocRank), ADNOC_RANKS.length - 1, `${s.adnocXp} XP`),
  ]);

  const bonds = NPCS.map((n) => ({ n, rel: store.getRelationship(n.id) }))
    .filter(({ rel }) => rel > 0)
    .sort((a, b) => b.rel - a.rel);
  const relList = el(
    "ul",
    { class: "olw-stat-list" },
    bonds.map(({ n, rel }) => bar(`${n.name}${n.id === "moomoo" ? ` · ${s.relationshipStage}` : ""}`, rel, REL_MAX, `${rel} · ${bandFor(rel)}`, "olw-stat-bar--rel")),
  );

  const log = el(
    "ul",
    { class: "olw-stat-log" },
    [
      { icon: "✈", label: "Countries visited", value: store.getStat("countries_visited") },
      { icon: "◎", label: "Cities visited", value: store.getStat("cities_visited") },
      ...LIFE_STATS.map((d) => ({ icon: d.icon, label: d.label, value: lifeStatValue(d.id) })),
    ].map((row) =>
      el("li", { class: `olw-stat-log-row${row.value ? "" : " olw-stat-log-row--zero"}` }, [
        el("span", { text: `${row.icon}  ${row.label}` }),
        el("span", { class: "olw-stat-value", text: `${row.value}` }),
      ]),
    ),
  );

  const lastRun = s.shoppingHistory[s.shoppingHistory.length - 1];
  return el("div", { class: "olw-stats" }, [
    el("div", { class: "olw-stat-tiles" }, [
      tile(`${s.hearts}`, "Hearts"),
      tile(`${s.coins}`, "Coins"),
      tile(`${s.currentDay}`, "Day"),
      tile(rank.shortLabel, "Career"),
    ]),
    el("h3", { class: "olw-quest-head", text: "Progress" }),
    progress,
    el("h3", { class: "olw-quest-head", text: "Relationships" }),
    bonds.length ? relList : el("p", { class: "olw-empty", text: "Talk to people to start building bonds." }),
    lastRun
      ? el("p", { class: "olw-home-hint", text: `Last mall report: ${lastRun.productIds.length} bags · Baba ${lastRun.babaStress}% · ${lastRun.ultimateUsed ? "Moomoo rescued" : lastRun.babaBattle}` })
      : null,
    el("h3", { class: "olw-quest-head", text: "Very serious life log" }),
    log,
  ]);
}

// ---------------------------------------------------------------- contacts

function hearts(rel: number) {
  const n = Math.round((rel / REL_MAX) * 5);
  return "♥".repeat(n) + "♡".repeat(5 - n);
}

/** People Juju has actually met: any bond, a text, or a travel unlock. */
function metContacts() {
  const s = store.state;
  const texted = new Set([...s.messages.map((m) => m.sender), ...s.chatEntries.map((c) => c.contactId)]);
  return NPCS.filter((n) => store.getRelationship(n.id) > 0 || s.unlockedCompanions.includes(n.id) || texted.has(n.id)).sort(
    (a, b) => store.getRelationship(b.id) - store.getRelationship(a.id),
  );
}

function companionButton(md: Disposer, nav: PhoneNav, npcId: string) {
  if (!store.state.unlockedCompanions.includes(npcId)) return null;
  const active = store.state.activeCompanionId === npcId;
  return button(md, active ? "With you ♡" : "Invite along", `olw-btn olw-btn--small ${active ? "olw-btn--rose" : "olw-btn--ghost"}`, () => {
    store.setActiveCompanion(active ? undefined : npcId);
    uiEvents.emit("companionChanged");
    store.toast(active ? "You are exploring solo for now." : `${npcName(npcId)} is coming along.`, "#e46d94");
    nav.render();
  });
}

function contactDetail(md: Disposer, nav: PhoneNav, npcId: string): Node {
  const npc = NPCS.find((n) => n.id === npcId);
  const rel = store.getRelationship(npcId);
  const s = store.state;
  const reached = RELATIONSHIP_MILESTONES.filter((m) => m.npcId === npcId && s.flags[`milestone_${m.id}`]);
  const next = RELATIONSHIP_MILESTONES.filter((m) => m.npcId === npcId && !s.flags[`milestone_${m.id}`]).sort((a, b) => a.threshold - b.threshold)[0];
  const shared = MEMORIES.filter((m) => m.npcs.includes(npcId) && store.hasMemory(m.id));
  const photos = photosNewest().filter((p) => (p.participantIds ?? (p.companionId ? [p.companionId] : [])).includes(npcId));

  const moments: HTMLElement[] = [
    ...reached.map((m) =>
      el("li", { class: "olw-moment olw-moment--milestone" }, [
        el("span", { class: "olw-moment-title", text: `♥ ${m.title}` }),
        el("span", { class: "olw-moment-desc", text: m.dialogue }),
        m.keepsake && KEEPSAKES[m.keepsake] ? el("span", { class: "olw-moment-desc", text: `Keepsake: ${KEEPSAKES[m.keepsake].name}` }) : null,
      ]),
    ),
    ...shared.map((m) =>
      el("li", { class: "olw-moment" }, [
        el("span", { class: "olw-moment-title", text: `✦ ${m.title} · day ${s.memories[m.id]?.day ?? "?"}` }),
        el("span", { class: "olw-moment-desc", text: m.caption ?? m.description }),
      ]),
    ),
    ...photos.slice(0, 4).map((p) =>
      el("li", { class: "olw-moment" }, [
        el("span", { class: "olw-moment-title", text: `▣ Photo · ${p.title}` }),
        el("span", { class: "olw-moment-desc", text: `Day ${p.day}${p.caption ? ` · ${p.caption}` : ""}` }),
      ]),
    ),
  ];

  const where = npcWhere(npc ?? NPCS[0]);
  return el("div", { class: "olw-contact-detail" }, [
    button(md, "‹ People", "olw-btn olw-btn--ghost olw-btn--small", () => {
      selectedContact = undefined;
      nav.render();
    }),
    el("h3", { class: "olw-contact-name", text: npc?.name ?? npcId }),
    el("p", { class: "olw-contact-meta", text: `${hearts(rel)}  ${rel}/${REL_MAX} · ${bandFor(rel)}${npcId === "moomoo" ? ` · ${s.relationshipStage}` : ""}` }),
    npc ? el("p", { class: "olw-contact-meta", text: where.present ? `Around ${placeName(where.location)} right now` : `Usually at ${placeName(where.location)}` }) : null,
    el("div", { class: "olw-photo-actions" }, [
      button(md, "Message", "olw-btn olw-btn--rose olw-btn--small", () => nav.messageContact(npcId)),
      companionButton(md, nav, npcId),
    ]),
    el("h3", { class: "olw-quest-head", text: "Moments together" }),
    moments.length ? el("ul", { class: "olw-moments" }, moments) : el("p", { class: "olw-empty", text: "No big moments yet — talk, gift, go places together." }),
    next ? el("p", { class: "olw-home-hint", text: `Next milestone at ${next.threshold} ♡` }) : null,
  ]);
}

export function contactsView(md: Disposer, nav: PhoneNav): Node {
  if (selectedContact) return contactDetail(md, nav, selectedContact);
  const s = store.state;
  const wrap = el("div", { class: "olw-contacts" });
  if (s.tigor.unlocked) {
    const withYou = s.tigor.following;
    wrap.append(
      el("h3", { class: "olw-quest-head", text: "Pets" }),
      el("div", { class: "olw-contact olw-contact--pet" }, [
        el("span", { class: "olw-contact-text" }, [
          el("span", { class: "olw-contact-name", text: "Tigor ♡" }),
          el("span", { class: "olw-contact-meta", text: withYou ? "Exploring with Juju" : "Waiting at home" }),
        ]),
        button(md, withYou ? "Send home" : "Bring Tigor", "olw-btn olw-btn--ghost olw-btn--small", () => {
          store.setTigorFollowing(!withYou);
          nav.render();
        }),
      ]),
      el("h3", { class: "olw-quest-head", text: "People" }),
    );
  }
  const people = metContacts();
  if (!people.length) {
    wrap.append(el("p", { class: "olw-empty", text: "No contacts yet. Say hi to someone!" }));
    return wrap;
  }
  const ul = el("ul", { class: "olw-contact-list" });
  for (const n of people) {
    const rel = store.getRelationship(n.id);
    const where = npcWhere(n);
    const row = button(md, "", "olw-contact", () => {
      selectedContact = n.id;
      nav.render();
    });
    row.append(
      el("span", { class: "olw-contact-text" }, [
        el("span", { class: "olw-contact-name", text: `${n.name}${s.activeCompanionId === n.id ? " · with you" : ""}` }),
        el("span", { class: "olw-contact-hearts", text: `${hearts(rel)} ${bandFor(rel)}${n.id === "moomoo" ? ` · ${s.relationshipStage}` : ""}` }),
        el("span", { class: "olw-contact-meta", text: `Last seen: ${placeName(where.location)}` }),
      ]),
      el("span", { class: "olw-contact-chev", text: "›", attrs: { "aria-hidden": "true" } }),
    );
    ul.append(el("li", {}, [row]));
  }
  wrap.append(ul, el("p", { class: "olw-home-hint", text: "Talk, gift, travel. Stronger bonds unlock outings." }));
  return wrap;
}

// ---------------------------------------------------------------- notes

/** Which quest a found note belongs to, if any (step target mentions it). */
function questForNote(id: string) {
  const key = id.replace(/^(note|sec)_/, "");
  return QUESTS.find((q) => q.steps.some((st) => st.target === id || st.target.includes(key)));
}

export function notesView(md: Disposer, nav: PhoneNav): Node {
  const s = store.state;
  const wrap = el("div", { class: "olw-notes" });
  const found = s.discoveredNotes.map((id) => ({ id, def: SECRETS.find((x) => x.id === id) }));
  wrap.append(el("h3", { class: "olw-quest-head", text: `Found notes  ${found.length}/${SECRETS.length}` }));
  if (!found.length) wrap.append(el("p", { class: "olw-empty", text: "No notes yet. Look for the small things other people walk past." }));
  else {
    const ul = el("ul", { class: "olw-note-list" });
    for (const { id, def } of found) {
      const quest = questForNote(id);
      ul.append(
        el("li", { class: `olw-note olw-note--${def?.kind ?? "note"}` }, [
          el("span", { class: "olw-note-title", text: def?.title ?? id.replace(/_/g, " ") }),
          el("span", { class: "olw-note-text", text: def?.hint ?? "" }),
          el("span", { class: "olw-note-meta", text: `${def ? placeName(def.locationId) : "Somewhere"} · ${quest ? `Quest: ${quest.title}` : "Found exploring"}` }),
        ]),
      );
    }
    wrap.append(ul);
  }

  const souvenirs = SOUVENIRS.filter((x) => s.souvenirs.includes(x.id));
  wrap.append(el("h3", { class: "olw-quest-head", text: `Souvenir shelf  ${s.displayedSouvenirs.length}/5` }));
  if (!souvenirs.length) wrap.append(el("p", { class: "olw-empty", text: "Travel leaves little things behind." }));
  else {
    const ul = el("ul", { class: "olw-note-list" });
    for (const x of souvenirs) {
      const shown = s.displayedSouvenirs.includes(x.id);
      const row = button(md, `${x.icon} ${x.name} · ${shown ? "on shelf" : "stored"}`, `olw-souvenir${shown ? " olw-souvenir--on" : ""}`, () => {
        store.toggleSouvenirDisplay(x.id);
        nav.render();
      });
      row.setAttribute("aria-pressed", `${shown}`);
      ul.append(el("li", {}, [row]));
    }
    wrap.append(ul);
  }

  const keepsakes = s.keepsakes.map((id) => KEEPSAKES[id]).filter(Boolean);
  wrap.append(el("h3", { class: "olw-quest-head", text: "Keepsakes" }));
  if (!keepsakes.length) wrap.append(el("p", { class: "olw-empty", text: "Grow your relationships to fill this shelf." }));
  else
    wrap.append(
      el(
        "ul",
        { class: "olw-note-list" },
        keepsakes.map((k) => el("li", { class: "olw-note" }, [el("span", { class: "olw-note-title", text: `♡ ${k.name}` }), el("span", { class: "olw-note-text", text: k.description })])),
      ),
    );
  return wrap;
}
