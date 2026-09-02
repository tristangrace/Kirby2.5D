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

| Device | Walk | Action (reserved) |
| --- | --- | --- |
| Keyboard | WASD / arrow keys | Space / J |
| Gamepad (Xbox, PlayStation, Switch Pro, MFi) | left stick / d-pad | A / Cross |
| Touch (iPad) | drag anywhere on the left side | red A button |

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

## Layout

```
src/
  main.js                 bootstrap: new Game, load level, start loop
  Game.js                 composition root; owns engine/camera/input/level/entities
  core/
    Engine.js             renderer, low-res pixel canvas, frame loop
    Input.js              keyboard + gamepad + touch -> named actions and a movement axis
    TouchControls.js      on-screen joystick / button overlay for touch devices
    EventBus.js           pub/sub so systems don't import each other
  gfx/
    IsoCamera.js          orthographic iso camera, pixel snapping, basis vectors
    PixelArt.js           PixelBuffer (ellipse/outline/flip) + texture helpers
    Textures.js           procedural tile surfaces (grass, dirt, water...)
    sprites/KirbySprite.js  Kirby frames + sprite sheet
  world/
    Tiles.js              tile type registry (surfaces, height, walkable)
    Level.js              LevelData -> instanced meshes + collision queries
    levels/index.js       level registry
    levels/hello.js       the starter island
  entities/
    Entity.js             base lifecycle: onSpawn / update / onDespawn
    SpriteEntity.js       camera-facing pixel billboard + shadow + animation
    Player.js             Kirby: input, collision, animation state
    registry.js           type string -> class
    index.js              registers built-in entity types
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

**Add a monster:** subclass `SpriteEntity` (or `Entity`), set `static type = 'waddleDee'`,
build its frames with `PixelBuffer` the way `KirbySprite.js` does, and
`registerEntity(WaddleDee)` in `entities/index.js`. Then list it in a level's
`entities: [{ type: 'waddleDee', col, row }]` and the level loader spawns it.
Use `game.events` (`emit` / `on`) for hits, pickups, and other cross-system
messages.

**Add an input action:** extend `DEFAULT_BINDINGS` in `core/Input.js` and
query it with `input.isDown('action')` / `input.justPressed('action')`.
