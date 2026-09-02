import * as THREE from 'three';
import { AudioEngine } from './AudioEngine.js';
import { Settings } from './Settings.js';

/**
 * Wires the audio engine ported from the 3D Kirby repo into this game.
 *
 * The engine subscribes to its own event vocabulary (`kirby:jump`,
 * `enemy:hit`, `boss:health`, ...). Gameplay code here emits those names
 * directly where it is natural, and this module translates the rest from the
 * events the 2.5D game already had (`boss:hp`, `ui:started`, ...).
 *
 * The listener sits at the camera's focus point rather than at the camera
 * itself: the iso camera is 80 units out, which would put every sound at the
 * far end of the distance rolloff.
 */
export function installAudio(game) {
  const audio = new AudioEngine();
  const listener = new THREE.Object3D();
  const adapter = { bus: game.events, camera: listener };
  audio.init(adapter);

  const ev = game.events;
  ev.on('ui:started', () => ev.emit('game:started'));
  ev.on('title:show', () => ev.emit('menu:show', { name: 'title' }));
  ev.on('boss:engaged', (boss) => ev.emit('boss:health', { name: 'whispy', health: boss.hp, max: boss.maxHp, active: true }));
  ev.on('boss:hp', ({ hp, maxHp }) => {
    if (hp > 0) ev.emit('boss:health', { name: 'whispy', health: hp, max: maxHp, active: true });
  });
  ev.on('boss:defeated', () => {
    ev.emit('boss:health', { name: 'whispy', health: 0, max: 1, active: false });
    ev.emit('level:complete');
    // Let the fanfare breathe, then bring the field theme back.
    setTimeout(() => {
      if (!game.paused) audio.startMusic('main');
    }, 6000);
  });
  ev.on('item:collected', () => audio.play('respawn'));
  ev.on('player:mouthful', (name) => {
    if (name) ev.emit('kirby:swallow');
  });
  ev.on('player:ability', (name) => ev.emit('ability:changed', { ability: name }));
  ev.on('player:respawn', () => ev.emit('kirby:respawn'));
  ev.on('player:died', () => audio.play('abilityLost'));
  ev.on('shop:open', () => ev.emit('game:paused'));
  ev.on('shop:close', () => ev.emit('game:resumed'));

  ev.on('frame', (dt) => {
    // Listener: at the camera's smoothed look point, facing the way the camera faces.
    listener.position.copy(game.iso.target);
    listener.quaternion.copy(game.iso.camera.quaternion);
    listener.updateMatrixWorld(true);
    audio.update(dt, adapter);

    if (game.input.justPressed('mute')) {
      Settings.masterVolume = Settings.masterVolume > 0 ? 0 : 0.8;
      ev.emit('audio:mute', Settings.masterVolume === 0);
    }
  });

  return audio;
}
