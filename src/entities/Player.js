import * as THREE from 'three';
import { SpriteEntity } from './SpriteEntity.js';
import { getKirbySpriteSheet } from '../gfx/sprites/KirbySprite.js';
import { Save } from '../core/Save.js';

const _move = new THREE.Vector3();
const _dir = new THREE.Vector3();

const GRAVITY = 24;
const JUMP_SPEED = 7.6;
const FLAP_SPEED = 4.4;
const FLOAT_GRAVITY = 7;
const FLOAT_FALL = 1.4; // terminal velocity while puffed up
const MAX_FALL = 12;
const MAX_ALTITUDE = 6.5; // above the ground under him
const INHALE_RANGE = 2.7;
const INHALE_CONE = 0.45; // cosine of the half-angle in front of his mouth

/** Copy abilities sold in the shop. `hold` abilities fire while B is held and root Kirby. */
export const ABILITIES = {
  sword: { label: 'Sword', price: 30, hold: false, blurb: 'Swing a blade. Hits everything in front.' },
  beam: { label: 'Beam', price: 25, hold: false, blurb: 'Whip a crackling arc of sparks.' },
  fire: { label: 'Fire', price: 40, hold: true, blurb: 'Breathe fire while B is held.' },
  ice: { label: 'Ice', price: 35, hold: true, blurb: 'Freezing breath that passes through foes.' },
  spark: { label: 'Spark', price: 2, hold: true, blurb: 'Call lightning down all around you.' },
};

/**
 * Kirby.
 *
 * Game Boy rules: A jumps, A again in the air puffs him up so he floats, and
 * every further A press is a flap upward. B inhales while held; anything
 * inhalable in front of his mouth gets pulled in, after which B spits it
 * out as a star. While floating, B exhales an air puff and drops him.
 *
 * The sprite only faces left or right, but the world has eight directions,
 * so "in front of his mouth" means the way he last walked (`aim`).
 *
 * Landing in water dunks him: one HP and back to the last dry ground.
 */
export class Player extends SpriteEntity {
  static type = 'player';

  constructor(game, opts) {
    super(game, opts, getKirbySpriteSheet());
    this.team = 'player';
    this.speed = 4.2; // world units per second
    this.radius = 0.28; // collision footprint
    this.height = 0.9;
    this.maxStep = 0.55; // largest height change that can be walked up
    this.maxDrop = Infinity; // he can always walk off an edge (and fall)

    this.maxHp = 6;
    this.hp = this.maxHp;
    this.lives = 3;

    this.vy = 0;
    this.grounded = true;
    this.walking = false;
    this.flying = false;
    this.inhaling = false;
    this.full = false;
    this.mouthful = null; // entity type string of whatever he swallowed
    this.state = 'normal'; // normal | hurt | dead | victory
    this.stateTimer = 0;
    this.invulnTimer = 0;
    this.blinkTimer = 2;
    this.blinking = false;
    this.oneShot = null; // non-looping animation currently overriding the pose
    this.knockback = new THREE.Vector3();
    this.aim = new THREE.Vector3(); // last direction he moved in: where he spits, puffs and inhales
    this.facingDir(this.aim);
    this.lastSafe = this.position.clone();
    this.spawnPos = this.position.clone();

    // Shop: point stars and copy abilities, kept between visits.
    const saved = Save.load();
    this.stars = saved.stars ?? 0;
    this.owned = new Set(saved.owned ?? []);
    this.ability = saved.ability && this.owned.has(saved.ability) ? saved.ability : null;
    this.abilityTimer = 0;
    this.attacking = false;
    this.nearShop = null;
  }

  // ---------------------------------------------------------------- shop

  addStars(n) {
    this.stars += n;
    this.game.events.emit('player:stars', this.stars);
    this.persist();
  }

  /** Buy (if needed) and equip an ability; null equips nothing. Returns false if unaffordable. */
  equip(name) {
    if (name && !this.owned.has(name)) {
      const price = ABILITIES[name]?.price ?? Infinity;
      if (this.stars < price) return false;
      this.stars -= price;
      this.owned.add(name);
      this.game.events.emit('player:stars', this.stars);
    }
    this.ability = name;
    this.attacking = false;
    this.game.events.emit('player:ability', name);
    this.persist();
    return true;
  }

