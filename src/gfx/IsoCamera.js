import * as THREE from 'three';

/**
 * Orthographic isometric camera with pixel-grid snapping.
 *
 * yaw 45deg / pitch 30deg gives the classic 2:1 isometric look. Everything
 * that cares about screen-relative directions (input, billboards) asks this
 * class for its basis vectors rather than hard-coding the angle, so the view
 * can be re-angled later in one place.
 */
export class IsoCamera {
  constructor({ yaw = Math.PI / 4, pitch = Math.PI / 6, pixelsPerUnit = 24, distance = 80, followSpeed = 8 } = {}) {
    this.pixelsPerUnit = pixelsPerUnit;
    this.distance = distance;
    this.followSpeed = followSpeed;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.focus = new THREE.Vector3(); // where we want to look
    this.target = new THREE.Vector3(); // smoothed look point

    this.direction = new THREE.Vector3(); // unit vector from target towards camera
    this.right = new THREE.Vector3(); // screen right, in world space
    this.up = new THREE.Vector3(); // screen up, in world space
    this.groundForward = new THREE.Vector3(); // "up the screen", flattened onto the ground
    this.groundRight = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.setAngles(yaw, pitch);
  }

  setAngles(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.groundRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.groundForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.right.copy(this.groundRight);
    this.up.crossVectors(this.direction, this.right).normalize();
    this._place(this.target);
  }

  setViewport(width, height) {
    const hw = width / this.pixelsPerUnit / 2;
    const hh = height / this.pixelsPerUnit / 2;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }

  /** Jump straight to the focus point (use on level load). */
  snapToFocus() {
    this.target.copy(this.focus);
    this._place(this.snapToPixelGrid(this._tmp.copy(this.target)));
  }

  /**
   * Round a world point so it lands on an integer render pixel. Sprites use
   * this so their texels map 1:1 to screen pixels instead of shimmering.
   */
  snapToPixelGrid(v) {
    const ppu = this.pixelsPerUnit;
    const r = Math.round(v.dot(this.right) * ppu) / ppu;
    const u = Math.round(v.dot(this.up) * ppu) / ppu;
    const d = v.dot(this.direction);
    return v
      .set(0, 0, 0)
      .addScaledVector(this.right, r)
      .addScaledVector(this.up, u)
      .addScaledVector(this.direction, d);
  }

  update(dt) {
    const k = 1 - Math.exp(-this.followSpeed * dt);
    this.target.lerp(this.focus, k);
    this._place(this.snapToPixelGrid(this._tmp.copy(this.target)));
  }

  _place(lookPoint) {
    this.camera.position.copy(lookPoint).addScaledVector(this.direction, this.distance);
    this.camera.lookAt(lookPoint);
  }
}
