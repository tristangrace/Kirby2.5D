import { logotypeSvg } from './logo.js';
import { starIcon, sparkleSvg } from './icons.js';
import { FONT_STACK } from './fonts.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const outBack = (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

/**
 * Splash / title screen, ported from the 3D Kirby repo's menus: the world
 * idles behind a dusk scrim, stars drift up, the logotype springs in and
 * "Press Start" pulses. Any button (or a tap) wipes to white and hands the
 * game over to the player.
 *
 * While the title is up `game.paused` is true, so entities hold still.
 */
export class Title {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.active = false;
    this.time = 0;
    this.logoT = 0;
    this.pressT = 0;
    this.wipe = null; // { t } while the start wipe is running
    this.stars = [];

    const div = (cls, parent, html) => {
      const d = document.createElement('div');
      d.className = cls;
      if (html != null) d.innerHTML = html;
      parent.appendChild(d);
      return d;
    };

    this.el = div('kb-title', root);
    this.sky = div('kb-title-sky', this.el);
    this.starsHost = div('kb-title-stars', this.el);
    this.logo = div('kb-logo', this.el, logotypeSvg({ kicker: 'CLAUDE', word: 'KIRBY', subtitle: 'DREAM LAND 2.5D', font: FONT_STACK.replace(/"/g, "'") }));
    div('kb-logo-sub kb-out-sm kb-track', this.logo, 'Dream Land 2.5D');
    this.press = div('kb-press kb-out kb-track-w', this.el, 'Press Start');
    this.wipeEl = div('kb-wipe', root);

    for (let i = 0; i < 30; i++) {
      const tier = i % 3;
      const size = Math.round([10, 18, 30][tier] * (0.8 + Math.random() * 0.5));
      const st = div('kb-tstar', this.starsHost, i % 3 === 0 ? starIcon('', size) : sparkleSvg('#fff6c4', size));
      st.style.width = size + 'px';
      st.style.height = size + 'px';
      this.stars.push({
        el: st,
        x: 0.06 + Math.random() * 0.88,
        y: Math.random(),
        sp: [0.02, 0.04, 0.075][tier] * (0.7 + Math.random() * 0.6),
        ph: Math.random() * 6.28,
        amp: 6 + tier * 6,
        op: [0.45, 0.7, 0.95][tier],
      });
    }

    this.el.addEventListener('pointerdown', () => this.start());
    game.events.on('frame', (dt) => this.update(dt));
    this.el.hidden = true;
  }

  show() {
    this.active = true;
    this.el.hidden = false;
    this.time = 0;
    this.logoT = 0;
    this.pressT = 0;
    this.wipe = null;
    this.game.paused = true;
    this.game.input.endFrame();
    this.game.events.emit('title:show');
  }

  /** Wipe to white, unpause, fade the wipe away. */
  start() {
    if (!this.active || this.wipe) return;
    this.wipe = { t: 0 };
    this.game.events.emit('ui:start');
  }

  update(dt) {
    if (this.wipe) {
      this.wipe.t += dt / 0.7;
      const t = this.wipe.t;
      // 0 -> 0.45: fade to white; 0.45: swap; 0.45 -> 1: fade out.
      const a = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
      this.wipeEl.style.opacity = clamp(a, 0, 1).toFixed(3);
      if (t >= 0.45 && this.active) {
        this.active = false;
        this.el.hidden = true;
        this.game.paused = false;
        this.game.events.emit('ui:started');
      }
      if (t >= 1) {
        this.wipe = null;
        this.wipeEl.style.opacity = '0';
      }
    }
    if (!this.active) return;

    const input = this.game.input;
    if (!this.wipe && (input.justPressed('jump') || input.justPressed('action') || input.justPressed('start'))) {
      this.start();
    }

    this.time += dt;
    this.logoT = Math.min(1, this.logoT + dt / 1.1);
    const t = this.logoT;
    const e = outBack(clamp(t, 0, 1));
    this.sky.style.opacity = clamp(t * 2.4, 0, 1).toFixed(3);
    const float = Math.sin(this.time * 1.15) * 9;
    const tilt = Math.sin(this.time * 0.8) * 0.6;
    this.logo.style.opacity = clamp(t * 2.4, 0, 1).toFixed(3);
    this.logo.style.transform =
      'translate(-50%,-50%) translate3d(0,' + (float + (1 - e) * -70).toFixed(1) + 'px,0) scale(' + lerp(0.72, 1, e).toFixed(3) + ') rotate(' + tilt.toFixed(2) + 'deg)';

    this.pressT += dt;
    const appear = clamp((t - 0.55) / 0.45, 0, 1);
    const pulse = 1 + Math.sin(this.pressT * 3.1) * 0.045;
    this.press.style.opacity = (appear * (0.78 + Math.sin(this.pressT * 3.1) * 0.22)).toFixed(3);
    this.press.style.transform = 'translate(-50%,-50%) scale(' + (pulse * lerp(0.82, 1, appear)).toFixed(3) + ')';

    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    for (const st of this.stars) {
      st.y -= st.sp * dt;
      if (st.y < -0.06) {
        st.y = 1.06;
        st.x = 0.06 + Math.random() * 0.88;
      }
      const x = st.x * w + Math.sin(this.time * 0.7 + st.ph) * st.amp;
      st.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + (st.y * h).toFixed(1) + 'px,0) rotate(' + (Math.sin(this.time * 0.9 + st.ph) * 12).toFixed(1) + 'deg)';
      st.el.style.opacity = (st.op * clamp(t * 2, 0, 1)).toFixed(2);
    }
  }
}
