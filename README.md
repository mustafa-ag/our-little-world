# Our Little World

A cute top-down pixel life-sim, made as a gift. You play as her, exploring
little towns, doing sweet side quests, travelling a world map (Home/UAE,
London, Scotland, Countryside, Amman), changing outfits, driving the highway,
and building a life in your own home.

It's a web game that installs to an iPhone home screen (PWA) and feels like a
real app — fullscreen, offline-capable, no App Store needed.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL (e.g. http://localhost:5173). On your phone, use the
Network URL shown in the terminal (same Wi-Fi).

## Build / preview

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
```

## Put it on her iPhone (no App Store)

1. Deploy `dist/` to any free static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages).
   - Netlify quick way: drag-and-drop the `dist/` folder at https://app.netlify.com/drop
2. Open the deployed link in **Safari** on her iPhone.
3. Tap the Share button -> **Add to Home Screen**.
4. It installs an app icon and opens fullscreen. Progress saves on her device.

## Controls

- **Phone:** touch-drag the left side to move (virtual joystick). Tap **A** to
  interact / advance dialogue. **Map** opens the world map. **Fit** opens the wardrobe.
- **Laptop:** WASD/arrow keys to move, Space or E to interact.

## Little-life systems

- **Phone:** messages, city map, contacts, outfits, a Polaroid album, discovered notes, keepsakes, and inventory live in one mobile-friendly overlay.
- **Polaroids:** find `CAM` markers in the world, complete the framing activity, and revisit each saved moment from the album or home photo wall.
- **Companions:** build relationships through conversation, gifts, quests, and milestones. Some people unlock as optional travel companions from the Contacts page.
- **Daily moments:** encounters are deterministically chosen per day and location, so reloading does not reroll or duplicate them.
- **Secrets:** 20 small, trackable discoveries are spread across the world. Found notes and keepsakes are collected in the phone.
- **Home:** sleep advances the day and saves. The photo wall and keepsake shelf reflect persistent progress.

## Save safety

Saves are versioned and migrated forward automatically. Existing saves keep their
progress when the game updates; new fields such as photos, companions, keepsakes,
and notes receive safe defaults. Local play has three independent story slots,
with a mirrored legacy save and a local backup archive for recovery.

If cloud save is configured, it mirrors the same versioned archive. Never edit
browser storage manually while a game is open.

## How to make it personal (edit these files)

Everything is designed to be easy to customise:

- `src/game/data/npcs.ts` — names, hair/skin/outfit colours, who lives where,
  and their dialogue. The player character is `her` (`PLAYER`).
- `src/game/data/quests.ts` — the side quests (steps, rewards, messages).
- `src/game/data/locations.ts` — the places, their themes, and world-map pins.
- `src/game/palette.ts` — colours and the wardrobe outfits.
- `src/game/data/photos.ts` — Polaroid locations, conditions, and captions.
- `src/game/data/secrets.ts` — discoverable secrets and their rewards.
- `src/game/data/relationshipMilestones.ts` — companion and keepsake unlocks.

## Tech

- [Phaser 3](https://phaser.io/) game engine
- [Vite](https://vitejs.dev/) dev/build
- TypeScript
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for installable/offline

All the pixel art (characters, tiles, buildings, landmarks, cars, furniture,
icons) is generated procedurally in code, so there are no external art assets to
manage. Swap in custom sprite sheets later if you want it to look exactly like
you two.
