// Engine-free circle-vs-blocked-grid collision with axis-separated sliding.
// The grid is in TILE space: cell (tx, ty) covers world X in [tx, tx+1) and
// world Z in (-(ty+1), -ty]. See coords.ts for the axis convention.

export interface GridCollider {
  readonly w: number;
  readonly h: number;
  blocked: boolean[][];
  /** Is the tile containing world (x, z) blocked (or outside the map)? */
  isBlockedAt(x: number, z: number): boolean;
  isBlockedTile(tx: number, ty: number): boolean;
  /** Slide a circle of `radius` from (x, z) by (dx, dz); returns the resolved position. */
  move(x: number, z: number, dx: number, dz: number, radius: number): { x: number; z: number };
  /** Mark a rectangle of tiles blocked (used for extra 3D-only footprints). */
  block(tx: number, ty: number, w: number, h: number): void;
  unblock(tx: number, ty: number): void;
}

export function createGridCollider(blocked: boolean[][]): GridCollider {
  const h = blocked.length;
  const w = h ? blocked[0].length : 0;

  const isBlockedTile = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return true;
    return blocked[ty][tx];
  };

  const isBlockedAt = (x: number, z: number) => isBlockedTile(Math.floor(x), Math.floor(-z));

  /** Does a circle at (x, z) overlap any blocked tile? */
  const overlaps = (x: number, z: number, r: number) => {
    const ty0 = Math.floor(-z - r);
    const ty1 = Math.floor(-z + r);
    const tx0 = Math.floor(x - r);
    const tx1 = Math.floor(x + r);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isBlockedTile(tx, ty)) continue;
        // closest point on the tile box to the circle centre
        const bx0 = tx;
        const bx1 = tx + 1;
        const bz0 = -(ty + 1);
        const bz1 = -ty;
        const cx = Math.max(bx0, Math.min(x, bx1));
        const cz = Math.max(bz0, Math.min(z, bz1));
        const ddx = x - cx;
        const ddz = z - cz;
        if (ddx * ddx + ddz * ddz < r * r) return true;
      }
    }
    return false;
  };

  const move = (x: number, z: number, dx: number, dz: number, radius: number) => {
    // clamp to map bounds (keeps a walk-off exit possible via the border gap tiles)
    let nx = x;
    let nz = z;
    // X axis
    if (dx !== 0) {
      const tx = x + dx;
      if (!overlaps(tx, nz, radius)) nx = tx;
      else {
        // snap flush against the wall
        const step = Math.sign(dx) * 0.01;
        let t = x;
        for (let i = 0; i < 40; i++) {
          const nt = t + step;
          if (overlaps(nt, nz, radius)) break;
          t = nt;
        }
        nx = t;
      }
    }
    // Z axis
    if (dz !== 0) {
      const tz = nz + dz;
      if (!overlaps(nx, tz, radius)) nz = tz;
      else {
        const step = Math.sign(dz) * 0.01;
        let t = nz;
        for (let i = 0; i < 40; i++) {
          const nt = t + step;
          if (overlaps(nx, nt, radius)) break;
          t = nt;
        }
        nz = t;
      }
    }
    nx = Math.max(0.05, Math.min(w - 0.05, nx));
    nz = Math.max(-(h - 0.05), Math.min(-0.05, nz));
    return { x: nx, z: nz };
  };

  const block = (tx: number, ty: number, bw: number, bh: number) => {
    for (let y = ty; y < ty + bh; y++)
      for (let x = tx; x < tx + bw; x++) if (x >= 0 && y >= 0 && x < w && y < h) blocked[y][x] = true;
  };
  const unblock = (tx: number, ty: number) => {
    if (tx >= 0 && ty >= 0 && tx < w && ty < h) blocked[ty][tx] = false;
  };

  return { w, h, blocked, isBlockedAt, isBlockedTile, move, block, unblock };
}
