import * as THREE from 'three';
import { SpriteEntity } from './SpriteEntity.js';
import { getStarSheet, getPuffSheet, getSparkSheet, getAppleSheet, getSlashSheet, getFlameSheet } from '../gfx/sprites/FxSprites.js';

/**
 * Something thrown, blown or swung: a spat star, Kirby's air puff, a beam
 * spark, an apple shaken loose by Whispy Woods, a sword slash, a flame.
 * Hurts whatever it touches on the other team, then disappears (or keeps
 * going, if it `pierce`s).
 */
export class Projectile extends SpriteEntity {
  static type = 'projectile';

  constructor(game, { kind = 'star', team = 'player', vx = 0, vy = 0, vz = 0, y = null, damage = 1, life = 1, gravity = 0, hitEffect = 'hit', pierce = false, tint = null, ...opts } = {}) {
    super(game, opts, Projectile.sheetFor(kind));
    this.kind = kind;
    this.team = team;
    this.velocity = new THREE.Vector3(vx, vy, vz);
    this.damage = damage;
    this.life = life;
    this.gravity = gravity;
    this.hitEffect = hitEffect;
    this.pierce = pierce;
    this.hit = pierce ? new Set() : null;
    this.airborne = true;
    this.radius = kind === 'spark' ? 0.2 : kind === 'slash' ? 0.45 : 0.28;
    this.height = kind === 'slash' ? 0.9 : 0.5;
    if (y != null) this.position.y = y;
    this.shadow.visible = kind === 'apple';
    if (tint) this.material.color.set(tint);
    this.faceToward(vx, vz);
  }

  static sheetFor(kind) {
    switch (kind) {
      case 'star':
        return getStarSheet();
      case 'puff':
      case 'ice':
        return getPuffSheet();
      case 'spark':
        return getSparkSheet();
      case 'apple':
        return getAppleSheet();
      case 'slash':
        return getSlashSheet();
      case 'flame':
        return getFlameSheet();
      default:
        throw new Error('Unknown projectile: ' + kind);
    }
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) return this.destroy();

    this.velocity.y -= this.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);
    this.refreshGround();

    const level = this.game.level;
    const tile = level.tileAtWorld(this.position.x, this.position.z);
    if (!tile) return this.impact();
    // Gravity-driven things land (checked first: at landing speed they overshoot the ground in one frame).
    if (this.gravity > 0 && this.position.y <= this.groundY) {
      this.position.y = this.groundY;
      return this.onLand(tile);
    }
    // Flown into a column taller than we are (with clearance for the small steps Kirby can walk up): stop here.
    if (!tile.liquid && tile.height > this.position.y + 0.3) return this.impact();

    // Hit anything on the other team.
    for (const e of this.game.entities) {
      if (!e.alive || e === this || e.team === this.team || e.team === 'neutral' || e.solid === false) continue;
      if (!e.hurt || !this.overlaps(e)) continue;
      if (this.hit) {
        if (this.hit.has(e)) continue;
        this.hit.add(e);
      }
      if (e.hurt(this.damage, this) !== false) {
        if (!this.pierce) return this.impact();
        if (this.hitEffect) this.spawnHit();
      }
    }

    super.update(dt);
  }

  spawnHit() {
    this.game.spawn('effect', { kind: this.hitEffect, x: this.position.x, y: this.position.y + 0.1, z: this.position.z });
  }

  /** Stop and show a hit spark. */
  impact() {
    if (this.hitEffect) this.spawnHit();
    this.destroy();
  }

  onLand(tile) {
    if (tile.liquid) {
      this.game.spawn('effect', { kind: 'splash', x: this.position.x, y: tile.height, z: this.position.z });
    } else if (this.kind === 'apple') {
      // Whispy's apples come to rest and can be inhaled and spat back.
      this.game.spawn('apple', { x: this.position.x, z: this.position.z });
    }
    this.destroy();
  }

  updateVisual() {
    super.updateVisual();
    if (this.kind !== 'apple') this.shadow.visible = false;
  }
}
