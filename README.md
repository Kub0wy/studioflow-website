# StudioFlow Website v0.6

Temporary, deployable static version of the StudioFlow landing page.

## Changes in v0.6

- Added a responsive Devlog section and Blog navigation across the site.
- Added a zero-dependency Markdown publishing generator.
- Added dated source folders, automatic attachment handling, clean post pages,
  a JSON post manifest and an RSS feed.
- Published the first devlog under `BLOG/2026-07-30/`.

## Publish a blog post

Add a `.md` file and its images, PDFs or other attachments to a dated folder:

```text
BLOG/2026-08-04/
├── new-devlog.md
├── screenshot.jpg
└── notes.pdf
```

Then generate the public pages:

```sh
npm run build
```

See [`BLOG/README.md`](BLOG/README.md) for optional titles, excerpts, slugs and
per-post attachment lists.

## Run locally

Open `index.html` directly or use a local server such as VS Code Live Server.
