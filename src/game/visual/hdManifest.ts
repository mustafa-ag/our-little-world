export type ArtStatus = "fallback" | "temporary" | "external";

export interface HdFile {
  /** Phaser texture key after load. */
  key: string;
  path: string;
  w: number;
  h: number;
  /** Gameplay key this file should win for, if any. */
  mapsTo?: string;
  status: ArtStatus;
}

/** Only files that exist on disk are listed. Preload loads these in preload(). */
export const HD_FILES: HdFile[] = [
  { key: "hd_grass_big", path: "assets/hd/terrain/grass.svg", w: 512, h: 512, status: "temporary" },
  { key: "hd_grass_detail", path: "assets/hd/terrain/grass-detail-01.svg", w: 256, h: 256, status: "temporary" },
  { key: "hd_grass_tuft", path: "assets/hd/terrain/grass-detail-02.svg", w: 160, h: 120, status: "temporary" },
  { key: "hd_pavement", path: "assets/hd/terrain/pavement.svg", w: 256, h: 256, mapsTo: "t_paving_light", status: "temporary" },
  { key: "hd_road", path: "assets/hd/terrain/road.svg", w: 256, h: 256, mapsTo: "t_road", status: "temporary" },
  { key: "hd_sand", path: "assets/hd/terrain/sand.svg", w: 256, h: 256, mapsTo: "t_sand", status: "temporary" },
  { key: "hd_water_base", path: "assets/hd/terrain/water-base.svg", w: 256, h: 256, status: "temporary" },
  { key: "hd_water_wave", path: "assets/hd/terrain/water-wave.svg", w: 256, h: 256, status: "temporary" },
  { key: "hd_water_shine", path: "assets/hd/terrain/water-shine.svg", w: 256, h: 256, status: "temporary" },

  { key: "hd__o_tree", path: "assets/hd/props/tree-01.svg", w: 280, h: 360, mapsTo: "o_tree", status: "temporary" },
  { key: "hd_tree_02", path: "assets/hd/props/tree-02.svg", w: 260, h: 340, status: "temporary" },
  { key: "hd_tree_03", path: "assets/hd/props/tree-03.svg", w: 300, h: 350, status: "temporary" },
  { key: "hd__o_palm", path: "assets/hd/props/palm-01.svg", w: 260, h: 400, mapsTo: "o_palm", status: "temporary" },
  { key: "hd_palm_02", path: "assets/hd/props/palm-02.svg", w: 240, h: 380, status: "temporary" },
  { key: "hd_flower_bed", path: "assets/hd/props/flower-bed.svg", w: 200, h: 120, status: "temporary" },
  { key: "hd__o_lamp", path: "assets/hd/props/street-lamp.svg", w: 90, h: 220, mapsTo: "o_lamp", status: "temporary" },
  { key: "hd__o_fence_h", path: "assets/hd/props/fence.svg", w: 128, h: 80, mapsTo: "o_fence_h", status: "temporary" },
  { key: "hd__o_bench", path: "assets/hd/props/bench.svg", w: 160, h: 90, mapsTo: "o_bench", status: "temporary" },

  { key: "hd__b_villa_terra2", path: "assets/hd/buildings/yas-home.svg", w: 480, h: 420, mapsTo: "b_villa_terra2", status: "temporary" },
  { key: "hd__b_mosque_acres", path: "assets/hd/buildings/yas-landmark.svg", w: 520, h: 400, mapsTo: "b_mosque_acres", status: "temporary" },

  { key: "hd__v_jeep_blue", path: "assets/hd/vehicles/jeep.svg", w: 220, h: 280, mapsTo: "v_jeep_blue", status: "temporary" },

  { key: "hd_shadow_char", path: "assets/hd/effects/character-shadow.svg", w: 120, h: 48, status: "temporary" },
  { key: "hd_shadow_tree", path: "assets/hd/effects/tree-shadow.svg", w: 200, h: 80, status: "temporary" },
  { key: "hd_glow", path: "assets/hd/effects/light-glow.svg", w: 160, h: 160, status: "temporary" },

  { key: "hd_juju_down", path: "assets/hd/characters/juju-down.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_juju_down_b", path: "assets/hd/characters/juju-down-step.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_juju_up", path: "assets/hd/characters/juju-up.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_juju_up_b", path: "assets/hd/characters/juju-up-step.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_juju_side", path: "assets/hd/characters/juju-side.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_juju_side_b", path: "assets/hd/characters/juju-side-step.svg", w: 192, h: 256, status: "temporary" },

  { key: "hd_baba_down", path: "assets/hd/characters/baba-down.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_baba_down_b", path: "assets/hd/characters/baba-down-step.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_baba_up", path: "assets/hd/characters/baba-up.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_baba_up_b", path: "assets/hd/characters/baba-up-step.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_baba_side", path: "assets/hd/characters/baba-side.svg", w: 192, h: 256, status: "temporary" },
  { key: "hd_baba_side_b", path: "assets/hd/characters/baba-side-step.svg", w: 192, h: 256, status: "temporary" },

  { key: "portrait_juju", path: "assets/hd/portraits/juju.svg", w: 200, h: 250, status: "temporary" },
  { key: "portrait_baba", path: "assets/hd/portraits/baba.svg", w: 200, h: 250, status: "temporary" },
];

export const HD_GLOW = "hd_glow";
export const HD_WATER = "hd_water_base";
