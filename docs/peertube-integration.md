# PeerTube playback integration

Rapiflix now supports PeerTube as an optional, per-title iframe provider.

## Important limitation

A TMDB ID is not a PeerTube video ID. PeerTube does not resolve arbitrary movie or TV titles from TMDB. A video must already exist publicly on a PeerTube instance and must be licensed for the intended distribution/embedding use.

## Configuration

Edit `streams.json`:

```json
{
  "peerTube": {
    "enabled": true,
    "instanceUrl": "https://your-peertube-instance.example",
    "videos": {
      "movie:27205": "PEERTUBE_VIDEO_UUID_OR_SHORT_UUID",
      "tv:70523:1:1": "PEERTUBE_EPISODE_VIDEO_UUID_OR_SHORT_UUID"
    }
  }
}
```

Use one mapping per movie, and one mapping per TV episode. TV keys use this form:

`tv:TMDB_ID:SEASON:EPISODE`

Only use public videos you own or have permission to distribute and embed. PeerTube's public documentation supports embedding by video ID/UUID and its embed API exposes a player-ready promise and playback status events.

## Runtime behavior

- A mapped PeerTube video is tried before the existing VidCore provider.
- Unmapped titles continue through the existing VidCore route.
- The watch room reports when the PeerTube player is initialized.
- It reports **Playback confirmed** only after PeerTube emits a `playbackStatusUpdate` event with `playbackState: "playing"`.
- An iframe loading by itself is not treated as proof that video playback works.

## Official references

- https://docs.joinpeertube.org/api/embed-player
- https://docs.joinpeertube.org/api-rest-reference.html
