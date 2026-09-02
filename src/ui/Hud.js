import { heartIcon, kirbyFaceIcon, starIcon, crownIcon } from './icons.js';

/**
 * Heads-up display built from the 3D Kirby repo's icon set: a row of hearts,
 * Kirby's face for the lives counter, a star for whatever is in his mouth,
 * a crowned boss bar and a centre-screen banner. Listens to game events and
 * refreshes once per frame; only touches the DOM when something changed.
 */
const MOUTHFUL_NAMES = {
  waddleDee: 'Waddle Dee',
  waddleDoo: 'Waddle Doo',
  brontoBurt: 'Bronto Burt',
  cappy: 'Cappy',
  apple: 'Apple',
};

const div = (cls, parent, html) => {
  const d = document.createElement('div');
  d.className = cls;
  if (html != null) d.innerHTML = html;
  parent.appendChild(d);
  return d;
};

export class Hud {
  constructor(game, root) {
    this.game = game;
    this._last = {};
    this._bannerTimer = 0;
    this._bossHideTimer = 0;
    this.levelName = '';

    const hud = div('kb-hud', root);
    this.hearts = div('kb-pill kb-hud-row', hud);
    const lives = div('kb-pill kb-hud-row', hud);
    div('kb-lives-face', lives, kirbyFaceIcon('kb-ico', 34));
    this.lives = div('kb-lives-n kb-out-sm', lives, 'x3');
    this.mouth = div('kb-pill kb-hud-row', hud);
    div('kb-mouth-ico', this.mouth, starIcon('kb-ico', 26));
    this.mouthText = div('kb-mouth-t kb-out-sm kb-track', this.mouth, '');
    this.mouth.hidden = true;
    this.hint = div('kb-hint kb-out-sm', hud, '');

    this.boss = div('kb-boss', root);
    const head = div('kb-boss-head', this.boss);
    div('kb-boss-crest', head, crownIcon('kb-ico', 30));
    div('kb-boss-name kb-out-sm kb-track', head, 'Whispy Woods');
    this.bossFill = div('kb-boss-fill', div('kb-boss-bar', this.boss));
    this.boss.hidden = true;

    this.banner = div('kb-banner kb-out kb-track', root, '');
    this.banner.hidden = true;

    const ev = game.events;
    ev.on('level:loaded', ({ name }) => {
      this.levelName = name ?? '';
      this.boss.hidden = true;
      if (!game.paused) this.showBanner(this.levelName, 2.5);
    });
    ev.on('ui:started', () => this.showBanner(this.levelName, 2.5));
    ev.on('boss:engaged', (boss) => {
      this.boss.hidden = false;
      this.setBossBar(boss.hp, boss.maxHp);
    });
    ev.on('boss:hp', ({ hp, maxHp }) => this.setBossBar(hp, maxHp));
    ev.on('boss:defeated', () => {
      this.showBanner('Stage Clear!', 4);
      this._bossHideTimer = 2.5;
    });
    ev.on('game:over', () => this.showBanner('Game Over', 3));
    ev.on('item:collected', () => this.showBanner('Maxim Tomato!', 1.2));
    ev.on('frame', (dt) => this.update(dt));
  }

  setHint(text) {
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  setBossBar(hp, maxHp) {
    this.bossFill.style.width = Math.max(0, (100 * hp) / maxHp) + '%';
  }

  showBanner(text, seconds) {
    this.banner.textContent = text;
    this.banner.hidden = false;
    this._bannerTimer = seconds;
  }

  update(dt) {
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.banner.hidden = true;
    }
    if (this._bossHideTimer > 0) {
      this._bossHideTimer -= dt;
      if (this._bossHideTimer <= 0) this.boss.hidden = true;
    }
    const p = this.game.player;
    if (!p) return;

    if (this._last.maxHp !== p.maxHp) {
      this._last.maxHp = p.maxHp;
      this._last.hp = -1;
      let html = '';
      for (let i = 0; i < p.maxHp; i++) html += '<div class="kb-heart">' + heartIcon('kb-ico', 26) + '</div>';
      this.hearts.innerHTML = html;
      this._heartEls = [...this.hearts.children];
    }
    if (this._last.hp !== p.hp) {
      this._last.hp = p.hp;
      this._heartEls.forEach((el, i) => el.classList.toggle('is-off', i >= p.hp));
    }
    const livesText = 'x' + p.lives;
    if (this._last.lives !== livesText) {
      this._last.lives = livesText;
      this.lives.textContent = livesText;
    }
    const mouthText = p.full ? MOUTHFUL_NAMES[p.mouthful] ?? p.mouthful : '';
    if (this._last.mouth !== mouthText) {
      this._last.mouth = mouthText;
      this.mouthText.textContent = mouthText;
      this.mouth.hidden = !mouthText;
    }
  }
}
