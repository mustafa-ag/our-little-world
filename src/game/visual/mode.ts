/** Dev visual mode. Not a player setting — flip this to compare pipelines. */
export const VISUAL_MODE: "hd" | "pixel" = "hd";

export const isHd = () => VISUAL_MODE === "hd";

/** Logical tiles that get the Yas HD terrain treatment. */
export const HD_SLICE_LOCATIONS = new Set(["abudhabi_yas"]);

export const isHdSlice = (locationId: string) => isHd() && HD_SLICE_LOCATIONS.has(locationId);

/** Source pixels per HD terrain tile. World size stays TILE. */
export const HD_TILE_SRC = 64;
