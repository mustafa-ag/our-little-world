// Vehicles: the little village car is a hero asset (assets/hero/car.ts):
// GLB with a procedural fallback, muted carTeal by default. Variants:
// "c=#hex" retints the body paint; "kind=" is accepted and ignored (the old
// jeep/prototype box car is gone).

import type { AssetManager } from "../AssetManager";

export function registerVehicles(am: AssetManager) {
  am.registerHero("car");
}
