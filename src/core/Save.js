/** Tiny localStorage wrapper for the bits worth keeping between visits: stars and bought abilities. */
const KEY = 'kirby25d.save';

export const Save = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
    } catch {
      return {};
    }
  },
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {}
  },
};
