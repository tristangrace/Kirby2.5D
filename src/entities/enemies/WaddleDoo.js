import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { getWaddleDooSheet } from '../../gfx/sprites/EnemySprites.js';

const _dir = new THREE.Vector3();
const BEAM_SPARKS = 9;

/**
 * One-eyed cousin. Wanders until Kirby gets close, then plants its feet and
 * whips a beam of sparks in an arc from overhead down to the ground.
 */
export class WaddleDoo extends Enemy {
  static type = 'waddleDoo';

  constructor(game, opts) {
    super(game, opts, getWaddleDooSheet());
    this.hp = 2;
    this.speed = 1.2;
    this.state = 'wander';
    this.stateTimer = 0;
    this.cooldown = 1 + Math.random();
    this.sparksFired = 0;
    this.beamDir = new THREE.Vector3(1, 0, 0);
  }

  behave(dt) {
    this.stickToGround();
    this.cooldown -= dt;

    if (this.state === 'wander') {
      this.wander(dt);
      if (this.cooldown <= 0 && this.distanceToPlayer() < 3.2 && !this.player.flying) {
        this.state = 'charge';
        this.stateTimer = 0.45;
        this.dirToPlayer(this.beamDir);
        this.faceToward(this.beamDir.x, this.beamDir.z);
      }
    } else if (this.state === 'charge') {
      this.setAnimation('charge');
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'beam';
        this.stateTimer = 0;
        this.sparksFired = 0;
      }
    } else if (this.state === 'beam') {
      this.setAnimation('charge');
      this.stateTimer -= dt;
      while (this.stateTimer <= 0 && this.sparksFired < BEAM_SPARKS) {
        this.fireSpark(this.sparksFired++);
        this.stateTimer += 0.045;
      }
      if (this.sparksFired >= BEAM_SPARKS) {
        this.state = 'wander';
        this.cooldown = 1.8 + Math.random();
        this.wanderTimer = 0;
      }
    }
  }

  /** Sparks sweep from 80 degrees above the horizon down to the ground. */
  fireSpark(i) {
    const t = i / (BEAM_SPARKS - 1);
    const angle = (1 - t) * 1.4;
    const r = 1.35;
    const forward = Math.cos(angle) * r;
    const up = Math.sin(angle) * r;
    this.game.spawn('projectile', {
      kind: 'spark',
      team: 'enemy',
      x: this.position.x + this.beamDir.x * forward,
      y: this.position.y + 0.45 + up,
      z: this.position.z + this.beamDir.z * forward,
      life: 0.16,
      damage: 1,
      hitEffect: null,
    });
  }

  onHurt() {
    this.state = 'wander';
    this.cooldown = 1.5;
  }
}
