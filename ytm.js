// Similar songs from YouTube Music.
//
// Matching uses YouTube Music IDs, not names. A name search for "Ado" also returns
// "ADO", "ado nakamura" and any title that contains "ado": different artists. So the
// seed is first resolved to its catalog song (which carries a stable artistId); that
// song's radio is used, then the same artist's songs, picked by artistId.

const norm = (s) =>
  String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The artist's whole name appears in the query ("【Ado】綺羅" contains "Ado").
// A hint only: it cannot tell "Ado" from "ADO"; artist ids do that.
const nameInQuery = (name, q) => {
  const n = norm(name);
  return n.length >= 2 && norm(q).includes(n);
};

// The catalog song the query is about. Its title must appear in the query
// ("綺羅 - KIRA" is inside "【Ado】綺羅（KIRA）"). A title with no artist match has to
// cover at least half of the query, so a song just called "Ado" can't win.
function pickAnchor(results, q) {
  const nq = norm(q);
  let best = null;
  let bestScore = 0;
  for (const s of results || []) {
    const t = norm(s.name);
    if (!s.videoId || t.length < 3 || !nq.includes(t)) continue;
    const hasArtist = nameInQuery(s.artist?.name, q);
    if (!hasArtist && t.length * 2 < nq.length) continue;
    const score = t.length + (hasArtist ? 100 : 0);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

// Same artist: by id when both rows have one (tells "Ado" from "ADO"), else by exact name.
const sameArtist = (a, b) =>
  a.artist?.artistId && b.artist?.artistId
    ? a.artist.artistId === b.artist.artistId
    : norm(a.artist?.name) === norm(b.artist?.name);

async function similarSongs(ytm, id, q, artist = '', limit = 25) {
  const out = [];
  const seen = new Set([id]);
  const add = (videoId, title, artist, duration) => {
    if (!videoId || !title || seen.has(videoId)) return;
    seen.add(videoId);
    out.push({
      id: videoId,
      title,
      artist: artist || '',
      duration, // seconds, same as /search
      thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    });
  };

  let query = q;
  if (!query) {
    try {
      const s = await ytm.getSong(id);
      query = `${s.artist?.name || ''} ${s.name}`.trim();
    } catch (e) { /* no title available */ }
  }

  // 1) find the catalog version of the song
  let results = [];
  if (query) {
    try {
      results = await ytm.searchSongs(query);
    } catch (e) {
      console.log(`ytm search failed for "${query}": ${e.message}`);
    }
  }
  const anchor = pickAnchor(results, query);
  if (anchor) seen.add(anchor.videoId);

  // 2) YouTube Music's radio for it (or for the given id when nothing matched)
  try {
    for (const s of await ytm.getUpNexts(anchor ? anchor.videoId : id)) {
      add(s.videoId, s.title, s.artists?.name, s.duration);
    }
  } catch (e) {
    console.log(`ytm radio failed for ${anchor ? anchor.videoId : id}: ${e.message}`);
  }

  // 2b) no catalog version (unreleased, leaks, odd uploads): look the artist up by
  //     exact name. YouTube Music ranks the real artist first, so "Ado" is found
  //     before "ado nakamura" or a song called "Ado".
  let artistId = anchor?.artist?.artistId;
  if (!anchor && artist && out.length < 10) {
    try {
      const hits = await ytm.searchArtists(artist);
      artistId = hits.find((h) => norm(h.name) === norm(artist))?.artistId;
    } catch (e) {
      console.log(`ytm artist search failed for "${artist}": ${e.message}`);
    }
  }

  // 3) top up with the same artist's songs, chosen by artist id
  if (out.length < 10 && artistId) {
    try {
      for (const s of await ytm.getArtistSongs(artistId)) {
        if (s.artist?.artistId && s.artist.artistId !== artistId) continue;
        add(s.videoId, s.name, s.artist?.name || anchor?.artist?.name || artist, s.duration);
      }
    } catch (e) {
      console.log(`ytm artist songs failed for ${artistId}: ${e.message}`);
    }
  }

  // 4) last resort: search hits whose artist is named in the query (never title hits)
  if (out.length < 5) {
    for (const s of results) {
      const same = anchor ? sameArtist(s, anchor) : nameInQuery(s.artist?.name, query);
      if (same) add(s.videoId, s.name, s.artist?.name, s.duration);
    }
  }
  return out.slice(0, limit);
}

module.exports = { similarSongs, pickAnchor };
