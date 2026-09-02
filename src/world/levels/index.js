import hello from './hello.js';
import greenGreens from './greenGreens.js';

/** Level registry. Import a new level's data and register it here. */
const levels = new Map();

export function registerLevel(data) {
  levels.set(data.id, data);
}

export function getLevel(id) {
  const data = levels.get(id);
  if (!data) throw new Error('Unknown level: ' + id);
  return data;
}

export function listLevels() {
  return [...levels.keys()];
}

registerLevel(hello);
registerLevel(greenGreens);
