import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { EventBus } from './core/EventBus.js';
import { IsoCamera } from './gfx/IsoCamera.js';
import { Level } from './world/Level.js';
import { getLevel } from './world/levels/index.js';
import { createEntity } from './entities/index.js';

/**
 * Top-level composition: engine + camera + input + the current level and its
 * entities. Systems added later (enemies, abilities, HUD, audio) should hang
 * off this object and talk through `events` rather than to each other.
 */
export class Game {
  constructor(container, { pixelScale = 'auto', pixelsPerUnit = 24 } = {}) {
    this.engine = new Engine({ pixelScale });
    this.input = new Input();
    this.events = new EventBus();
    this.iso = new IsoCamera({ pixelsPerUnit });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd3ff');

    this.level = null;
    this.player = null;
    this.entities = [];

    this._setupLights();
    this.engine.onResize((w, h) => this.iso.setViewport(w, h));
    this.engine.mount(container);
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight('#e6f4ff', '#5f8a3c', 0.9);
    const sun = new THREE.DirectionalLight('#fff6e0', 1.1);
    sun.position.set(4, 8, 1.5); // slightly favours the +x faces so the two visible sides differ
    this.scene.add(hemi, sun);
  }

  loadLevel(id) {
    this.unloadLevel();
    const data = getLevel(id);
    this.level = new Level(data);
    this.level.build(this.scene);

    this.player = this.spawn('player', this.level.spawnPoint());
    for (const e of data.entities ?? []) {
      this.spawn(e.type, { ...e, x: e.col + 0.5, z: e.row + 0.5 });
    }

    this.iso.focus.copy(this.player.position);
    this.iso.snapToFocus();
    this.events.emit('level:loaded', { id, level: this.level });
  }

  unloadLevel() {
    for (const e of this.entities) e.onDespawn(this.scene);
    this.entities = [];
    this.player = null;
    if (this.level) {
      this.level.dispose(this.scene);
      this.events.emit('level:unloaded', { id: this.level.data.id });
      this.level = null;
    }
  }

  spawn(type, opts) {
    const entity = createEntity(type, this, opts);
    entity.onSpawn(this.scene);
    this.entities.push(entity);
    this.events.emit('entity:spawned', entity);
    return entity;
  }

  update(dt, elapsed) {
    this.input.update();
    for (const e of this.entities) if (e.alive) e.update(dt);

    if (this.entities.some((e) => !e.alive)) {
      for (const e of this.entities) if (!e.alive) e.onDespawn(this.scene);
      this.entities = this.entities.filter((e) => e.alive);
    }

    if (this.player) this.iso.focus.copy(this.player.position);
    this.iso.update(dt);
    this.level?.update(dt, elapsed);

    this.engine.render(this.scene, this.iso.camera);
    this.input.endFrame();
  }

  start() {
    this.engine.start((dt, elapsed) => this.update(dt, elapsed));
  }

  dispose() {
    this.unloadLevel();
    this.input.dispose();
    this.engine.dispose();
  }
}
