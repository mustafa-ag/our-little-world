import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = process.cwd();
const VALID_STATUSES = new Set(["FINAL_HD", "FINAL_PIXEL_CHARACTER", "PARTIAL", "LEGACY_FALLBACK", "MISSING", "TEMPORARY", "UNUSED"]);
const ENVIRONMENT_CATEGORIES = new Set(["terrain", "water", "roads", "buildings", "foliage", "world-props", "vehicle", "interior", "furniture", "effects", "map"]);
const CHARACTER_CATEGORIES = new Set(["player", "npc", "portrait"]);

const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = `${dir}/${entry.name}`;
  return entry.isDirectory() ? walk(path) : [path];
});
const unique = (items) => [...new Set(items)].sort();

function listFromCatalog(catalog, name) {
  const match = catalog.match(new RegExp(`(?:export )?const ${name} = \\[([^;]+)\\];`));
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]) : [];
}

function categoryForKey(key) {
  if (key.startsWith("char_")) return key === "char_her" ? "player" : "npc";
  if (key.startsWith("t_water")) return "water";
  if (key.startsWith("t_road") || key === "t_asphalt" || key === "t_crossing" || key === "t_pavement" || key.startsWith("t_paving") || key === "t_brick_path" || key === "t_parking") return "roads";
  if (key.startsWith("t_wood") || key === "t_tile" || key === "t_carpet") return "interior";
  if (key.startsWith("t_")) return "terrain";
  if (key.startsWith("b_") || key.startsWith("lm_")) return "buildings";
  if (key.startsWith("f_")) return "furniture";
  if (key.startsWith("v_")) return "vehicle";
  if (key.startsWith("ui_")) return "ui";
  if (["o_tree", "o_palm", "o_pine", "o_bush"].includes(key)) return "foliage";
  if (key === "o_shadow") return "effects";
  return "world-props";
}

function categoryForHdPath(path) {
  if (path.includes("/terrain/water-")) return path.includes("water-base") ? "water" : "effects";
  if (path.includes("/terrain/road") || path.includes("/terrain/driveway") || path.includes("/terrain/sidewalk")) return "roads";
  if (path.includes("/terrain/")) return "terrain";
  if (path.includes("/buildings/")) return "buildings";
  if (path.includes("/vehicles/")) return "vehicle";
  if (path.includes("/ui/")) return "ui";
  if (path.includes("/effects/")) return "effects";
  if (path.includes("/portraits/")) return "portrait";
  if (path.includes("/characters/")) return "npc";
  if (path.includes("/props/") && /(tree|palm|shrub)/.test(path)) return "foliage";
  return "world-props";
}

