import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT || 4173);

const titles = [
  { id: 550, media_type: 'movie', title: 'WALL·E: Café', original_title: 'WALL·E: Café', release_date: '2024-06-14', overview: 'A special-character fixture title for deep-link and search coverage.', poster_path: '/fixture-wall-e.jpg', backdrop_path: '/fixture-wall-e-backdrop.jpg', genre_ids: [16, 18], original_language: 'en', vote_average: 8.1 },
  { id: 551, media_type: 'movie', title: 'Amélie', original_title: 'Amélie', release_date: '2001-04-25', overview: 'An accented-title fixture for slug and keyboard coverage.', poster_path: '/fixture-amelie.jpg', backdrop_path: '/fixture-amelie-backdrop.jpg', genre_ids: [18], original_language: 'fr', vote_average: 8.0 },
  { id: 552, media_type: 'movie', title: 'Dune', original_title: 'Dune', release_date: '2021-10-22', overview: 'The first duplicate-title fixture.', poster_path: '/fixture-dune-2021.jpg', backdrop_path: '/fixture-dune-backdrop.jpg', genre_ids: [878], original_language: 'en', vote_average: 8.0 },
  { id: 553, media_type: 'movie', title: 'Dune', original_title: 'Dune', release_date: '1984-12-14', overview: 'The second duplicate-title fixture.', poster_path: '/fixture-dune-1984.jpg', backdrop_path: '/fixture-dune-backdrop.jpg', genre_ids: [878], original_language: 'en', vote_average: 6.3 },
  { id: 1399, media_type: 'tv', name: 'The Fixture Series', original_name: 'The Fixture Series', first_air_date: '2020-01-01', overview: 'A TV fixture for series deep links and episodes.', poster_path: '/fixture-series.jpg', backdrop_path: '/fixture-series-backdrop.jpg', genre_ids: [18], original_language: 'en', vote_average: 8.5, number_of_seasons: 2, number_of_episodes: 4 }
];

const detailFor = (id) => titles.find(title => title.id === Number(id));

function detailResponse(record) {
  if (!record) return null;
  const isTv = record.media_type === 'tv';
  return {
    ...record,
    id: record.id,
    name: isTv ? record.name : undefined,
    title: isTv ? undefined : record.title,
    genres: (record.genre_ids || []).map((id, index) => ({ id, name: ['Drama', 'Animation', 'Science Fiction'][index] || 'Drama' })),
    status: isTv ? 'Returning Series' : 'Released',
    runtime: isTv ? undefined : 112,
    episode_run_time: isTv ? [48] : [],
    seasons: isTv ? [{ season_number: 1, episode_count: 2, name: 'Season 1' }, { season_number: 2, episode_count: 2, name: 'Season 2' }] : [],
    budget: isTv ? 0 : 160000000,
    revenue: isTv ? 0 : 1010000000,
    production_companies: [{ name: 'Fixture Pictures' }],
    production_countries: [{ name: 'Fixtureland' }],
    original_title: isTv ? record.original_name : record.original_title,
    tagline: 'A deterministic browser fixture.'
  };
}

function json(res, value, status = 200) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function tmdb(pathname, query) {
  const endpoint = pathname.replace(/^\/api\/tmdb\//, '');
  if (endpoint.startsWith('genre/')) return { genres: [{ id: 18, name: 'Drama' }, { id: 16, name: 'Animation' }, { id: 878, name: 'Science Fiction' }] };
  if (endpoint === 'search/multi') {
    const term = (query.get('query') || '').toLocaleLowerCase();
    return { page: 1, total_pages: 1, total_results: titles.filter(item => `${item.title || item.name} ${item.original_title || item.original_name}`.toLocaleLowerCase().includes(term)).length, results: titles.filter(item => `${item.title || item.name} ${item.original_title || item.original_name}`.toLocaleLowerCase().includes(term)).map(item => ({ ...item })) };
  }
  const detailMatch = endpoint.match(/^(movie|tv)\/(\d+)$/);
  if (detailMatch) {
    const record = detailFor(detailMatch[2]);
    if (!record || (detailMatch[1] === 'tv') !== (record.media_type === 'tv')) return { status_code: 34, status_message: 'The resource you requested could not be found.' };
    return detailResponse(record);
  }
  const seasonMatch = endpoint.match(/^tv\/(\d+)\/season\/(\d+)$/);
  if (seasonMatch) return { id: Number(seasonMatch[1]), season_number: Number(seasonMatch[2]), episodes: [1, 2].map(number => ({ id: number, episode_number: number, name: `Fixture episode ${number}`, overview: 'Episode fixture synopsis.', runtime: 48, air_date: '2020-01-01' })) };
  if (endpoint.endsWith('/credits')) return { id: 1, cast: [{ id: 1, name: 'Fixture Performer', character: 'Themselves' }], crew: [{ id: 2, name: 'Fixture Director', job: 'Director' }] };
  if (endpoint.endsWith('/recommendations') || endpoint.endsWith('/similar')) return { page: 1, results: titles.slice(0, 2).map(item => ({ ...item })) };
  if (endpoint.endsWith('/videos')) return { id: 1, results: [] };
  if (endpoint.endsWith('/translations')) return { id: 1, translations: [] };
  if (endpoint.endsWith('/watch/providers')) return { id: 1, results: {} };

  const isTv = endpoint.includes('/tv') || endpoint === 'discover/tv';
  const results = endpoint === 'discover/tv' ? titles.filter(item => item.media_type === 'tv') : titles.filter(item => item.media_type === 'movie');
  return { page: 1, total_pages: 1, total_results: results.length, results: results.map(item => ({ ...item })) };
}

async function serveFile(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) return json(res, { error: 'Not found' }, 404);
  try {
    const body = await readFile(target);
    const type = target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.css') ? 'text/css; charset=utf-8' : target.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (_) {
    const shell = await readFile(path.join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(shell);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (url.pathname === '/api/health') return json(res, { ok: true, service: 'rapiflix-api' });
  if (url.pathname.startsWith('/api/tmdb/')) return json(res, tmdb(url.pathname, url.searchParams));
  if (url.pathname === '/streams.json') return json(res, { movies: {}, embedProviders: [] });
  if (url.pathname.startsWith('/api/')) return json(res, { error: 'Fixture route not found' }, 404);
  return serveFile(res, url.pathname);
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Rapiflix Playwright fixture listening on http://127.0.0.1:${port}\n`);
});
