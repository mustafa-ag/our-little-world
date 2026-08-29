export interface SecretDef {
  id: string;
  locationId: string;
  title: string;
  hint: string;
  kind: "heart" | "note" | "coins" | "flower" | "postcard" | "cat";
  tx: number;
  ty: number;
  time?: "morning" | "afternoon" | "evening" | "night";
  minRel?: { npc: string; min: number };
  item?: string;
  memory?: string;
}

export const SECRETS: SecretDef[] = [
  { id: "sec_downtown_heart", locationId: "dubai_downtown", title: "Fountain heart", hint: "Near the water.", kind: "heart", tx: 58, ty: 50, item: "heart_fragment" },
  { id: "sec_hills_flower", locationId: "dubai_hills", title: "Hill flower", hint: "Off the boulevard.", kind: "flower", tx: 22, ty: 18, item: "flower" },
  { id: "sec_damac_note", locationId: "dubai_damac", title: "Mama's note", hint: "By the garden.", kind: "note", tx: 20, ty: 30, item: "note" },
  { id: "sec_oasis_coins", locationId: "dubai_oasis", title: "SO2 coins", hint: "Near the lobby.", kind: "coins", tx: 40, ty: 70 },
  { id: "sec_yas_heart", locationId: "abudhabi_yas", title: "Golf-edge heart", hint: "Where the villas curve.", kind: "heart", tx: 88, ty: 56, item: "heart_fragment" },
  { id: "sec_corniche_card", locationId: "abudhabi_corniche", title: "Corniche postcard", hint: "By the water.", kind: "postcard", tx: 24, ty: 40, item: "postcard" },
  { id: "sec_westend_cat", locationId: "london_westend", title: "Soho cat", hint: "It lives here now.", kind: "cat", tx: 90, ty: 48 },
  { id: "sec_ben_heart", locationId: "london_westminster", title: "Clock heart", hint: "Look up, then down.", kind: "heart", tx: 40, ty: 36, item: "heart_fragment" },
  { id: "sec_edi_coin", locationId: "edinburgh_oldtown", title: "Mile coins", hint: "A cobble is loose.", kind: "coins", tx: 64, ty: 40 },
  { id: "sec_dean_flower", locationId: "edinburgh_dean", title: "Dean flower", hint: "By the water of Leith.", kind: "flower", tx: 30, ty: 60, item: "flower" },
  { id: "sec_szr_night", locationId: "dubai_szr", title: "Night stamp", hint: "Only after dark.", kind: "postcard", tx: 40, ty: 140, time: "night", item: "postcard", memory: "mem_secret_night" },
  { id: "sec_leicester_choc", locationId: "leicester", title: "PhD chocolate", hint: "Chloe's emergency stash.", kind: "note", tx: 36, ty: 50, item: "chocolate", minRel: { npc: "chloe", min: 10 } },
];

export const secretsFor = (locationId: string) => SECRETS.filter((s) => s.locationId === locationId);