function sceneDirectKeys(path, source) {
  const keys = [];
  const matchers = [
    /add\.(?:image|sprite)\(\s*[^,\n]+,\s*[^,\n]+,\s*["']([a-z][\w-]*)["']/g,
    /add\.tileSprite\(\s*[^,\n]+,\s*[^,\n]+,\s*[^,\n]+,\s*[^,\n]+,\s*["']([a-z][\w-]*)["']/g,
    /textures\.(?:exists|get)\(\s*["']([a-z][\w-]*)["']/g,
  ];
  for (const matcher of matchers) {
    for (const match of source.matchAll(matcher)) keys.push({ key: match[1], scene: path });
  }
  return keys;
}

const catalog = read("src/game/visual/catalog.ts");
const legacyRegistryKeys = new Set([
  ...listFromCatalog(catalog, "legacyTerrainKeys"),
  ...listFromCatalog(catalog, "legacyBuildingKeys"),
  ...listFromCatalog(catalog, "legacyInteriorKeys"),
  ...listFromCatalog(catalog, "legacyVehicleKeys"),
  ...listFromCatalog(catalog, "legacyUiKeys"),
  ...listFromCatalog(catalog, "legacyPropKeys"),
]);
const registryKeys = new Set([
  ...legacyRegistryKeys,
  ...[...catalog.matchAll(/\b(?:hd|bootHd)\("([^"]+)"/g)].map((match) => match[1]),
]);
const finalGroundKeys = listFromCatalog(catalog, "FINAL_GROUND_KEYS");
for (const key of finalGroundKeys) registryKeys.add(key);
const visualEntries = [
  ...[...legacyRegistryKeys].filter((key) => !finalGroundKeys.includes(key)).map((key) => ({ key, category: categoryForKey(key), status: "LEGACY_FALLBACK", source: "procedural registry" })),
  ...finalGroundKeys.map((key) => ({ key, category: categoryForKey(key), status: "FINAL_HD", source: "HD ground alias" })),
];

const npcSource = read("src/game/data/npcs.ts");
const characterIds = unique([...npcSource.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]));
for (const id of characterIds) {
  const key = `char_${id}`;
  registryKeys.add(key);
  visualEntries.push({ key, category: categoryForKey(key), status: "LEGACY_FALLBACK", source: "dynamic character generator" });
}

const hdFiles = walk(resolve(ROOT, "public/assets/hd"))
  .filter((path) => /\.(svg|png|webp)$/i.test(path))
  .map((path) => relative(resolve(ROOT, "public"), path));
const manifestPaths = new Set([...catalog.matchAll(/assets\/hd\/[^"`\n]+\.(?:svg|png|webp)/g)].map((match) => match[0]));

for (const path of hdFiles) {
  const key = `file:${path}`;
  const registered = manifestPaths.has(path) || (path.includes("/props/") && catalog.includes(`assets/hd/props/`));
  const category = categoryForHdPath(path);
  const status = registered ? (category === "buildings" ? "FINAL_HD" : "PARTIAL") : "UNUSED";
  visualEntries.push({ key, category, status, source: path });
}

const sourceFiles = walk(resolve(ROOT, "src/game"))
  .filter((path) => path.endsWith(".ts"))
  .map((path) => relative(ROOT, path));
const directUsages = sourceFiles.flatMap((path) => sceneDirectKeys(path, read(path)));
const proceduralSource = read("src/game/textures.ts");
const characterSource = read("src/game/characters.ts");
const requiredAuditSources = ["src/game/scenes/DrivingScene.ts", "src/game/scenes/WorldMapScene.ts", "src/game/scenes/HouseScene.ts", "src/game/scenes/UIScene.ts", "src/game/ui/minigames.ts"];
const missingAuditSources = requiredAuditSources.filter((path) => !existsSync(resolve(ROOT, path)));
const proceduralTextureCount = [...proceduralSource.matchAll(/createTex\(scene,/g)].length;
const hasDynamicTextures = characterSource.includes("createCanvas") && characterSource.includes("makeCharacterTexture");
const hasCharacterAnimations = characterSource.includes("makeCharacterAnims") && characterSource.includes("scene.anims.create");
const missingByScene = new Map();
for (const usage of directUsages) {
  if (registryKeys.has(usage.key)) continue;
  const category = categoryForKey(usage.key);
  visualEntries.push({ key: usage.key, category, status: "MISSING", source: usage.scene });
  const scene = missingByScene.get(usage.scene) ?? new Map();
  const keys = scene.get(category) ?? new Set();
  keys.add(usage.key);
  scene.set(category, keys);
  missingByScene.set(usage.scene, scene);
}

const duplicateFreeEntries = visualEntries.filter((entry, index, entries) => entries.findIndex((other) => other.key === entry.key && other.source === entry.source) === index);
const invalidStatuses = duplicateFreeEntries.filter((entry) => !VALID_STATUSES.has(entry.status));
const finalFor = (entry) => entry.status === "FINAL_HD" || entry.status === "FINAL_PIXEL_CHARACTER";
const coverage = (filter) => {
  const entries = duplicateFreeEntries.filter(filter);
  const final = entries.filter(finalFor).length;
  return { final, total: entries.length, percent: entries.length === 0 ? 0 : (final / entries.length) * 100 };
};
const environment = coverage((entry) => ENVIRONMENT_CATEGORIES.has(entry.category));
const characters = coverage((entry) => CHARACTER_CATEGORIES.has(entry.category));
const ui = coverage((entry) => entry.category === "ui");
const overall = coverage(() => true);
const ground = coverage((entry) => finalGroundKeys.includes(entry.key));
const legacyEnvironment = duplicateFreeEntries.filter((entry) => ENVIRONMENT_CATEGORIES.has(entry.category) && entry.status === "LEGACY_FALLBACK");
const characterGaps = duplicateFreeEntries.filter((entry) => (entry.category === "player" || entry.category === "npc") && !["FINAL_PIXEL_CHARACTER", "FINAL_HD"].includes(entry.status));

console.log("HD VISUAL COVERAGE AUDIT");
console.log(`Registry keys: ${registryKeys.size} | HD files: ${hdFiles.length} | Direct texture references scanned: ${directUsages.length}`);
console.log(`Procedural texture definitions: ${proceduralTextureCount} | Dynamic character textures: ${hasDynamicTextures ? "detected" : "missing"} | Character animations: ${hasCharacterAnimations ? "detected" : "missing"} | Portrait files: ${hdFiles.filter((path) => path.includes("/portraits/")).length}`);
for (const [label, result] of [["ENVIRONMENT FINAL COVERAGE", environment], ["CHARACTER FINAL COVERAGE", characters], ["UI FINAL COVERAGE", ui], ["OVERALL FINAL COVERAGE", overall]]) {
  console.log(`${label}: ${result.final}/${result.total} (${result.percent.toFixed(1)}%)`);
}
console.log(`GROUND FINAL COVERAGE: ${ground.final}/${ground.total} (${ground.percent.toFixed(1)}%)`);
console.log(`Environmental legacy fallback: ${legacyEnvironment.length}`);

const byCategory = new Map();
for (const entry of duplicateFreeEntries) {
  const counts = byCategory.get(entry.category) ?? new Map();
  counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
  byCategory.set(entry.category, counts);
}
console.log("\nSTATUS BY CATEGORY");
for (const category of [...byCategory.keys()].sort()) {
  const counts = byCategory.get(category);
  console.log(`${category}: ${[...counts.entries()].map(([status, count]) => `${status}=${count}`).join(", ")}`);
}

console.log("\nMISSING KEYS BY SCENE/CATEGORY");
if (missingByScene.size === 0) console.log("None.");
for (const [scene, categories] of missingByScene) {
  for (const [category, keys] of categories) console.log(`${scene} :: ${category}: ${[...keys].sort().join(", ")}`);
}

console.log("\nREQUIRED CHARACTER GAPS");
console.log(characterGaps.length === 0 ? "None." : characterGaps.map((entry) => `${entry.key} (${entry.status})`).join(", "));

if (invalidStatuses.length > 0 || missingByScene.size > 0 || missingAuditSources.length > 0 || !hasDynamicTextures || !hasCharacterAnimations) {
  if (missingAuditSources.length > 0) console.error(`Required audit source files are missing: ${missingAuditSources.join(", ")}`);
  console.error("\nHD visual audit failed: registry status or direct texture coverage is incomplete.");
  process.exit(1);
}
