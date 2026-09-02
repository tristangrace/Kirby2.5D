import { Game } from './Game.js';
import { TouchControls } from './core/TouchControls.js';

const container = document.getElementById('game');
const game = new Game(container);
game.loadLevel('hello');
game.start();

// On-screen joystick for iPad and other touch devices (no-op elsewhere).
const touch = new TouchControls(document.body, game.input);

// Controls hint follows whichever device was used last.
const HINTS = {
  keyboard: 'WASD / Arrows: walk',
  gamepad: 'Left stick / D-pad: walk',
  touch: 'Drag left side of screen: walk',
};
const hint = document.getElementById('hint');
setInterval(() => {
  const text = HINTS[game.input.lastSource];
  if (hint.textContent !== text) hint.textContent = text;
}, 250);

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
}