  persist() {
    Save.save({ stars: this.stars, owned: [...this.owned], ability: this.ability });
  }

  // ---------------------------------------------------------------- frame

  update(dt) {
    this.airborne = !this.grounded;
    this.updateInvulnerability(dt);

    switch (this.state) {
      case 'dead':
        this.updateDead(dt);
        break;
      case 'hurt':
        this.stateTimer -= dt;
        this.tryMove(this.knockback.x * dt, this.knockback.z * dt);
        this.knockback.multiplyScalar(Math.max(0, 1 - 6 * dt));
        this.physics(dt);
        if (this.stateTimer <= 0) this.state = 'normal';
        break;
      case 'victory':
        this.stateTimer -= dt;
        this.physics(dt);
        if (this.stateTimer <= 0) this.state = 'normal';
        break;
      default:
        this.handleInput(dt);
        this.physics(dt);
        this.checkContacts();
    }

    this.setAnimation(this.chooseAnimation(dt), false);
    super.update(dt);
  }

  updateInvulnerability(dt) {
    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      this.visible = this.invulnTimer <= 0 || Math.floor(this.invulnTimer * 14) % 2 === 0;
    } else {
      this.visible = true;
    }
  }

  handleInput(dt) {
    const { input, iso } = this.game;
    const axis = input.axis();
    const moving = axis.x !== 0 || axis.y !== 0;

    // Shops: B at a stall opens the menu instead of anything else.
    this.nearShop = null;
    if (this.grounded && !this.full) {
      for (const e of this.game.entities) {
        if (e.isShop && e.alive && this.distanceXZ(e) < 1.4) {
          this.nearShop = e;
          break;
        }
      }
    }
    if (this.nearShop && input.justPressed('action')) {
      this.inhaling = false;
      this.setInhaleSound(false);
      this.attacking = false;
      this.game.events.emit('shop:open', this.nearShop);
      return;
    }

    // B: copy ability if he has one, else inhale (hold) / spit / exhale.
    this.attacking = false;
    if (this.ability && !this.flying && !this.full) {
      this.inhaling = false;
      this.useAbility(dt);
    } else if (this.inhaling) {
      if (!input.isDown('action') || this.flying || this.full) this.inhaling = false;
    } else if (input.justPressed('action')) {
      if (this.flying) this.exhale();
      else if (this.full) this.spit();
      else this.inhaling = true;
    }
    this.setInhaleSound(this.inhaling);

    // Footsteps while walking on the ground.
    if (this.grounded && moving && !this.inhaling && !this.attacking) {
      this.stepTimer = (this.stepTimer ?? 0) - dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.26;
        this.game.events.emit('kirby:footstep', { position: this.position });
      }
    } else {
      this.stepTimer = 0;
    }

    // Walk. Inhaling roots him; a mouthful or a puffed body slows him.
    let speed = this.speed;
    if (this.inhaling || this.attacking) speed = 0;
    else if (this.full) speed = 3.0;
    else if (this.flying) speed = 3.4;
    this.walking = moving && speed > 0;
    if (this.walking) {
      _move.set(0, 0, 0).addScaledVector(iso.groundRight, axis.x).addScaledVector(iso.groundForward, axis.y);
      this.tryMove(_move.x * speed * dt, _move.z * speed * dt);
      if (axis.x !== 0) this.facing = Math.sign(axis.x);
      this.aim.copy(_move).normalize();
    }

    // A: jump, puff up, flap.
    if (input.justPressed('jump')) {
      if (this.grounded) {
        this.vy = this.full ? JUMP_SPEED * 0.72 : JUMP_SPEED;
        this.grounded = false;
        this.airborne = true;
        this.game.events.emit('kirby:jump', { position: this.position });
      } else if (this.flying) {
        this.vy = Math.max(this.vy, 0) * 0.3 + FLAP_SPEED;
        this.playOneShot('flap');
        this.puffCount = Math.min(8, (this.puffCount ?? 1) + 1);
        this.game.events.emit('kirby:puff', { position: this.position, count: this.puffCount });
      } else if (!this.full && !this.inhaling && !this.attacking) {
        this.flying = true;
        this.vy = FLAP_SPEED;
        this.playOneShot('flap');
        this.puffCount = 1;
        this.game.events.emit('kirby:puff', { position: this.position, count: 1 });
      }
    }

    if (this.inhaling) this.pullEnemies();
  }

  physics(dt) {
    const level = this.game.level;
    if (this.flying) {
      this.vy -= FLOAT_GRAVITY * dt;
      if (this.vy < -FLOAT_FALL) this.vy = -FLOAT_FALL;
    } else {
      this.vy -= GRAVITY * dt;
      if (this.vy < -MAX_FALL) this.vy = -MAX_FALL;
    }
    this.position.y += this.vy * dt;

    const ceiling = this.groundY + MAX_ALTITUDE;
    if (this.position.y > ceiling) {
      this.position.y = ceiling;
      this.vy = Math.min(this.vy, 0);
    }

    this.refreshGround();
    const tile = level.tileAtWorld(this.position.x, this.position.z);
    if (this.position.y <= this.groundY) {
      if (tile?.liquid && this.vy <= 0) return this.dunk();
      this.position.y = this.groundY;
      if (this.vy <= 0) {
        if (!this.grounded) this.land();
        this.grounded = true;
        this.vy = 0;
      }
    } else {
      this.grounded = false;
    }
    if (this.grounded && tile && !tile.liquid) this.lastSafe.copy(this.position);
  }

  land() {
    if (this.flying) {
      this.flying = false;
      this.oneShot = null;
    }
    this.game.events.emit('kirby:land', { position: this.position, force: Math.min(1, Math.abs(this.vy) / 10) });
  }

  /** Start / stop the inhale sound bed without spamming the bus. */
  setInhaleSound(active) {
    if (this._inhaleSound === active) return;
    this._inhaleSound = active;
    this.game.events.emit(active ? 'inhale:start' : 'inhale:stop', { position: this.position });
  }

  /** Fell in the water: splash, lose a heart, back to dry land. */
  dunk() {
    const { x, z } = this.position;
    this.game.spawn('effect', { kind: 'splash', x, y: this.groundY, z });
    this.flying = false;
    this.inhaling = false;
    this.vy = 0;
    this.position.copy(this.lastSafe);
    this.refreshGround();
    this.position.y = this.groundY;
    this.grounded = true;
    this.hurt(1, null);
  }

  checkContacts() {
    for (const e of this.game.entities) {
      if (e.team !== 'enemy' || !e.alive || !(e.contactDamage > 0) || e.beingInhaled) continue;
      if (this.overlaps(e)) {
        this.hurt(e.contactDamage, e);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- abilities

  useAbility(dt) {
    const input = this.game.input;
    const def = ABILITIES[this.ability];
    this.abilityTimer -= dt;
    if (!def) return;
    const m = this.mouthPoint(); // leaves the aim direction in _dir
    const spawn = (opts) => this.game.spawn('projectile', { team: 'player', ...opts });

    if (!def.hold) {
      if (!input.justPressed('action') || this.abilityTimer > 0) return;
      this.playOneShot('spit');
      this.game.events.emit(this.ability === 'sword' ? 'kirby:spit' : 'star:collected', { position: this.position });
      if (this.ability === 'sword') {
        this.abilityTimer = 0.32;
        spawn({ kind: 'slash', x: this.position.x + _dir.x * 0.8, y: this.position.y + 0.35, z: this.position.z + _dir.z * 0.8, life: 0.16, damage: 2, pierce: true });
      } else if (this.ability === 'beam') {
        this.abilityTimer = 0.5;
        for (let i = 0; i < 8; i++) {
          const angle = (1 - i / 7) * 1.4;
          const r = 1.45;
          spawn({
            kind: 'spark',
            x: this.position.x + _dir.x * Math.cos(angle) * r,
            y: this.position.y + 0.4 + Math.sin(angle) * r,
            z: this.position.z + _dir.z * Math.cos(angle) * r,
            life: 0.12 + i * 0.03,
            damage: 1,
            hitEffect: null,
          });
        }
      }
      return;
    }

    if (!input.isDown('action')) {
      this.holdSound = 0;
      return;
    }
    this.attacking = true;
    this.holdSound = (this.holdSound ?? 0) - dt;
    if (this.holdSound <= 0) {
      this.holdSound = this.ability === 'spark' ? 0.18 : 0.3;
      this.game.events.emit(this.ability === 'spark' ? 'enemy:hit' : 'kirby:exhale', { position: this.position });
    }
    if (this.abilityTimer > 0) return;
    if (this.ability === 'fire') {
      this.abilityTimer = 0.07;
      const spread = (Math.random() - 0.5) * 1.6;
      spawn({ kind: 'flame', x: m.x, y: m.y, z: m.z, vx: _dir.x * 5.5 - _dir.z * spread, vz: _dir.z * 5.5 + _dir.x * spread, vy: 0.6, life: 0.34, damage: 1, hitEffect: null });
    } else if (this.ability === 'ice') {
      this.abilityTimer = 0.09;
      const spread = (Math.random() - 0.5) * 1.2;
      spawn({ kind: 'ice', tint: '#9ad9ff', x: m.x, y: m.y, z: m.z, vx: _dir.x * 4.2 - _dir.z * spread, vz: _dir.z * 4.2 + _dir.x * spread, life: 0.45, damage: 1, pierce: true, hitEffect: null });
    } else if (this.ability === 'spark') {
      // Lightning strikes the ground in a ring around him, plus a crackle on his body.
      this.abilityTimer = 0.07;
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.9 + Math.random() * 1.5;
        const bx = this.position.x + Math.cos(a) * r;
        const bz = this.position.z + Math.sin(a) * r;
        const ground = this.game.level.heightAt(bx, bz);
        if (ground == null) continue;
        spawn({ kind: 'bolt', x: bx, y: ground, z: bz, life: 0.14, damage: 1, pierce: true, hitEffect: null });
        this.game.spawn('effect', { kind: 'hit', x: bx, y: ground + 0.05, z: bz });
      }
      const sa = Math.random() * Math.PI * 2;
      spawn({ kind: 'spark', x: this.position.x + Math.cos(sa) * 0.5, y: this.position.y + 0.2 + Math.random() * 0.6, z: this.position.z + Math.sin(sa) * 0.5, life: 0.1, damage: 1, hitEffect: null });
    }
  }

  // ---------------------------------------------------------------- inhale / spit

  /** Point in front of his mouth that inhaled things are pulled toward (aim direction left in _dir). */
  mouthPoint() {
    _dir.copy(this.aim);
    return { x: this.position.x + _dir.x * 0.45, y: this.position.y + 0.35, z: this.position.z + _dir.z * 0.45 };
  }

  pullEnemies() {
    const m = this.mouthPoint();
    for (const e of this.game.entities) {
      if (!e.alive || e.team !== 'enemy' || !e.inhalable) continue;
      const dx = e.position.x - m.x;
      const dz = e.position.z - m.z;
      const dist = Math.hypot(dx, dz);
      if (dist > INHALE_RANGE) continue;
      if (Math.abs(e.position.y - m.y) > 1.3) continue;
      const dot = dist > 1e-3 ? (dx * _dir.x + dz * _dir.z) / dist : 1;
      if (dot < INHALE_CONE) continue;
      e.inhalePull = m;
    }
  }

  onSwallow(enemy) {
    this.full = true;
    this.mouthful = enemy.constructor.type;
    this.inhaling = false;
    this.game.events.emit('player:mouthful', this.mouthful);
  }

  spit() {
    const m = this.mouthPoint();
    this.full = false;
    this.mouthful = null;
    this.playOneShot('spit');
    this.game.events.emit('kirby:spit', { position: this.position });
    this.game.spawn('projectile', {
      kind: 'star',
      team: 'player',
      x: m.x + _dir.x * 0.2,
      y: m.y,
      z: m.z + _dir.z * 0.2,
      vx: _dir.x * 9,
      vz: _dir.z * 9,
      life: 1.3,
      damage: 2,
    });
    this.game.events.emit('player:mouthful', null);
  }

  exhale() {
    const m = this.mouthPoint();
    this.flying = false;
    this.playOneShot('exhale');
    this.game.events.emit('kirby:exhale', { position: this.position });
    this.game.spawn('projectile', {
      kind: 'puff',
      team: 'player',
      x: m.x,
      y: m.y,
      z: m.z,
      vx: _dir.x * 5.5,
      vz: _dir.z * 5.5,
      life: 0.5,
      damage: 1,
    });
  }

  // ---------------------------------------------------------------- damage

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.game.events.emit('player:hp', { hp: this.hp, maxHp: this.maxHp });
  }

  /** Returns false if the hit was ignored (invulnerable, dead, celebrating). */
  hurt(amount, source) {
    if (this.state === 'dead' || this.state === 'victory' || this.invulnTimer > 0) return false;
    this.hp -= amount;
    this.game.events.emit('player:hp', { hp: this.hp, maxHp: this.maxHp });

    this.flying = false;
    this.inhaling = false;
    this.oneShot = null;
    if (this.full) {
      this.full = false;
      this.mouthful = null;
      this.game.events.emit('player:mouthful', null);
    }
    this.invulnTimer = 1.6;
    this.flash('#ff8080', 0.25);
    this.setInhaleSound(false);
    this.game.events.emit('player:damaged', { source: source?.position, position: this.position });
    this.game.spawn('effect', { kind: 'hit', x: this.position.x, y: this.position.y + 0.5, z: this.position.z });

    if (this.hp <= 0) {
      this.die();
      return true;
    }

    this.state = 'hurt';
    this.stateTimer = 0.35;
    if (source) {
      _dir.set(this.position.x - source.position.x, 0, this.position.z - source.position.z);
      if (_dir.lengthSq() < 1e-4) this.facingDir(_dir).negate();
      _dir.normalize();
      this.knockback.copy(_dir).multiplyScalar(5);
      this.vy = 3.5;
      this.grounded = false;
      this.airborne = true;
    } else {
      this.knockback.set(0, 0, 0);
    }
    return true;
  }

  die() {
    this.state = 'dead';
    this.stateTimer = 1.7;
    this.vy = 0;
    this.invulnTimer = 0;
    this.visible = true;
    this.knockback.set(0, 0, 0);
    this.game.events.emit('player:died', this);
  }

  updateDead(dt) {
    this.stateTimer -= dt;
    this.position.y += 2.2 * dt;
    if (Math.floor(this.stateTimer * 10) % 2 === 0) this.facing = -this.facing;
    if (this.stateTimer <= 0) this.respawn();
  }

  respawn() {
    this.lives -= 1;
    if (this.lives < 0) {
      this.lives = 3;
      this.game.events.emit('game:over', this);
    }
    this.hp = this.maxHp;
    this.position.copy(this.spawnPos);
    this.refreshGround();
    this.position.y = this.groundY;
    this.lastSafe.copy(this.position);
    this.grounded = true;
    this.vy = 0;
    this.flying = false;
    this.inhaling = false;
    this.full = false;
    this.mouthful = null;
    this.state = 'normal';
    this.invulnTimer = 2;
    this.facing = 1;
    this.facingDir(this.aim);
    this.game.iso.focus.copy(this.position);
    this.game.iso.snapToFocus();
    this.game.events.emit('player:hp', { hp: this.hp, maxHp: this.maxHp });
    this.game.events.emit('player:lives', this.lives);
    this.game.events.emit('player:mouthful', null);
    this.game.events.emit('player:respawn', this);
  }

  onVictory() {
    this.state = 'victory';
    this.stateTimer = 3;
    this.flying = false;
    this.inhaling = false;
    this.oneShot = null;
    this.game.events.emit('player:victory', this);
  }

  // ---------------------------------------------------------------- animation

  playOneShot(name) {
    this.oneShot = name;
    this.setAnimation(name, true);
  }

  onAnimationEnd(name) {
    if (name === this.oneShot) this.oneShot = null;
    if (name === 'blink') this.blinking = false;
  }

  chooseAnimation(dt) {
    if (this.state === 'dead' || this.state === 'hurt') return 'hurt';
    if (this.state === 'victory') return 'victory';
    if (this.oneShot) return this.oneShot;
    if (this.attacking) return this.ability === 'spark' ? 'victory' : 'inhale';
    if (this.inhaling) return 'inhale';
    if (this.flying) return 'float';
    if (this.full) return this.grounded ? (this.walking ? 'fullWalk' : 'full') : 'fullJump';
    if (!this.grounded) return this.vy > 0.5 ? 'jump' : 'fall';
    if (this.walking) return 'walk';

    if (this.blinking) return 'blink';
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 2 + Math.random() * 3;
      this.blinking = true;
      this.setAnimation('blink', true);
      return 'blink';
    }
    return 'idle';
  }
}
