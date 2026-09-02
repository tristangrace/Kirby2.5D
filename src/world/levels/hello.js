/**
 * Level 0: a small island to walk around on.
 *
 * Rows run top-to-bottom = +z (down-left on screen); columns left-to-right =
 * +x (down-right on screen). Every level is plain data so new ones can be
 * authored by copying this file and registering it in levels/index.js.
 */
export default {
  id: 'hello',
  name: 'Green Greens',
  legend: {
    '.': 'grass',
    ':': 'dirt',
    s: 'sand',
    '^': 'ledge',
    '#': 'stone',
    W: 'wall',
    '~': 'water',
    ' ': null,
  },
  rows: [
    '~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~....~~~~~~....~~~~',
    '~~..........~~......~~',
    '~~....##.............~',
    '~.....##......^^^....~',
    '~.............^^^^...~',
    '~....::::.....^^^^...~',
    '~....:..::...........~',
    '~....:...::..........~',
    '~~...:....:::.....~~~~',
    '~~...:......:::..~~~~~',
    '~....:........:::~~~~~',
    '~....:..........:..~~~',
    '~...ss..###.....:..~~~',
    '~..sss..#.#......:...~',
    '~~sss...###......:..~~',
    '~~~~s......~~~~~~~..~~',
    '~~~~~~~~~~~~~~~~~~~~~~',
  ],
  spawn: { col: 6, row: 8 },
  // Future: [{ type: 'waddleDee', col: 12, row: 5 }]
  entities: [],
};
