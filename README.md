# Kirby 2.5D

A hello-world isometric Kirby: a Game Boy-style pixel-art Kirby (in colour)
walking around a chunky 3D tile world. Built with Vite + three.js, ES modules,
and zero binary assets: every sprite and texture is drawn in code.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5190.

## Controls

Game Boy layout: A jumps, B inhales.

| Device | Walk | A: jump / fly | B: inhale / spit / exhale |
| --- | --- | --- | --- |
| Keyboard | WASD / arrow keys | K, Z or Space | J, X or Shift |
| Gamepad (Xbox, PlayStation, Switch Pro, MFi) | left stick / d-pad | A / Cross | B / X (Circle / Square) |
| Touch (iPad) | drag anywhere on the left side | red A button | blue B button |

- Press A on the ground to jump. Press A again in the air and Kirby puffs up
  and floats; every further A press flaps him higher. He can fly over water,
  hedges and up onto stone blocks and tree tops.
- Hold B to inhale. Anything in front of his mouth gets pulled in; press B
  again to spit it out as a star. Stars (and air puffs, from pressing B while
  floating) hurt enemies.
- Landing in water costs a heart and puts him back on the last dry ground.
- D-pad down (or F9) hard-reloads the page with the cache bypassed, so a
  fresh deploy shows up straight away on the Xbox. Walk with the stick.

The fullscreen button sits top-right. On an iPad, Share > Add to Home Screen
installs it as a full-screen app.

## Playing on a TV / console

- **Xbox Series X|S:** open Microsoft Edge on the Xbox, browse to the GitHub
  Pages URL below, then use the controller. Bookmark it (or pin it to Home) so
  it is one click next time. Press the fullscreen button with the cursor.
- **iPad:** open the URL in Safari; the on-screen joystick appears. A paired
  Bluetooth controller works too.
- PlayStation 5 and Switch 2 have no user-facing web browser, so they are out.

## Deploy to GitHub Pages

```bash
npm run deploy
```

Builds `dist/` and pushes it to the `gh-pages` branch, which GitHub Pages
serves at https://tristangrace.github.io/Kirby2.5D/. Commit and push `main`
separately for the source.

## Title screen and UI

The splash screen and HUD icons come from the 3D Kirby repo (`../Kirby`):
`src/ui/icons.js` (hearts, star, Kirby face, crown, A/B button glyphs,
sparkles, all inline SVG) and `src/ui/logo.js` (the stroke-built KIRBY
logotype) are copied verbatim, with the theme CSS trimmed to what this game
uses in `src/ui/theme.js`. The title (`src/ui/Title.js`) pauses the world,
drifts stars over a dusk scrim and starts on any button, Enter, Start or a tap.

## Shop and abilities

Defeated enemies pop out point stars (Whispy drops a pile), and more lie
around the level. Walk up to a market stall and press B to open the shop,
which sells copy abilities using the 3D game's ability icons: Sword (30),
Beam (25), Fire (40), Ice (35) and Spark (30). An equipped ability replaces
inhaling on B: Sword and Beam are single presses, Fire, Ice and Spark fire
while B is held and root Kirby in place. Pick "Normal" to go back to
inhaling. Stars and purchases are saved in localStorage.

## Green Greens

The first level runs west to east: the starting meadow, a plank bridge over
the river, a plateau with a staircase hill (Maxim Tomato on top) and a hedge
maze, a second river crossed by hopping ledges or flying, and the forest where
Whispy Woods waits inside a hedge ring. He blows air puffs and shakes apples
loose; inhale an apple (or anything else) and spit it back at him.

Enemies: Waddle Dee (wanders), Waddle Doo (whips a beam when you get close),
Bronto Burt (flies at you), Cappy (a mushroom that chases). All of them can
be inhaled.

## Layout

