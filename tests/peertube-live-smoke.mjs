import assert from 'node:assert/strict';

const instance = (process.env.PEERTUBE_TEST_INSTANCE || 'https://peertube2.cpy.re').replace(/\/$/, '');
const timeout = ms => AbortSignal.timeout(ms);

async function request(url, options = {}) {
  return fetch(url, {
    redirect: 'follow',
    headers: { Accept: 'application/json, text/html, */*', 'User-Agent': 'Rapiflix-PeerTube-Smoke/1.0', ...(options.headers || {}) },
    signal: timeout(12000),
    ...options
  });
}
async function videosFrom(url) {
  const response = await request(url);
  const json = response.ok ? await response.json() : null;
  return { status: response.status, videos: Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [] };
}
async function fullVideo(summary) {
  const id = summary.uuid || summary.shortUUID || summary.id;
  if (!id) return null;
  const response = await request(instance + '/api/v1/videos/' + encodeURIComponent(String(id)));
  if (!response.ok) return null;
  return response.json();
}
const hasMedia = video =>
  (Array.isArray(video?.files) && video.files.some(file => file.fileUrl)) ||
  (Array.isArray(video?.streamingPlaylists) && video.streamingPlaylists.some(playlist => playlist.playlistUrl));

const [recent, films] = await Promise.all([
  videosFrom(instance + '/api/v1/videos?count=30&sort=-publishedAt&isLive=false'),
  videosFrom(instance + '/api/v1/videos?count=100&categoryOneOf=2&isLive=false')
]);
assert.equal(recent.status, 200, 'PeerTube public video catalogue must respond with HTTP 200');
assert.ok(recent.videos.length, 'PeerTube test instance must expose at least one public video');

let candidate = null;
for (const summary of recent.videos.slice(0, 12)) {
  const video = await fullVideo(summary);
  if (video?.privacy?.id === 1 && !video.isLive && hasMedia(video)) {
    candidate = video;
    break;
  }
}
assert.ok(candidate, 'PeerTube must expose a public video with a playable HLS playlist or video file');

const filmSummaries = films.videos.filter(video => video.category?.id === 2);
let licensedFilm = null;
for (const summary of filmSummaries.slice(0, 5)) {
  const video = await fullVideo(summary);
  if (video?.privacy?.id === 1 && !video.isLive && [1, 2, 7, 8].includes(video.licence?.id) && hasMedia(video)) {
    licensedFilm = video;
    break;
  }
}

const videoId = candidate.uuid || candidate.shortUUID || candidate.id;
const embedResponse = await request(instance + '/videos/embed/' + encodeURIComponent(String(videoId)), {
  headers: { Accept: 'text/html,*/*' }
});
assert.equal(embedResponse.status, 200, 'PeerTube iframe page must respond with HTTP 200');
const embedHtml = await embedResponse.text();
assert.ok(embedHtml.length > 500, 'PeerTube iframe response must contain a player page');

const hls = (candidate.streamingPlaylists || []).find(playlist => playlist.playlistUrl);
const file = (candidate.files || []).find(item => item.fileUrl);
const mediaUrl = hls?.playlistUrl || file?.fileUrl;
assert.ok(mediaUrl, 'PeerTube video must expose an HLS playlist or a public video file');

async function fetchHlsSegment(url, depth = 0) {
  const response = await request(url, { headers: { Range: 'bytes=0-4095' } });
  assert.ok([200, 206].includes(response.status), 'PeerTube HLS playlist/segment must return video data');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 0, 'PeerTube HLS response must not be empty');
  const text = new TextDecoder().decode(bytes);
  if (text.startsWith('#EXTM3U')) {
    assert.ok(depth < 3, 'PeerTube HLS playlist nesting exceeded the test limit');
    const next = text.split(/\\r?\\n/).map(line => line.trim()).find(line => line && !line.startsWith('#')) ||
      text.match(/URI="([^"]+)"/)?.[1];
    assert.ok(next, 'PeerTube HLS playlist must reference a media segment or variant playlist');
    return fetchHlsSegment(new URL(next, url).toString(), depth + 1);
  }
  return { status: response.status, bytes: bytes.length };
}

let mediaStatus, mediaBytes;
if (hls) {
  const segment = await fetchHlsSegment(mediaUrl);
  mediaStatus = segment.status;
  mediaBytes = segment.bytes;
} else {
  const mediaResponse = await request(mediaUrl, { headers: { Range: 'bytes=0-4095' } });
  assert.ok([200, 206].includes(mediaResponse.status), 'PeerTube media endpoint must return video data');
  const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  assert.ok(bytes.length > 0, 'PeerTube media response must not be empty');
  mediaStatus = mediaResponse.status;
  mediaBytes = bytes.length;
}

const playerApiResponse = await request('https://unpkg.com/@peertube/embed-api/build/player.min.js', {
  headers: { Accept: 'application/javascript,*/*' }
});
assert.equal(playerApiResponse.status, 200, 'PeerTube embed API script must be available from its documented CDN');

console.log(JSON.stringify({
  instance,
  filmCategoryQueryHttpStatus: films.status,
  filmCategoryVideosReturned: filmSummaries.length,
  openlyLicensedPlayableFilmFound: Boolean(licensedFilm),
  licensedFilmTitle: licensedFilm?.name || null,
  genericVideoTitle: candidate.name || 'Untitled public PeerTube video',
  genericVideoCategory: candidate.category?.label || 'Unknown category',
  embedHttpStatus: embedResponse.status,
  mediaHttpStatus: mediaStatus,
  mediaKind: hls ? 'HLS playlist' : 'direct video file',
  mediaBytesReceived: mediaBytes,
  playerApiHttpStatus: playerApiResponse.status,
  result: 'PeerTube embed and public media delivery verified; Films category checked separately.'
}, null, 2));
