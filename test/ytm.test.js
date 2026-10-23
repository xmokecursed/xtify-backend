const test = require('node:test');
const assert = require('node:assert');
const { similarSongs } = require('../ytm');

const up = (videoId, title) => ({ videoId, title, artists: { name: 'A' }, duration: 200 });
const hit = (videoId, name) => ({ videoId, name, artist: { name: 'B' }, duration: 180 });

test('uses the radio and drops the seed and duplicates', async () => {
  const ytm = { getUpNexts: async () => [up('SEED0000001', 'x'), up('aaaaaaaaaaa', 'one'), up('aaaaaaaaaaa', 'dup'), up('bbbbbbbbbbb', 'two'), up('ccccccccccc', 'three'), up('ddddddddddd', 'four'), up('eeeeeeeeeee', 'five')] };
  const r = await similarSongs(ytm, 'SEED0000001', '');
  assert.deepStrictEqual(r.map(s => s.id), ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee']);
});

test('falls back to a song search when the radio fails (unreleased song)', async () => {
  const ytm = {
    getUpNexts: async () => { throw new Error('Invalid response structure'); },
    searchSongs: async (q) => (q === 'my song' ? [hit('fffffffffff', 'found')] : []),
  };
  const r = await similarSongs(ytm, 'SEED0000001', 'my song');
  assert.deepStrictEqual(r.map(s => s.id), ['fffffffffff']);
  assert.strictEqual(r[0].artist, 'B');
});

test('looks the title up itself when no query is given', async () => {
  const ytm = {
    getUpNexts: async () => [],
    getSong: async () => ({ name: 'T', artist: { name: 'Z' } }),
    searchSongs: async (q) => (q === 'Z T' ? [hit('ggggggggggg', 'g')] : []),
  };
  assert.strictEqual((await similarSongs(ytm, 'SEED0000001', '')).length, 1);
});
