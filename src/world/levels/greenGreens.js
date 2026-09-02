/**
 * Level 1: Green Greens.
 *
 * West to east: the starting meadow, a plank bridge over the first river, a
 * plateau with a staircase hill (Maxim Tomato on top) and a hedge maze, a
 * second river crossed by hopping ledges (or flying), and the forest where
 * Whispy Woods waits inside a hedge ring.
 *
 * Rows run top-to-bottom = +z (down-left on screen); columns left-to-right =
 * +x (down-right on screen).
 */
export default {
  id: 'greenGreens',
  name: 'Green Greens',
  legend: {
    '.': 'grass',
    ',': 'flowers',
    ':': 'dirt',
    s: 'sand',
    '=': 'bridge',
    '^': 'ledge',
    '#': 'stone',
    2: 'tallStone',
    W: 'wall',
    H: 'hedge',
    T: 'tree',
    '~': 'water',
    ' ': null,
  },
  rows: [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~..............~~~~~~~~~~............~~~',
    '~~~~............~~~~~~~~.........,..s...~~~~~~~~....T......T..~~',
    '~~~......,.......~~~~~~............~~~~..~~~~~~..T.............~',
    '~~~.......^^^^^..~~~~~~...^^^^^^^.s~~~~s.~~~~~~........T.......~',
    '~~..,.....^###^...~~~~~...^#####^..~~~~..~~^~~~...,..........T.~',
    '~~........^###^,..~~~~~.,.^#2W##^....s...~~~~~~................~',
    '~~........^^^^^...~~~~~...^####^^........~~~~~~T...T...HHHHHHHH~',
    '~~...,...........s~~~~s...^^^^^^^.......s~~~~~s........H.....TH~',
    '~~......,........s~~~~s.............,...s~~~~~s........H.,....H~',
    '~~...:::::::::::::====:::::::::::::::::::^~~~^:::::::::H......H~',
    '~~.,.:::::::::::::====:::::::::::::::::::~~^~~:::::::::::::...T~',
    '~~...:...........s~~~~s...,.............s~~~~~s........::::...T~',
    '~~...:,.......^^.s~~~~s................,s~~~~~s.....,..H......H~',
    '~~...:.........^..~~~~~..HHHH.HHHH.......~~~~~~.......,H.,....H~',
    '~~...:.##.........~~~~~..H...............~~~~~~.T......H.....TH~',
    '~~............,...~~~~~..H...............~~~~~~........HHHHHHHH~',
    '~~.s..............~~~~~..H..HHHHHH.HHHH..~^~~~~................~',
    '~~.ss......,......~~~~~.,H............H..~~~~~~..,...........T.~',
    '~~~sss...........~~~~~~..H...............~~~~~~...T............~',
    '~~~~.sss........~~~~~~~..HHHHHHHHH....H..~~~~~~.........,......~',
    '~~~~~~~~~~~~~~~~~~~~~~~...............H..~~~~~~..............T.~',
    '~~~~~~~~~~~~~~~~~~~~~~~~......,....,....~~~~~~~......T.........~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~..............~~~~~~~~..T..........,..~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..........T.....~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..............~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~............~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
  spawn: { col: 7, row: 9 },
  entities: [
    // Start meadow
    { type: 'waddleDee', col: 10, row: 14 },
    { type: 'waddleDee', col: 13, row: 8 },
    { type: 'waddleDee', col: 7, row: 18 },
    { type: 'brontoBurt', col: 14, row: 11 },
    { type: 'maximTomato', col: 4, row: 17 },

    // Plateau
    { type: 'waddleDee', col: 25, row: 4 },
    { type: 'waddleDee', col: 36, row: 9 },
    { type: 'waddleDoo', col: 31, row: 13 },
    { type: 'cappy', col: 34, row: 4 },
    { type: 'brontoBurt', col: 24, row: 18 },
    { type: 'waddleDee', col: 33, row: 19 },
    { type: 'waddleDoo', col: 37, row: 22 },
    { type: 'cappy', col: 28, row: 22 },
    { type: 'maximTomato', col: 29, row: 7 },

    // Second river
    { type: 'brontoBurt', col: 43, row: 11 },

    // Forest
    { type: 'waddleDee', col: 49, row: 6 },
    { type: 'waddleDoo', col: 51, row: 14 },
    { type: 'waddleDee', col: 52, row: 22 },
    { type: 'cappy', col: 57, row: 20 },
    { type: 'brontoBurt', col: 54, row: 5 },
    { type: 'waddleDee', col: 50, row: 10 },
    { type: 'maximTomato', col: 59, row: 25 },

    // Boss
    { type: 'whispyWoods', col: 60, row: 12 },
  ],
};
