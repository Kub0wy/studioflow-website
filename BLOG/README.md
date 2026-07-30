# StudioFlow blog publishing

Create one folder per publication date:

```text
BLOG/
└── 2026-07-30/
    ├── my-post.md
    ├── screenshot.jpg
    └── project-notes.pdf
```

Every `.md` file becomes a separate post. The first level-one heading is used
as the title and the first paragraph becomes the list excerpt. Images, PDFs and
other files in the same date folder are copied beside the generated post and
shown in an **Attachments** section.

When a date folder contains several posts, use optional front matter to assign
specific attachments:

```md
---
title: A custom title
excerpt: A short description for the blog list.
slug: custom-address
attachments: screenshot.jpg, project-notes.pdf
---
```

Relative Markdown links and images work normally:

```md
![Interface preview](screenshot.jpg)
[Download the notes](project-notes.pdf)
```

Run `npm run build` after adding or changing content. This regenerates the blog
index, individual post pages, the JSON post manifest and the RSS feed.

Generated public pages are written to `devlog/`; Markdown sources and original
attachments stay cleanly separated in `BLOG/`.
