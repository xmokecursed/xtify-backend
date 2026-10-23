const test = require('node:test');
const assert = require('node:assert');
const { similarSongs, artistSongs } = require('../ytm');

const up = (videoId, title, name = 'A') => ({ videoId, title, artists: { name }, duration: 200 });
const hit = (videoId, name, artist, artistId) => ({ videoId, name, artist: { name: artist, artistId }, duration: 180 });
const ids = (r) => r.map((s) => s.id);

// What the search returned for "【Ado】綺羅（KIRA）" in real life, trimmed.
const KIRA_Q = '【Ado】綺羅（KIRA）';
const kiraSearch = [
  hit('thud0000001', 'Ado', 'Thud', 'UC_thud'),
  hit('kira0000001', '綺羅 - KIRA', 'Ado', 'UC_ado'),
  hit('ado00000001', 'ADO DE LA P*TERIA', 'Dj Monst3r5', 'UC_dj'),
  hit('nakamura001', '残像 - ZANZO', 'ado nakamura', 'UC_nak'),
  hit('other000001', 'Never Be the Same', 'ADO', 'UC_other'),
];

test('uses the radio and drops the seed and duplicates', async () => {
  const ytm = { getUpNexts: async () => [up('SEED0000001', 'x'), up('aaaaaaaaaaa', 'one'), up('aaaaaaaaaaa', 'dup'), up('bbbbbbbbbbb', 'two'), up('ccccccccccc', 'three'), up('ddddddddddd', 'four'), up('eeeeeeeeeee', 'five')] };
  const r = await similarSongs(ytm, 'SEED0000001', '');
  assert.deepStrictEqual(ids(r), ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee']);
});

test('resolves the catalog song and uses ITS radio, not name hits', async () => {
  let radioFor;
  const ytm = {
    searchSongs: async () => kiraSearch,
    getUpNexts: async (id) => { radioFor = id; return [up('r1000000001', 'one'), up('r2000000002', 'two'), up('r3000000003', 'three'), up('r4000000004', 'four'), up('r5000000005', 'five'), up('r6000000006', 'six'), up('r7000000007', 'seven'), up('r8000000008', 'eight'), up('r9000000009', 'nine'), up('r0000000010', 'ten')]; },
  };
  const r = await similarSongs(ytm, 'qpcz3-iDUP8', KIRA_Q);
  assert.strictEqual(radioFor, 'kira0000001');
  assert.ok(!ids(r).some((i) => ['thud0000001', 'ado00000001', 'nakamura001', 'other000001'].includes(i)));
});

test('tops up with the same artist by artist id, never by name', async () => {
  const ytm = {
    searchSongs: async () => kiraSearch,
    getUpNexts: async () => [up('r1000000001', 'one')],
    getArtistSongs: async (artistId) => {
      assert.strictEqual(artistId, 'UC_ado');
      return [
        hit('ado1000000a', 'Usseewa', 'Ado', 'UC_ado'),
        hit('ado2000000b', 'Show', 'ADO', 'UC_other'), // same name, different artist
        hit('ado3000000c', 'Odo', 'Ado'), // no id on the row: it is from this artist's page
      ];
    },
  };
  const r = await similarSongs(ytm, 'qpcz3-iDUP8', KIRA_Q);
  assert.deepStrictEqual(ids(r), ['r1000000001', 'ado1000000a', 'ado3000000c']);
});

test('a song called just "Ado" is not taken for the seed', async () => {
  let radioFor;
  const ytm = {
    searchSongs: async () => [hit('thud0000001', 'Ado', 'Thud', 'UC_thud')],
    getUpNexts: async (id) => { radioFor = id; return []; },
  };
  const r = await similarSongs(ytm, 'qpcz3-iDUP8', KIRA_Q);
  assert.strictEqual(radioFor, 'qpcz3-iDUP8'); // no anchor: radio of the given id
  assert.deepStrictEqual(r, []); // and no name-hit dump
});

test('without a catalog match, only hits by the named artist are used', async () => {
  const ytm = {
    searchSongs: async () => [hit('thud0000001', 'Ado', 'Thud', 'UC_thud'), hit('nakamura001', 'x', 'ado nakamura', 'UC_nak'), hit('ado1000000a', 'Some Song', 'Ado', 'UC_ado')],
    getUpNexts: async () => { throw new Error('Invalid response structure'); },
  };
  const r = await similarSongs(ytm, 'SEED0000001', 'Ado unreleased thing');
  assert.deepStrictEqual(ids(r), ['ado1000000a']);
});

test('looks the title up itself when no query is given', async () => {
  const ytm = {
    getSong: async () => ({ name: 'Kira Kira', artist: { name: 'Zed' } }),
    searchSongs: async (q) => (q === 'Zed Kira Kira' ? [hit('ggggggggggg', 'Kira Kira', 'Zed', 'UC_z')] : []),
    getUpNexts: async (id) => (id === 'ggggggggggg' ? [up('hhhhhhhhhhh', 'next')] : []),
  };
  assert.deepStrictEqual(ids(await similarSongs(ytm, 'SEED0000001', '')), ['hhhhhhhhhhh']);
});

test('unreleased song: finds the artist by exact name, then uses their songs by id', async () => {
  let songsFor;
  const ytm = {
    searchSongs: async () => [hit('thud0000001', 'Ado', 'Thud', 'UC_thud')], // no catalog version
    getUpNexts: async () => { throw new Error('Invalid response structure'); },
    searchArtists: async () => [{ name: 'ado nakamura', artistId: 'UC_nak' }, { name: 'Ado', artistId: 'UC_ado' }],
    getArtistSongs: async (artistId) => { songsFor = artistId; return [hit('ado1000000a', 'Usseewa', 'Ado', 'UC_ado'), hit('ado2000000b', 'Show', 'Ado', 'UC_ado')]; },
  };
  const r = await similarSongs(ytm, 'SEED0000001', 'Ado 新曲 demo', 'Ado');
  assert.strictEqual(songsFor, 'UC_ado');
  assert.deepStrictEqual(ids(r), ['ado1000000a', 'ado2000000b']);
});

test('unreleased song, artist not found by exact name: nothing is invented', async () => {
  const ytm = {
    searchSongs: async () => [],
    getUpNexts: async () => [],
    searchArtists: async () => [{ name: 'ado nakamura', artistId: 'UC_nak' }],
    getArtistSongs: async () => { throw new Error('must not be called'); },
  };
  assert.deepStrictEqual(await similarSongs(ytm, 'SEED0000001', 'Ado 新曲', 'Ado'), []);
});

test('no artist given: the artist lookup is skipped', async () => {
  const ytm = {
    searchSongs: async () => [],
    getUpNexts: async () => [],
    searchArtists: async () => { throw new Error('must not be called'); },
  };
  assert.deepStrictEqual(await similarSongs(ytm, 'SEED0000001', 'some title', ''), []);
});

test('artistSongs: exact-name artist, their songs only, by id', async () => {
  let songsFor;
  const ytm = {
    searchArtists: async () => [{ name: 'ado nakamura', artistId: 'UC_nak' }, { name: 'Ado', artistId: 'UC_ado' }],
    getArtistSongs: async (id) => {
      songsFor = id;
      return [
        hit('ado1000000a', 'Usseewa', 'Ado', 'UC_ado'),
        hit('ado1000000a', 'Usseewa (dup)', 'Ado', 'UC_ado'),
        hit('oth1000000b', 'Show', 'ADO', 'UC_other'), // same name, different artist
        hit('ado3000000c', 'Odo', 'Ado'), // no id on the row: it is from this artist's page
      ];
    },
  };
  const r = await artistSongs(ytm, 'Ado');
  assert.strictEqual(songsFor, 'UC_ado');
  assert.deepStrictEqual(ids(r), ['ado1000000a', 'ado3000000c']);
  assert.strictEqual(r[0].artist, 'Ado');
  assert.strictEqual(r[0].thumb, 'https://i.ytimg.com/vi/ado1000000a/mqdefault.jpg');
});

test('artistSongs: no exact name match means no songs (nothing invented)', async () => {
  const ytm = {
    searchArtists: async () => [{ name: 'ado nakamura', artistId: 'UC_nak' }],
    getArtistSongs: async () => { throw new Error('must not be called'); },
  };
  assert.deepStrictEqual(await artistSongs(ytm, 'Ado'), []);
});
