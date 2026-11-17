// Local-only fixture server for browser smoke checks. Not deployed by Cloudflare Pages.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const LIVE_PREFIXES = ['trending/', 'movie/', 'tv/', 'discover/', 'search/'];
const liveCache = new Map();

async function liveTmdb(url) {
  const pathname = url.pathname.replace(/^\/api\/tmdb\//, '');
  if (!LIVE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  const key = pathname + url.search;
  const hit = liveCache.get(key);
  if (hit && hit.expires > Date.now()) return hit;
  const upstream = new URL(`https://api.themoviedb.org/3/${pathname}`);
  url.searchParams.forEach((value, name) => upstream.searchParams.set(name, value));
  upstream.searchParams.set('api_key', TMDB_KEY);
  try {
    const response = await fetch(upstream, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
    const payload = { status: response.status, body: await response.json().catch(() => null) };
    liveCache.set(key, { ...payload, expires: Date.now() + 120000 });
    return payload;
  } catch {
    return null; // network hiccup: fall through to fixtures so local checks keep working
  }
}

const film = (id, title, year, rating, hue) => ({
  id, title, overview: `${title} — a fixture synopsis used only for local layout checks.`,
  poster_path: `http://127.0.0.1:${port}/mock/poster/${id}.svg`,
  backdrop_path: `http://127.0.0.1:${port}/mock/backdrop/${id}.svg`,
  release_date: `${year}-06-01`, vote_average: rating, vote_count: 4200, genre_ids: [28],
  media_type: 'movie', hue
});
const show = (id, name, year, rating, hue) => ({
  id, name, overview: `${name} — a fixture synopsis used only for local layout checks.`,
  poster_path: `http://127.0.0.1:${port}/mock/poster/${id}.svg`,
  backdrop_path: `http://127.0.0.1:${port}/mock/backdrop/${id}.svg`,
  first_air_date: `${year}-09-01`, vote_average: rating, vote_count: 9100,
  genre_ids: [18], media_type: 'tv', hue
});

const movies = [
  film(533535, 'Deadpool & Wolverine', 2024, 7.6, 8), film(693134, 'Dune: Part Two', 2024, 8.2, 28),
  film(872585, 'Oppenheimer', 2023, 8.1, 200), film(346698, 'Barbie', 2023, 7.0, 320),
  film(157336, 'Interstellar', 2014, 8.4, 220), film(238, 'The Godfather', 1972, 8.7, 40),
  film(496243, 'Parasite', 2019, 8.5, 160), film(603, 'The Matrix', 1999, 8.2, 120),
  film(680, 'Pulp Fiction', 1994, 8.5, 300), film(155, 'The Dark Knight', 2008, 8.5, 210)
];
const anime = [film(129, 'Spirited Away', 2001, 8.6, 190), film(508883, 'The Boy and the Heron', 2023, 7.6, 260), film(372058, 'Your Name.', 2016, 8.5, 250)];
const series = [
  show(1396, 'Breaking Bad', 2008, 8.9, 130), show(66732, 'Stranger Things', 2016, 8.6, 280),
  show(94605, 'Arcane', 2021, 8.7, 250), show(1399, 'Game of Thrones', 2011, 8.4, 210),
  show(94997, 'House of the Dragon', 2022, 8.2, 10), show(71446, 'Money Heist', 2017, 8.2, 350)
];

const poster = (id, hue, label, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 60% 26%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 55% 9%)"/>
</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>
<text x="50%" y="50%" fill="rgba(255,255,255,.86)" font-family="Arial" font-size="${Math.round(w / 10)}" font-weight="700" text-anchor="middle">${label.replace(/[<>&]/g, '')}</text>
</svg>`;

const all = [...movies, ...series, ...anime];
const byId = new Map(all.map((item) => [String(item.id), item]));

function detail(item) {
  const isTv = item.media_type === 'tv';
  return {
    ...item,
    genres: isTv ? [{ name: 'Drama' }, { name: 'Sci-Fi' }] : [{ name: 'Action' }, { name: 'Adventure' }],
    runtime: isTv ? 0 : 148,
    episode_run_time: isTv ? [52] : [],
    status: 'Released',
    original_language: 'en',
    budget: isTv ? 0 : 200000000,
    revenue: isTv ? 0 : 845000000,
    seasons: isTv ? [{ season_number: 0, name: 'Specials', episode_count: 1 }, { season_number: 1, name: 'Season 1', episode_count: 3 }, { season_number: 2, name: 'Season 2', episode_count: 2 }] : undefined,
    credits: {
      cast: Array.from({ length: 10 }, (_, i) => ({ name: `Performer ${i + 1}`, character: `Character ${i + 1}`, profile_path: null })),
      crew: [{ name: 'Fixture Director', job: 'Director' }]
    },
    videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'dQw4w9WgXcQ' }] },
    'watch/providers': { results: { US: { flatrate: [{ provider_name: 'Fixture+' }] } } },
    recommendations: { results: movies.slice(0, 6) }
  };
}

const episodes = (n) => ({ episodes: Array.from({ length: n }, (_, i) => ({
  episode_number: i + 1, name: `Episode ${i + 1}`, overview: `Fixture episode ${i + 1} synopsis.`,
  runtime: 52, air_date: '2024-01-0' + ((i % 9) + 1), still_path: null
})) });

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
};

const list = (results) => ({ page: 1, results, total_pages: 5, total_results: results.length * 5 });

function api(url) {
  const p = url.pathname.replace(/^\/api\/tmdb\//, '');
  if (p === 'trending/all/week') return list([...movies.slice(0, 4), ...series.slice(0, 3), ...anime]);
  if (p === 'trending/movie/week' || p === 'movie/popular') return list(movies);
  if (p === 'trending/tv/week' || p === 'tv/popular') return list(series);
  if (p === 'discover/movie') return list(url.searchParams.get('with_genres') === '16' ? anime : movies);
  if (p === 'discover/tv') return list(series);
  if (p === 'search/multi') {
    const q = (url.searchParams.get('query') || '').toLowerCase();
    return list(all.filter((item) => (item.title || item.name).toLowerCase().includes(q)).slice(0, 8));
  }
  const seasonMatch = p.match(/^tv\/([0-9]+)\/season\/([0-9]+)$/);
  if (seasonMatch) return episodes(Number(seasonMatch[2]) === 2 ? 2 : 3);
  const titleMatch = p.match(/^(movie|tv)\/([0-9]+)$/);
  if (titleMatch) {
    const item = byId.get(titleMatch[2]);
    return item ? detail(item) : null;
  }
  return null;
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith('/mock/poster/') || url.pathname.startsWith('/mock/backdrop/')) {
    const id = url.pathname.replace(/^\/mock\/(poster|backdrop)\//, '').replace('.svg', '');
    const item = byId.get(id);
    const isPoster = url.pathname.includes('/poster/');
    const body = poster(id, item?.hue ?? 180, item ? (item.title || item.name) : id, isPoster ? 500 : 1280, isPoster ? 750 : 720);
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end(body);
  }
  if (url.pathname.startsWith('/api/tmdb/')) {
    try {
      if (TMDB_KEY) {
        const live = await liveTmdb(url);
        if (live) return json(res, live.body, live.status);
      }
      const body = api(url);
      return body ? json(res, body) : json(res, { error: 'Fixture endpoint not found' }, 404);
    } catch (error) {
      return json(res, { error: String(error?.message || error) }, 502);
    }
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  try {
    if (!file.startsWith(root)) throw new Error('escape');
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = path.join(root, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(port, '127.0.0.1', () => console.log(`fixture server http://127.0.0.1:${port}`));
