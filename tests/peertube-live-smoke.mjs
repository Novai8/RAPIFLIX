import assert from 'node:assert/strict';

const instance = (process.env.PEERTUBE_TEST_INSTANCE || 'https://peertube2.cpy.re').replace(/\/$/, '');
const timeout = ms => AbortSignal.timeout(ms);

async function request(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { Accept: 'application/json, text/html, */*', 'User-Agent': 'Rapiflix-PeerTube-Smoke/1.0', ...(options.headers || {}) },
    signal: timeout(25000),
    ...options
  });
  return response;
}

const listResponse = await request(instance + '/api/v1/videos?count=100&sort=-publishedAt&isLive=false');
assert.equal(listResponse.status, 200, 'PeerTube public video catalogue must respond with HTTP 200');
const listing = await listResponse.json();
const videos = Array.isArray(listing.data) ? listing.data : Array.isArray(listing) ? listing : [];
assert.ok(videos.length, 'PeerTube test instance must expose at least one public video');

const playable = video => video && video.privacy?.id === 1 && !video.isLive &&
  ((Array.isArray(video.files) && video.files.some(file => file.fileUrl)) ||
   (Array.isArray(video.streamingPlaylists) && video.streamingPlaylists.some(playlist => playlist.playlistUrl)));
const licensedFilm = videos.find(video => video.category?.id === 2 && [1, 2, 7, 8].includes(video.licence?.id) && playable(video));
const candidate = licensedFilm || videos.find(playable);
assert.ok(candidate, 'PeerTube test instance must expose a public video with a playable media URL');

const videoId = candidate.uuid || candidate.shortUUID || candidate.id;
assert.ok(videoId, 'Public PeerTube video must have an embeddable identifier');

const detailResponse = await request(instance + '/api/v1/videos/' + encodeURIComponent(String(videoId)));
assert.equal(detailResponse.status, 200, 'PeerTube video metadata must resolve');
const detail = await detailResponse.json();
assert.ok(detail.uuid || detail.shortUUID, 'PeerTube metadata must identify the video');

const embedResponse = await request(instance + '/videos/embed/' + encodeURIComponent(String(videoId)), {
  headers: { Accept: 'text/html,*/*' }
});
assert.equal(embedResponse.status, 200, 'PeerTube iframe page must respond with HTTP 200');
const embedHtml = await embedResponse.text();
assert.ok(embedHtml.length > 500, 'PeerTube iframe response must contain a player page');

const hls = (detail.streamingPlaylists || []).find(playlist => playlist.playlistUrl);
const file = (detail.files || []).find(item => item.fileUrl);
const mediaUrl = hls?.playlistUrl || file?.fileUrl;
assert.ok(mediaUrl, 'PeerTube video must expose an HLS playlist or a public video file');

const mediaResponse = await request(mediaUrl, { headers: { Range: 'bytes=0-2047' } });
assert.ok([200, 206].includes(mediaResponse.status), 'PeerTube media endpoint must return video data');
const mediaBytes = new Uint8Array(await mediaResponse.arrayBuffer());
assert.ok(mediaBytes.length > 0, 'PeerTube media response must not be empty');
if (hls) {
  const playlistText = new TextDecoder().decode(mediaBytes);
  assert.ok(playlistText.includes('#EXTM3U'), 'PeerTube HLS endpoint must return a valid HLS playlist');
}

console.log(JSON.stringify({
  instance,
  videoTitle: candidate.name || detail.name || 'Untitled public PeerTube video',
  category: candidate.category?.label || 'Unknown category',
  licence: candidate.licence?.label || 'Unknown licence',
  publicDomainOrOpenlyLicensedFilmFound: Boolean(licensedFilm),
  embedHttpStatus: embedResponse.status,
  mediaHttpStatus: mediaResponse.status,
  mediaKind: hls ? 'HLS playlist' : 'direct video file',
  mediaBytesReceived: mediaBytes.length,
  result: 'PeerTube public video embed and media endpoint are reachable.'
}, null, 2));
