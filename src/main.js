import { Game } from './Game.js';
import { TouchControls } from './core/TouchControls.js';
import { Hud } from './ui/Hud.js';

const container = document.getElementById('game');
const game = new Game(container);
const hud = new Hud(game);
game.loadLevel('greenGreens');
game.start();

// On-screen joystick for iPad and other touch devices (no-op elsewhere).
const touch = new TouchControls(document.body, game.input);

// Controls hint follows whichever device was used last.
const HINTS = {
  keyboard: 'WASD: walk · K / Space: jump, again to fly · J: inhale, spit, exhale',
  gamepad: 'Stick: walk · A: jump, again to fly · B / X: inhale, spit, exhale',
  touch: 'Drag left side: walk · A: jump, again to fly · B: inhale, spit, exhale',
};
const hint = document.getElementById('hint');
setInterval(() => {
  const text = HINTS[game.input.lastSource];
  if (hint.textContent !== text) hint.textContent = text;
}, 250);

// D-pad down (or F9): reload with the HTTP cache bypassed so a fresh deploy shows up immediately.
async function hardReload() {
  try {
    if (window.caches) for (const key of await caches.keys()) await caches.delete(key);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.set('r', Date.now().toString(36));
  location.replace(url.toString());
}
game.events.on('frame', () => {
  if (game.input.justPressed('reload')) hardReload();
});

// Fullscreen toggle (TV browsers and tablets). Needs a user gesture, so it is a button.
const fsButton = document.getElementById('fullscreen');
fsButton.addEventListener('click', () => {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el).catch?.(() => {});
  }
});
if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) fsButton.hidden = true;

// Handy for poking at things from the console during development.
if (import.meta.env.DEV) {
  window.__game = game;
  window.__touch = touch;
  window.__hud = hud;
}
