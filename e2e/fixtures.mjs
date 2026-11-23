/*
 * Deterministic TMDB fixtures for browser tests. Clearly mocked: no real
 * provider availability is implied by these records.
 */
const movie = (id, title, year, poster = 'oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg') => ({
  id,
  title,
  original_title: title,
  media_type: 'movie',
  release_date: `${year}-01-01`,
  vote_average: 7.5,
  genres: [{ id: 18, name: 'Drama' }],
  poster_path: `/${poster}`,
  backdrop_path: '/s3TBrRGB1iav7gFOCNx3H31MoES.jpg',
  overview: `${title} fixture overview.`,
  runtime: 120,
  budget: 1000,
  revenue: 2000
});

const show = (id, name, year) => ({
  id,
  name,
  original_name: name,
  media_type: 'tv',
  first_air_date: `${year}-01-01`,
  vote_average: 8,
  genres: [{ id: 18, name: 'Drama' }],
  poster_path: '/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',
  backdrop_path: '/zZqpAXxVSBtxV9qPBcscfXBcL2w.jpg',
  overview: `${name} fixture overview.`,
  number_of_seasons: 1,
  seasons: [{ season_number: 1, name: 'Season 1', episode_count: 3 }]
});

export const fixtures = {
  'movie/27205': movie(27205, 'Inception', 2010),
  'movie/157336': movie(157336, 'Interstellar', 2014),
  'movie/533535': movie(533535, 'Deadpool & Wolverine', 2024, '8cdWjvZQUExUUTzyp4t6EDMubfO.jpg'),
  'movie/operator2': movie(0, 'invalid'),
  'tv/1399': show(1399, 'Game of Thrones', 2011),
  'tv/70523': show(70523, 'Dark', 2017),
  'search/multi': {
    page: 1,
    total_pages: 1,
    results: [
      { ...movie(438631, 'Dune', 2021), media_type: 'movie' },
      { ...movie(438631, 'Dune: Part Two', 2024), id: 693134, media_type: 'movie' }
    ]
  },
  season: {
    episodes: [
      { episode_number: 1, name: 'Winter Is Coming', overview: 'Episode one.', runtime: 62, air_date: '2011-04-17' },
      { episode_number: 2, name: 'The Kingsroad', overview: 'Episode two.', runtime: 56, air_date: '2011-04-24' },
      { episode_number: 3, name: 'Lord Snow', overview: 'Episode three.', runtime: 58, air_date: '2011-05-01' }
    ]
  }
};
