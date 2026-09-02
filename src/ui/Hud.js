/**
 * DOM heads-up display: hearts, lives, what Kirby has in his mouth, a boss
 * health bar and a centre-screen banner. Listens to game events and refreshes
 * once per frame; only touches the DOM when something changed.
 */
const MOUTHFUL_NAMES = {
  waddleDee: 'Waddle Dee',
  waddleDoo: 'Waddle Doo',
  brontoBurt: 'Bronto Burt',
  cappy: 'Cappy',
  apple: 'Apple',
};

export class Hud {
  constructor(game, root = document) {
    this.game = game;
    this.hp = root.getElementById('hp');
    this.lives = root.getElementById('lives');
    this.mouth = root.getElementById('mouth');
    this.levelName = root.getElementById('level-name');
    this.boss = root.getElementById('boss');
    this.bossFill = root.getElementById('boss-fill');
    this.banner = root.getElementById('banner');
    this._last = {};
    this._bannerTimer = 0;
    this._bossHideTimer = 0;

    const ev = game.events;
    ev.on('level:loaded', ({ name }) => {
      this.levelName.textContent = name ?? '';
      this.boss.hidden = true;
      this.showBanner(name ?? '', 2.5);
    });
    ev.on('boss:engaged', (boss) => {
      this.boss.hidden = false;
      this.setBossBar(boss.hp, boss.maxHp);
    });
    ev.on('boss:hp', ({ hp, maxHp }) => this.setBossBar(hp, maxHp));
    ev.on('boss:defeated', () => {
      this.showBanner('STAGE CLEAR!', 4);
      this._bossHideTimer = 2.5;
    });
    ev.on('game:over', () => this.showBanner('GAME OVER', 3));
    ev.on('item:collected', () => this.showBanner('Maxim Tomato!', 1.2));
    ev.on('frame', (dt) => this.update(dt));
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

    const hpKey = p.hp + '/' + p.maxHp;
    if (this._last.hp !== hpKey) {
      this._last.hp = hpKey;
      let html = '';
      for (let i = 0; i < p.maxHp; i++) html += '<i class="pip' + (i < p.hp ? ' on' : '') + '"></i>';
      this.hp.innerHTML = html;
    }
    const livesText = 'x' + p.lives;
    if (this._last.lives !== livesText) {
      this._last.lives = livesText;
      this.lives.textContent = livesText;
    }
    const mouthText = p.full ? 'Mouthful: ' + (MOUTHFUL_NAMES[p.mouthful] ?? p.mouthful) + ' (B to spit)' : '';
    if (this._last.mouth !== mouthText) {
      this._last.mouth = mouthText;
      this.mouth.textContent = mouthText;
    }
  }
}