```
src/
  main.js                 bootstrap: new Game, HUD, load level, start loop
  Game.js                 composition root; owns engine/camera/input/level/entities
  core/
    Save.js               localStorage for stars and bought abilities
    Engine.js             renderer, low-res pixel canvas, frame loop
    Input.js              keyboard + gamepad + touch -> named actions and a movement axis
    TouchControls.js      on-screen joystick / A / B overlay for touch devices
    EventBus.js           pub/sub so systems don't import each other
  gfx/
    IsoCamera.js          orthographic iso camera, pixel snapping, basis vectors
    PixelArt.js           PixelBuffer (ellipse/polygon/star/outline/flip) + texture helpers
    Textures.js           procedural tile surfaces (grass, dirt, water, leaf, bark...)
    sprites/sheet.js      sprite sheet builder shared by every character
    sprites/KirbySprite.js  Kirby poses: walk, jump, float, inhale, full, hurt...
    sprites/EnemySprites.js Waddle Dee, Waddle Doo, Bronto Burt, Cappy
    sprites/WhispySprite.js Whispy Woods
    sprites/FxSprites.js    star, puff, spark, apple, tomato, poof, splash, hit
  world/
    Tiles.js              tile type registry (surfaces, height, walkable, liquid)
    Level.js              LevelData -> instanced meshes + collision queries
    levels/index.js       level registry
    levels/greenGreens.js the first level
    levels/hello.js       the original starter island
  entities/
    Entity.js             base lifecycle + cylinder hitbox + team
    SpriteEntity.js       camera-facing pixel billboard, shadow, animation, terrain movement
    Player.js             Kirby: jump / float / inhale / spit / hurt / respawn
    Enemy.js              base enemy: inhaled, hurt, die, wander / chase helpers
    enemies/              WaddleDee, WaddleDoo, BrontoBurt, Cappy, Apple, WhispyWoods
    items/MaximTomato.js  full heal pickup
    items/PointStar.js    currency pickup (popped out of enemies)
    ShopStall.js          market stall; B nearby opens the shop
    Projectile.js         star, air puff, beam spark, falling apple
    Effect.js             one-shot animated billboards (poof, splash, hit, sparkle)
    registry.js           type string -> class
    index.js              registers built-in entity types
  ui/
    Hud.js                hearts, lives, mouthful, boss bar, banner (DOM, icon SVGs)
    Title.js              splash screen: logo, stars, Press Start, white wipe
    Shop.js               ability shop card: browse, buy, equip
    icons.js, logo.js     inline SVG icon set and logotype (from ../Kirby)
    theme.js, fonts.js    UI stylesheet and font stack
```

## How the 2.5D works

- The world is real 3D: each tile is a box instance under an orthographic
  camera at yaw 45 / pitch 30 (classic 2:1 iso). Change the angle in one place
  (`IsoCamera.setAngles`) and input/billboards follow automatically because
  they read the camera's basis vectors.
- Characters are flat planes textured with nearest-filtered canvas art,
  rotated to face the camera and anchored at their feet. Positions are snapped
  to the render pixel grid so sprites never shimmer.
- The scene renders at window size / 3 and is upscaled with
  `image-rendering: pixelated`.

## Extending

**Add a level:** copy `src/world/levels/hello.js`, give it a new `id`, edit
the `rows` strings and `legend`, then `registerLevel()` it in
`levels/index.js`. Load it with `game.loadLevel('id')`.

**Add a tile type:** `registerTile('lava', { top: 'lava', side: 'stone', height: -0.2, walkable: false })`
in `world/Tiles.js`, and paint the `lava` surface in `gfx/Textures.js`.

**Add a monster:** subclass `Enemy`, set `static type = 'myEnemy'`, build a
sheet with `buildSheet` the way `EnemySprites.js` does, implement `behave(dt)`
(helpers: `wander`, `chase`, `stickToGround`, `dirToPlayer`) and register it
in `entities/index.js`. Then list it in a level's
`entities: [{ type: 'myEnemy', col, row }]` and the level loader spawns it.
Use `game.events` (`emit` / `on`) for hits, pickups, and other cross-system
messages.

**Add an input action:** extend `DEFAULT_BINDINGS` (and `GAMEPAD_BUTTONS`) in
`core/Input.js` and query it with `input.isDown('jump')` / `input.justPressed('jump')`.
