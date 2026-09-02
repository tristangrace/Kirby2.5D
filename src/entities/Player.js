import * as THREE from 'three';
import { SpriteEntity } from './SpriteEntity.js';
import { getKirbySpriteSheet } from '../gfx/sprites/KirbySprite.js';

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

    // B: inhale (hold) / spit / exhale.
    if (this.inhaling) {
      if (!input.isDown('action') || this.flying || this.full) this.inhaling = false;
    } else if (input.justPressed('action')) {
      if (this.flying) this.exhale();
      else if (this.full) this.spit();
      else this.inhaling = true;
    }

    // Walk. Inhaling roots him; a mouthful or a puffed body slows him.
    let speed = this.speed;
    if (this.inhaling) speed = 0;
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
      } else if (this.flying) {
        this.vy = Math.max(this.vy, 0) * 0.3 + FLAP_SPEED;
        this.playOneShot('flap');
      } else if (!this.full && !this.inhaling) {
        this.flying = true;
        this.vy = FLAP_SPEED;
        this.playOneShot('flap');
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
