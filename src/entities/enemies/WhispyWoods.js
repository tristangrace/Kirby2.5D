import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { getWhispySheet } from '../../gfx/sprites/WhispySprite.js';

const _dir = new THREE.Vector3();

/**
 * Whispy Woods, the boss of Green Greens. Rooted to the spot inside his hedge
 * ring; blows air puffs at Kirby and shakes apples loose from his canopy.
 * Spit the apples (or anything else) back at him to win.
 */
export class WhispyWoods extends Enemy {
  static type = 'whispyWoods';

  constructor(game, opts) {
    super(game, opts, getWhispySheet());
    this.maxHp = 12;
    this.hp = this.maxHp;
    this.contactDamage = 1;
    this.inhalable = false;
    this.radius = 0.75;
    this.height = 2.4;
    this.facing = -1;
    this.state = 'sleep'; // sleep | idle | blow | shake | defeated
    this.stateTimer = 0;
    this.attacksSinceApples = 0;
    this.engaged = false;
  }

  behave(dt) {
    this.stickToGround();
    const dist = this.distanceToPlayer();
    if (this.state === 'defeated') {
      this.setAnimation('defeated');
      return;
    }
    if (this.state === 'sleep') {
      this.setAnimation('idle');
      if (dist < 7.5) {
        this.state = 'idle';
        this.stateTimer = 1.0;
        this.engaged = true;
        this.game.events.emit('boss:engaged', this);
      }
      return;
    }

    // Always look at Kirby.
    this.dirToPlayer(_dir);
    this.faceToward(_dir.x, _dir.z);
    this.stateTimer -= dt;

    if (this.state === 'idle') {
      this.setAnimation('idle');
      if (this.stateTimer <= 0 && dist < 9) {
        if (this.attacksSinceApples >= 2 || (this.attacksSinceApples >= 1 && Math.random() < 0.5)) {
          this.state = 'shake';
          this.stateTimer = 0.7;
          this.attacksSinceApples = 0;
          this.setAnimation('shake');
        } else {
          this.state = 'blow';
          this.stateTimer = 0.9;
          this.attacksSinceApples++;
          this.setAnimation('blow');
          this.blow();
        }
      }
    } else if (this.state === 'blow') {
      if (this.stateTimer <= 0) this.rest();
    } else if (this.state === 'shake') {
      if (this.stateTimer <= 0) {
        this.dropApples();
        this.rest();
      }
    }
  }

  rest() {
    this.state = 'idle';
    this.stateTimer = 1.1 + Math.random() * 0.8;
  }

  blow() {
    const speed = 3.8;
    this.game.spawn('projectile', {
      kind: 'puff',
      team: 'enemy',
      x: this.position.x + _dir.x * 0.9,
      y: this.position.y + 0.55,
      z: this.position.z + _dir.z * 0.9,
      vx: _dir.x * speed,
      vz: _dir.z * speed,
      life: 2.4,
      damage: 1,
      hitEffect: 'hit',
    });
  }

  /** Two apples fall from the sky near Kirby, plus one near the trunk. */
  dropApples() {
    const p = this.player;
    const spots = [
      [p.position.x + (Math.random() - 0.5) * 2.5, p.position.z + (Math.random() - 0.5) * 2.5],
      [p.position.x + (Math.random() - 0.5) * 3.5, p.position.z + (Math.random() - 0.5) * 3.5],
      [this.position.x - 1.6 + Math.random() * 0.8, this.position.z + (Math.random() - 0.5) * 2],
    ];
    for (const [x, z] of spots) {
      const tile = this.game.level.tileAtWorld(x, z);
      if (!tile || tile.liquid || tile.height > 1.2) continue;
      this.game.spawn('projectile', {
        kind: 'apple',
        team: 'enemy',
        x,
        y: tile.height + 5,
        z,
        vy: 0,
        gravity: 12,
        life: 4,
        damage: 1,
        hitEffect: 'hit',
      });
    }
  }

  hurt(amount, source) {
    if (this.state === 'sleep' || this.state === 'defeated') return false;
    return super.hurt(amount, source);
  }

  onHurt() {
    this.hurtTimer = 0.45;
    this.game.events.emit('boss:hp', { hp: this.hp, maxHp: this.maxHp });
  }

  die() {
    this.state = 'defeated';
    this.contactDamage = 0;
    this.hurtTimer = 0;
    this.setAnimation('defeated');
    this.game.events.emit('boss:hp', { hp: 0, maxHp: this.maxHp });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.game.spawn('effect', {
        kind: 'sparkle',
        x: this.position.x + Math.cos(a) * 1.2,
        y: this.position.y + 0.6 + (i % 2) * 0.8,
        z: this.position.z + Math.sin(a) * 1.2,
        rise: 0.6,
      });
    }
    this.game.events.emit('boss:defeated', this);
    this.player?.onVictory?.();
  }
}
