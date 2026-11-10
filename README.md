# Mossby Village

A cosy merge-and-build game for Android. Pitch tents, drag matching buildings together,
and grow a forest camp into a skyline.

- 12 buildings, from Tent to Sky Spire
- 8 settlement ranks (Camp, Hamlet, Village, Town, City, Metropolis, Capital, Megacity)
- Each rank clears more forest and unlocks bigger merges
- Day and night cycle, villagers, chimney smoke, confetti, sound and haptics
- Saves on the device, earns coins while you are away (up to 2 hours)
- No assets to license: every sprite is drawn in code

## Project layout

| Path | What it is |
| --- | --- |
| `src/` | The game: `game.js`, `style.css`, `body.html` |
| `tools/build.mjs` | Builds `www/` from `src/` |
| `www/` | The built web app (also works as an installable PWA) |
| `android/` | Capacitor Android project that wraps `www/` |
| `.github/workflows/android.yml` | Builds a debug APK on every push |

## Run it

```sh
npm install
npm run build
npm run serve        # open the printed URL on your phone or in a browser
```

## Get an APK without installing anything

Every push runs the **Android build** workflow. Open the run under the Actions tab and
download `mossby-village-debug-apk`. That APK installs on any Android 7+ phone for testing.

## Ship to Google Play

1. Create a Play Console developer account (one-time 25 USD fee).
2. Decide the final app ID before the first upload. It is `app.mossby.village` in
   `capacitor.config.json` and `android/app/build.gradle`, and Play never lets you change it later.
3. `npm run android:sync`, then open `android/` in Android Studio.
4. Build > Generate Signed App Bundle. Keep the keystore safe, you need it for every update.
5. In Play Console: create the app, upload the `.aab`, add the store listing
   (icon is in `www/icons/`, you also need a 1024x500 feature graphic and phone screenshots),
   fill in the content rating and data safety forms. The game collects no data.
6. New personal accounts must run a closed test with 12 testers for 14 days before
   Google allows a production release.

## Tuning

All balance numbers sit at the top of `src/game.js` (`RANKS`, `inc`, `buildCost`, `spawnCost`,
`marketCost`). In the browser console, `__sim(3600)` plays one hour with a simple bot and
reports when each rank was reached.
