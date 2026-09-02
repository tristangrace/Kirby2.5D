import { abilityIcon, solidStarIcon, starIcon, buttonGlyph } from './icons.js';
import { ABILITIES } from '../entities/Player.js';

const div = (cls, parent, html) => {
  const d = document.createElement('div');
  d.className = cls;
  if (html != null) d.innerHTML = html;
  parent.appendChild(d);
  return d;
};

/**
 * The ability shop, in the 3D game's card style. Opens on `shop:open`,
 * pauses the world, and lets you browse with the stick / d-pad / keys, buy
 * or equip with A (or Enter), and leave with B.
 */
export class Shop {
  constructor(game, root) {
    this.game = game;
    this.open = false;
    this.index = 0;
    this.ignoreFrames = 0;
    this.stickLatch = 0;
    this.items = [{ name: null, label: 'Normal', price: 0, blurb: 'No ability: inhale and spit as usual.' }].concat(
      Object.entries(ABILITIES).map(([name, a]) => ({ name, ...a })),
    );

    this.el = div('kb-shop', root);
    this.scrim = div('kb-shop-scrim', this.el);
    const card = div('kb-card', this.el);
    div('kb-card-title kb-out-sm kb-track', card, 'Ability Shop');
    const head = div('kb-shop-head', card);
    div('kb-shop-star', head, starIcon('kb-ico', 26));
    this.walletEl = div('kb-shop-wallet kb-out-sm', head, '0');
    this.list = div('kb-shop-list', card);
    this.rows = this.items.map((it) => {
      const row = div('kb-row', this.list);
      div('kb-row-cursor', row, solidStarIcon('#fffaf0', '#1b1640', '', 18));
      div('kb-abil', row, abilityIcon(it.name ?? 'none', 'kb-ico', 40));
      const text = div('kb-row-text', row);
      div('kb-row-label kb-out-sm', text, it.label);
      div('kb-row-blurb', text, it.blurb);
      const price = div('kb-row-price kb-out-sm', row, '');
      return { el: row, price };
    });
    this.foot = div('kb-shop-foot', card);
    this.foot.innerHTML =
      '<span class="kb-foot-btn">' + buttonGlyph('A', '#5ed67f', 22) + '</span><span>Buy / Equip</span>' +
      '<span class="kb-foot-btn">' + buttonGlyph('B', '#ff7a8f', 22) + '</span><span>Leave</span>';
    this.msg = div('kb-shop-msg kb-out-sm', card, '');
    this.el.hidden = true;

    game.events.on('shop:open', () => this.show());
    game.events.on('frame', (dt) => this.update(dt));
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.el.hidden = false;
    this.game.paused = true;
    this.ignoreFrames = 2;
    this.msg.textContent = '';
    const p = this.game.player;
    this.index = Math.max(0, this.items.findIndex((it) => it.name === p.ability));
    this.refresh();
  }

  hide() {
    this.open = false;
    this.el.hidden = true;
    this.game.paused = false;
    this.game.input.endFrame();
  }

  refresh() {
    const p = this.game.player;
    this.walletEl.textContent = String(p.stars);
    this.items.forEach((it, i) => {
      const r = this.rows[i];
      r.el.classList.toggle('is-sel', i === this.index);
      const equipped = p.ability === it.name;
      const owned = !it.name || p.owned.has(it.name);
      r.price.textContent = equipped ? 'Equipped' : owned ? 'Owned' : it.price + ' ★';
      r.price.classList.toggle('is-poor', !owned && p.stars < it.price);
      r.el.classList.toggle('is-equipped', equipped);
    });
  }

  move(delta) {
    this.index = (this.index + delta + this.items.length) % this.items.length;
    this.msg.textContent = '';
    this.refresh();
  }

  choose() {
    const p = this.game.player;
    const it = this.items[this.index];
    if (p.equip(it.name)) {
      this.msg.textContent = it.name ? it.label + ' equipped!' : 'Back to normal.';
    } else {
      this.msg.textContent = 'Not enough stars. Beat enemies to earn more.';
    }
    this.refresh();
  }

  update(dt) {
    if (!this.open) return;
    if (this.ignoreFrames > 0) {
      this.ignoreFrames--;
      return;
    }
    const input = this.game.input;
    if (input.justPressed('action')) return this.hide();
    if (input.justPressed('jump') || input.justPressed('start')) return this.choose();
    if (input.justPressed('up')) this.move(-1);
    if (input.justPressed('down') || input.justPressed('reload')) this.move(1);

    const sy = input.stick.y + input.touchAxis.y;
    if (Math.abs(sy) < 0.3) this.stickLatch = 0;
    else if (sy > 0.5 && this.stickLatch !== 1) {
      this.stickLatch = 1;
      this.move(-1);
    } else if (sy < -0.5 && this.stickLatch !== -1) {
      this.stickLatch = -1;
      this.move(1);
    }
  }
}
