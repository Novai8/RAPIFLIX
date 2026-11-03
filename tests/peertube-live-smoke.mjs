import assert from 'node:assert/strict';

const instance = (process.env.PEERTUBE_TEST_INSTANCE || 'https://peertube2.cpy.re').replace(/\/$/, '');
const timeout = ms => AbortSignal.timeout(ms);

async function request(url, options = {}) {
  return fetch(url, {
    redirect: 'follow',
    headers: { Accept: 'application/json, text/html, */*', 'User-Agent': 'Rapiflix-PeerTube-Smoke/1.0', ...(options.headers || {}) },
    signal: timeout(25000),
    ...options
  });
}

const listResponse = await request(instance + '/api/v1/videos?count=30&sort=-publishedAt&isLive=false');
assert.equal(listResponse.status, 200, 'PeerTube public video catalogue must respond with HTTP 200');
const listing = await listResponse.json();
const summaries = Array.isArray(listing.data) ? listing.data : Array.isArray(listing) ? listing : [];
assert.ok(summaries.length, 'PeerTube test instance must expose at least one public video');

let candidate = null;
let detail = null;
const inspected = [];
for (const summary of summaries.slice(0, 12)) {
  const videoId = summary.uuid || summary.shortUUID || summary.id;
  if (!videoId) continue;
  const detailResponse = await request(instance + '/api/v1/videos/' + encodeURIComponent(String(videoId)));
  if (!detailResponse.ok) {
    inspected.push({ id: videoId, status: detailResponse.status });
    continue;
  }
  const current = await detailResponse.json();
  const hasHls = Array.isArray(current.streamingPlaylists) && current.streamingPlaylists.some(playlist => playlist.playlistUrl);
  const hasFile = Array.isArray(current.files) && current.files.some(file => file.fileUrl);
  inspected.push({ id: videoId, title: current.name, privacy: current.privacy?.id, hasHls, hasFile });
  if (current.privacy?.id === 1 && !current.isLive && (hasHls || hasFile)) {
    candidate = current;
    detail = current;
    break;
  }
}
assert.ok(candidate, 'PeerTube must expose at least one public video with a playable HLS playlist or video file. Inspected: ' + JSON.stringify(inspected));

const videoId = candidate.uuid || candidate.shortUUID || candidate.id;
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
  videoTitle: candidate.name || 'Untitled public PeerTube video',
  category: candidate.category?.label || 'Unknown category',
  licence: candidate.licence?.label || 'Unknown licence',
  publicDomainOrOpenlyLicensedFilmFound: candidate.category?.id === 2 && [1, 2, 7, 8].includes(candidate.licence?.id),
  embedHttpStatus: embedResponse.status,
  mediaHttpStatus: mediaResponse.status,
  mediaKind: hls ? 'HLS playlist' : 'direct video file',
  mediaBytesReceived: mediaBytes.length,
  result: 'PeerTube public video embed and media endpoint are reachable.'
}, null, 2));
