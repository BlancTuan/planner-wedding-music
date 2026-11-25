# Media Acquisition Port

`MediaAcquisitionPort` is the only component allowed to obtain external media bytes.

```text
inspect(videoId) -> {
  acquisitionState: AVAILABLE | BLOCKED | UNAVAILABLE,
  reasonCode: string,
  audioFormatHint: string | null
}

acquire(videoId, destinationDirectory) -> {
  videoPath: string | null,
  audioPath: string,
  container: string,
  audioCodec: string,
  sampleRate: number,
  channels: number
}
```

Rules:

- `inspect` must not write media files.
- `acquire` may run only after `inspect` returned `AVAILABLE`.
- The YouTube adapter returns `AVAILABLE` and `YOUTUBE_DOWNLOAD` for a valid 11-character video id. Its `acquire` runs yt-dlp into the destination directory and returns the MP3 path. It fails with `VIDEO_UNAVAILABLE`, `DURATION_EXCEEDED`, `DOWNLOADER_MISSING`, or `DOWNLOAD_FAILED`, and removes partial files.
- The fixture adapter accepts only ids with the prefix `fixture:` and reads a file from `tests/fixtures/media`. It rejects ids that contain a URL host.
- Metadata lookup is not part of this port. oEmbed and the optional Data API live behind a separate metadata client.
- Callers must not pass a raw user URL to a downloader. They pass a normalized video id.
