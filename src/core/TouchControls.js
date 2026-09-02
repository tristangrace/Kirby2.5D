import { buttonGlyph } from '../ui/icons.js';

/**
 * On-screen controls for touch devices (iPad etc.): a floating joystick that
 * appears wherever the left side of the screen is touched, plus Game Boy
 * style A (jump) and B (inhale) buttons on the right. Feeds
 * Input.touchAxis / Input.setVirtualButton.
 *
 * Only mounts itself on coarse-pointer devices unless `force` is set.
 */
export class TouchControls {
  constructor(container, input, { force = false, radius = 48 } = {}) {
    this.input = input;
    this.radius = radius;
    this.enabled = force || window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!this.enabled) return;

    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.innerHTML =
      '<div class="stick"><div class="knob"></div></div>' +
      '<button class="btn btn-b" data-action="action" aria-label="Inhale">' + buttonGlyph('B', '#ff7a8f', 84) + '</button>' +
      '<button class="btn btn-a" data-action="jump" aria-label="Jump">' + buttonGlyph('A', '#5ed67f', 84) + '</button>';
    container.appendChild(this.root);

    this.stick = this.root.querySelector('.stick');
    this.knob = this.root.querySelector('.knob');
    this.buttons = [...this.root.querySelectorAll('.btn')];
    this.stickPointer = null;
    this.origin = { x: 0, y: 0 };

    this._onDown = (e) => this._pointerDown(e);
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = (e) => this._pointerUp(e);
    this.root.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);

    for (const button of this.buttons) {
      const action = button.dataset.action;
      const press = (down) => (e) => {
        e.preventDefault();
        input.setVirtualButton(action, down);
      };
      button.addEventListener('pointerdown', press(true));
      button.addEventListener('pointerup', press(false));
      button.addEventListener('pointercancel', press(false));
      button.addEventListener('pointerleave', press(false));
    }
  }

  _pointerDown(e) {
    if (e.target.closest?.('.btn') || this.stickPointer !== null) return;
    if (e.clientX > window.innerWidth * 0.6) return; // right side reserved for buttons
    e.preventDefault();
    this.stickPointer = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.stick.style.left = e.clientX + 'px';
    this.stick.style.top = e.clientY + 'px';
    this.stick.classList.add('active');
    this.input.lastSource = 'touch';
    this._setKnob(0, 0);
  }

  _pointerMove(e) {
    if (e.pointerId !== this.stickPointer) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      dx = (dx / len) * this.radius;
      dy = (dy / len) * this.radius;
    }
    this._setKnob(dx, dy);
  }

  _pointerUp(e) {
    if (e.pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.stick.classList.remove('active');
    this._setKnob(0, 0);
  }

  _setKnob(dx, dy) {
    this.knob.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    this.input.touchAxis.x = dx / this.radius;
    this.input.touchAxis.y = -dy / this.radius; // screen y is down-positive
  }

  dispose() {
    if (!this.enabled) return;
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.root.remove();
  }
}
