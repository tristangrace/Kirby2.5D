import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { getBrontoBurtSheet } from '../../gfx/sprites/EnemySprites.js';

const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();

/**
 * A winged pest that flutters about and, when Kirby is near, swoops at him
 * along a lazy sine wave. Flies over water and hedges.
 */
export class BrontoBurt extends Enemy {
  static type = 'brontoBurt';

  constructor(game, opts) {
    super(game, opts, getBrontoBurtSheet());
    this.hp = 1;
    this.speed = 1.6;
    this.radius = 0.28;
    this.height = 0.7;
    this.airborne = true;
    this.maxStep = 0.4;
    this.hover = 1.1;
    this.phase = Math.random() * Math.PI * 2;
    this.home = this.position.clone();
    this.position.y = this.groundY + this.hover;
  }

  behave(dt) {
    this.phase += dt * 3.2;
    this.airborne = true;
    this.refreshGround();
    const dist = this.distanceToPlayer();

    if (dist < 6.5 && dist > 0.2) {
      // Swoop: head for Kirby, weaving sideways.
      this.dirToPlayer(_dir);
      _side.set(-_dir.z, 0, _dir.x).multiplyScalar(Math.sin(this.phase * 1.3) * 0.8);
      _dir.add(_side).normalize();
      this.tryMove(_dir.x * 2.3 * dt, _dir.z * 2.3 * dt);
      this.faceToward(_dir.x, _dir.z);
      const targetY = this.player.position.y + 0.35 + Math.sin(this.phase) * 0.3;
      this.position.y += (targetY - this.position.y) * Math.min(1, 3 * dt);
    } else {
      this.wander(dt, { speed: this.speed, walkAnim: 'fly', idleAnim: 'fly' });
      const targetY = this.groundY + this.hover + Math.sin(this.phase) * 0.25;
      this.position.y += (targetY - this.position.y) * Math.min(1, 4 * dt);
    }
    // Never sink into the ground when drifting onto a taller tile.
    if (this.position.y < this.groundY + 0.3) this.position.y = this.groundY + 0.3;
    this.setAnimation('fly');
  }
}
