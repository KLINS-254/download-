# TICOH GENERALI

A responsive media-tools starter with:
- Dark, mobile-first landing page.
- Social link validation and platform recognition for Facebook, Instagram, TikTok, and YouTube.
- Working upload-and-convert tools for audio extraction and video compression using FFmpeg.
- Automatic cleanup of temporary uploads and generated files.
- Basic security headers, rate limiting, upload limits, and safe generated-file identifiers.

## Important: what works now

**The social URL checker recognizes links; it does not download from social platforms.** Direct downloading requires a separately configured, authorized provider/API adapter for each platform. This project intentionally does not scrape platform pages, bypass login/access restrictions, or remove watermarks/creator attribution. Verify platform terms, API access, and copyright permissions before adding providers.

The upload tools are real and run on media files that the user is authorized to process. They require FFmpeg installed on the server.

## Requirements

- Node.js 20 or later
- npm
- FFmpeg installed and available on `PATH`
- Enough disk space and memory for temporary media processing

## Run locally

```bash
# 1. Unzip the project and enter its directory
cd ticoh-generali

# 2. Install dependencies
npm install

# 3. Create environment config
cp .env.example .env

# 4. Install FFmpeg
# Ubuntu/Debian: sudo apt-get update && sudo apt-get install ffmpeg
# macOS with Homebrew: brew install ffmpeg
# Windows: install FFmpeg and add its bin directory to PATH

# 5. Start the server
npm start
```

Open http://localhost:3000.

For development with Node's watch mode:

```bash
npm run dev
```

## Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `3000` | HTTP port |
| `MAX_UPLOAD_MB` | `500` | Maximum uploaded file size |
| `MAX_OUTPUT_MB` | `500` | Maximum generated output size |
| `FFMPEG_PATH` | `ffmpeg` | FFmpeg executable path |

## Project structure

```text
ticoh-generali/
├── public/
│   ├── index.html       # Landing page
│   ├── styles.css       # Responsive dark UI
│   ├── app.js           # Browser interactions
│   └── generated/       # Temporary generated files
├── .env.example
├── .gitignore
├── package.json
├── server.js            # Express API and FFmpeg processing
└── README.md
```

## API routes

- `GET /api/health` — health check.
- `POST /api/analyze` — validate a social URL and identify its platform. Returns `integration_required` for known platforms until an authorized adapter is added.
- `POST /api/process` — multipart upload with `media`, `mode` (`audio` or `video`), `format`, and `quality`.
- `GET /api/download/:file` — download a generated output file.

## Adding authorized social-platform integrations

Implement each provider behind a separate adapter. An adapter should:
1. Use official APIs or a provider contract that explicitly authorizes the use case.
2. Confirm that the user has permission to download/process the media.
3. Respect private content, platform terms, copyright, rate limits, and provider restrictions.
4. Return only formats/qualities actually available from that source.
5. Avoid storing credentials in frontend code.
6. Avoid fetching arbitrary user-supplied URLs from the backend. If remote media fetching is ever added, enforce strict host allowlists, DNS/IP checks on every redirect, blocked private/reserved address ranges, size/time limits, and content-type validation to mitigate SSRF.

## Production deployment checklist

- Use HTTPS and a production process manager/container.
- Put uploads and generated files on ephemeral storage with quotas.
- Add authentication or stronger per-user quotas if abuse becomes a concern.
- Configure reverse-proxy request body/time limits to match upload settings.
- Keep Node dependencies patched.
- Add structured logging that does not store full sensitive URLs or media contents.
- Add terms, privacy policy, copyright contact and takedown procedure.
- Verify the hosting provider permits FFmpeg and long-running media processing.
- Add monitoring and a queue for high-volume processing.
- Use a real contact address before publishing; the sample contact link is a placeholder.

## Limitations

- This starter is not yet a production-grade social media downloader.
- Browser upload progress is not displayed as a percentage; the UI displays processing status.
- `webm` output requires an FFmpeg build with `libvpx-vp9` and `libopus`; MP4 compression requires `libx264`.
- For high traffic, move processing into a job queue and use object storage with expiring signed URLs.
