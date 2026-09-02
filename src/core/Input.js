/**
 * Unified input: keyboard, gamepad (Xbox / PlayStation / Switch / MFi pads via
 * the Gamepad API) and an optional touch joystick, all mapped to named actions.
 *
 * Gameplay code only ever asks for actions or the movement axis, never raw
 * keys or buttons, so adding a device means editing this file alone.
 * Call `update()` once at the start of each frame (polls gamepads) and
 * `endFrame()` at the end (clears just-pressed state).
 *
 * Actions follow the Game Boy layout: `jump` is A, `action` (inhale / spit /
 * exhale) is B.
 */
export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyK', 'KeyZ'],
  action: ['KeyJ', 'KeyX', 'ShiftLeft', 'ShiftRight'],
  reload: ['F9'],
};

/** Standard-mapping gamepad button indices -> actions. */
export const GAMEPAD_BUTTONS = {
  0: 'jump', // A / Cross / B(Switch)
  1: 'action', // B / Circle / A(Switch)
  2: 'action', // X / Square / Y(Switch)
  12: 'up',
  13: 'reload', // d-pad down: hard-reload the page (dev convenience on the Xbox); walk with the stick
  14: 'left',
  15: 'right',
};

const STICK_DEADZONE = 0.25;

export class Input {
  constructor(bindings = DEFAULT_BINDINGS) {
    this._keyToAction = new Map();
    for (const [action, keys] of Object.entries(bindings)) {
      for (const key of keys) this._keyToAction.set(key, action);
    }
    this._keyDown = new Set();
    this._padDown = new Set();
    this._virtualDown = new Set(); // touch buttons
    this._pressed = new Set(); // actions that went down since the last endFrame()

    this.stick = { x: 0, y: 0 }; // analog stick, screen terms: x right, y up
    this.touchAxis = { x: 0, y: 0 }; // set by TouchControls
    this.lastSource = 'keyboard'; // 'keyboard' | 'gamepad' | 'touch'
    this.gamepadConnected = false;

    this._onKeyDown = (e) => {
      const action = this._keyToAction.get(e.code);
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      this.lastSource = 'keyboard';
      this._press(this._keyDown, action);
    };
    this._onKeyUp = (e) => {
      const action = this._keyToAction.get(e.code);
      if (action) this._keyDown.delete(action);
    };
    this._onBlur = () => {
      this._keyDown.clear();
      this._padDown.clear();
      this._virtualDown.clear();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  _press(set, action) {
    if (!this.isDown(action)) this._pressed.add(action);
    set.add(action);
  }

  /** Poll gamepads. Call once per frame before entities update. */
  update() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    this.gamepadConnected = !!pad;
    this.stick.x = 0;
    this.stick.y = 0;
    if (!pad) {
      this._padDown.clear();
      return;
    }

    const sx = pad.axes[0] ?? 0;
    const sy = pad.axes[1] ?? 0;
    const mag = Math.hypot(sx, sy);
    if (mag > STICK_DEADZONE) {
      // Rescale so movement ramps smoothly from the deadzone edge.
      const scaled = Math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
      this.stick.x = (sx / mag) * scaled;
      this.stick.y = (-sy / mag) * scaled; // gamepad y is down-positive
      this.lastSource = 'gamepad';
    }

    // Several buttons can map to one action, so collect what is held first.
    const held = new Set();
    for (const [index, action] of Object.entries(GAMEPAD_BUTTONS)) {
      const btn = pad.buttons[index];
      if (btn && (btn.pressed || btn.value > 0.5)) held.add(action);
    }
    for (const action of held) {
      if (!this._padDown.has(action)) {
        this.lastSource = 'gamepad';
        this._press(this._padDown, action);
      }
    }
    for (const action of [...this._padDown]) if (!held.has(action)) this._padDown.delete(action);
  }

  /** Touch overlay hook: hold/release a named action. */
  setVirtualButton(action, down) {
    if (down) {
      this.lastSource = 'touch';
      this._press(this._virtualDown, action);
    } else {
      this._virtualDown.delete(action);
    }
  }

  isDown(action) {
    return this._keyDown.has(action) || this._padDown.has(action) || this._virtualDown.has(action);
  }

  /** True only on the frame the action was first pressed. */
  justPressed(action) {
    return this._pressed.has(action);
  }

  /**
   * Movement axis in screen terms: x right (+), y up-the-screen (+).
   * Digital sources are normalised; analog sources keep their magnitude.
   * Length is clamped to 1.
   */
  axis() {
    let x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    let y = (this.isDown('up') ? 1 : 0) - (this.isDown('down') ? 1 : 0);
    const dLen = Math.hypot(x, y);
    if (dLen > 1) {
      x /= dLen;
      y /= dLen;
    }
    x += this.stick.x + this.touchAxis.x;
    y += this.stick.y + this.touchAxis.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Call once at the end of every frame to clear just-pressed state. */
  endFrame() {
    this._pressed.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
