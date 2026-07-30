import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "BLOG");
const outputRoot = path.join(root, "devlog");
const postOutputRoot = path.join(outputRoot, "posts");
const siteUrl = "https://studioflow.media";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const escapeHtml = (value = "") =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const escapeXml = (value = "") =>
  escapeHtml(value).replaceAll("'", "&apos;");

const slugify = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "post";

const humanTitle = (value) => value.replace(/\s+---\s+/g, " — ").trim();

function parseFrontMatter(markdown) {
  if (!markdown.startsWith("---\n")) return { attributes: {}, body: markdown };
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return { attributes: {}, body: markdown };

  const attributes = {};
  for (const line of markdown.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    attributes[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  return { attributes, body: markdown.slice(end + 5) };
}

function safeUrl(value) {
  const trimmed = value.trim();
  if (/^(https?:|mailto:|\/|\.{0,2}\/|#)/i.test(trimmed) || !trimmed.includes(":")) return trimmed;
  return "#";
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_match, alt, url, title) => {
    const titleAttribute = title ? ` title="${title}"` : "";
    return `<img src="${escapeHtml(safeUrl(url))}" alt="${alt}"${titleAttribute} loading="lazy">`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_match, label, url, title) => {
    const titleAttribute = title ? ` title="${title}"` : "";
    const target = /^https?:/i.test(url) ? ' target="_blank" rel="noreferrer"' : "";
    return `<a href="${escapeHtml(safeUrl(url))}"${titleAttribute}${target}>${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/(^|[^\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  return html;
}

function isBlockStart(line) {
  return /^(#{1,6})\s+/.test(line)
    || /^(\*|-|_){3,}\s*$/.test(line)
    || /^>\s?/.test(line)
    || /^[-*+]\s+/.test(line)
    || /^\d+\.\s+/.test(line)
    || /^```/.test(line);
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  let skippedTitle = false;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (heading[1].length === 1 && !skippedTitle) {
        skippedTitle = true;
      } else {
        const level = heading[1].length;
        blocks.push(`<h${level}>${inlineMarkdown(humanTitle(heading[2]))}</h${level}>`);
      }
      index += 1;
      continue;
    }

    if (/^(\*|-|_){3,}\s*$/.test(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const languageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
      blocks.push(`<pre><code${languageClass}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote><p>${inlineMarkdown(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const matcher = ordered ? /^\d+\.\s+(.+)$/ : /^[-*+]\s+(.+)$/;
      const items = [];
      while (index < lines.length) {
        const match = lines[index].match(matcher);
        if (!match) break;
        items.push(`<li>${inlineMarkdown(match[1])}</li>`);
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      blocks.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      const current = lines[index].trim();
      paragraph.push(current.endsWith("\\") ? `${current.slice(0, -1)}<br>` : current);
      index += 1;
    }
    blocks.push(`<p>${inlineMarkdown(paragraph.join(" ")).replaceAll("&lt;br&gt;", "<br>")}</p>`);
  }

  return blocks.join("\n");
}

async function listFiles(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relativePath = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(directory, entry.name), relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

async function copyAttachments(sourceDirectory, outputDirectory, attachments) {
  for (const attachment of attachments) {
    const destination = path.join(outputDirectory, attachment);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(sourceDirectory, attachment), destination);
  }
}

const imageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function attachmentMarkup(attachments) {
  if (!attachments.length) return "";
  const items = attachments.map((file) => {
    const extension = path.extname(file).toLowerCase();
    const label = path.basename(file);
    if (imageExtensions.has(extension)) {
      return `<a class="blog-attachment blog-attachment-image" href="${escapeHtml(file)}" target="_blank"><img src="${escapeHtml(file)}" alt="${escapeHtml(label)}" loading="lazy"><span>${escapeHtml(label)}</span></a>`;
    }
    const type = extension === ".pdf" ? "PDF document" : `${extension.slice(1).toUpperCase() || "File"} attachment`;
    return `<a class="blog-attachment" href="${escapeHtml(file)}" download><span class="blog-attachment-type">${escapeHtml(type)}</span><strong>${escapeHtml(label)}</strong><span aria-hidden="true">↓</span></a>`;
  });
  return `<section class="blog-attachments" aria-labelledby="attachments-title"><h2 id="attachments-title">Attachments</h2><div class="blog-attachment-list">${items.join("")}</div></section>`;
}

function authorMarkup() {
  return `<footer class="blog-author" aria-label="About the author">
  <img class="blog-author-photo" src="/JR/JR.jpg" alt="Jakub Rolka" width="88" height="88" loading="lazy">
  <div class="blog-author-details">
    <span class="blog-author-label">Written by</span>
    <strong>Jakub Rolka</strong>
    <span>Founder, StudioFlow</span>
  </div>
  <a class="blog-author-brand" href="/" aria-label="StudioFlow — home">
    <img src="/assets/logo/studioflow-logo.svg" alt="StudioFlow">
  </a>
</footer>`;
}

function chrome({ title, description, canonical, main, current = "blog", type = "website" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#ffffff">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <title>${escapeHtml(title)} — StudioFlow</title>
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="alternate" type="application/rss+xml" title="StudioFlow Devlog" href="/devlog/feed.xml">
  <link rel="stylesheet" href="/style.css">
  <script src="/script.js" defer></script>
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand-logo-link" aria-label="StudioFlow — home"><img class="brand-logo-svg brand-logo-svg-small" src="/assets/logo/studioflow-logo.svg" alt="StudioFlow"></a>
      <button class="mobile-menu-button" type="button" aria-expanded="false" aria-controls="main-navigation" aria-label="Open navigation"><span></span><span></span></button>
      <nav class="main-navigation" id="main-navigation" aria-label="Main navigation">
        <a href="/#plugins">Plugins</a>
        <a href="/#applications">Applications</a>
        <a href="/#about">About</a>
        <a href="/devlog/"${current === "blog" ? ' aria-current="page"' : ""}>Blog</a>
        <a class="header-cta" href="/#plugins">Explore tools</a>
      </nav>
    </div>
  </header>
  ${main}
  <footer class="site-footer">
    <div class="container footer-inner">
      <p>© <span id="current-year"></span> StudioFlow</p>
      <nav class="footer-links" aria-label="Footer navigation">
        <a href="/#plugins">Plugins</a><a href="/#applications">Applications</a><a href="/#about">About</a><a href="/devlog/"${current === "blog" ? ' aria-current="page"' : ""}>Blog</a><a href="/support/">Support</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/contact/">Contact</a>
      </nav>
    </div>
  </footer>
</body>
</html>
`;
}

const dateDirectories = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && datePattern.test(entry.name))
  .map((entry) => entry.name);

await rm(postOutputRoot, { recursive: true, force: true });
const posts = [];
for (const date of dateDirectories) {
  const sourceDirectory = path.join(sourceRoot, date);
  const files = await listFiles(sourceDirectory);
  const markdownFiles = files.filter((file) => path.extname(file).toLowerCase() === ".md");
  const allAttachments = files.filter((file) => path.extname(file).toLowerCase() !== ".md");
  const usedSlugs = new Set();

  for (const markdownFile of markdownFiles) {
    const raw = await readFile(path.join(sourceDirectory, markdownFile), "utf8");
    const { attributes, body } = parseFrontMatter(raw);
    const firstHeading = body.match(/^#\s+(.+)$/m)?.[1] || path.basename(markdownFile, ".md");
    const title = humanTitle(attributes.title || firstHeading);
    const slug = attributes.slug ? slugify(attributes.slug) : slugify(path.basename(markdownFile, ".md"));
    if (usedSlugs.has(slug)) {
      throw new Error(`Duplicate post slug "${slug}" in BLOG/${date}.`);
    }
    usedSlugs.add(slug);
    const plainBody = body
      .replace(/^#.+$/m, "")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`>#-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const excerpt = attributes.excerpt || `${plainBody.slice(0, 190).trim()}${plainBody.length > 190 ? "…" : ""}`;
    const configuredAttachments = attributes.attachments
      ? attributes.attachments.split(",").map((item) => item.trim()).filter(Boolean)
      : allAttachments;
    const missingAttachments = configuredAttachments.filter((item) => !allAttachments.includes(item));
    if (missingAttachments.length) {
      throw new Error(`Missing attachment${missingAttachments.length === 1 ? "" : "s"} for ${markdownFile}: ${missingAttachments.join(", ")}`);
    }
    const attachments = configuredAttachments.filter((item) => allAttachments.includes(item));
    const urlPath = `/devlog/posts/${date}/${slug}/`;
    const outputDirectory = path.join(postOutputRoot, date, slug);

    await mkdir(outputDirectory, { recursive: true });
    await copyAttachments(sourceDirectory, outputDirectory, allAttachments);
    const article = `<main id="top" class="blog-post-page">
  <article class="blog-post">
    <header class="blog-post-header">
      <a class="blog-back-link" href="/devlog/">← All devlogs</a>
      <p class="section-label">StudioFlow Devlog</p>
      <h1>${escapeHtml(title)}</h1>
      <time datetime="${date}">${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}</time>
    </header>
    <div class="blog-post-content">${markdownToHtml(body)}</div>
    ${attachmentMarkup(attachments)}
    ${authorMarkup()}
  </article>
</main>`;
    await writeFile(path.join(outputDirectory, "index.html"), chrome({
      title,
      description: excerpt,
      canonical: `${siteUrl}${urlPath}`,
      main: article,
      type: "article"
    }));
    posts.push({ title, date, slug, excerpt, url: urlPath, attachments });
  }
}

posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
await mkdir(outputRoot, { recursive: true });

const cards = posts.map((post) => `<article class="blog-card reveal">
  <p class="blog-card-meta"><time datetime="${post.date}">${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${post.date}T00:00:00Z`))}</time>${post.attachments.length ? `<span>${post.attachments.length} attachment${post.attachments.length === 1 ? "" : "s"}</span>` : ""}</p>
  <h2><a href="${post.url}">${escapeHtml(post.title)}</a></h2>
  <p>${escapeHtml(post.excerpt)}</p>
  <a class="blog-read-link" href="${post.url}">Read devlog <span aria-hidden="true">→</span></a>
</article>`).join("\n");

const indexMain = `<main id="top" class="blog-index-page">
  <section class="blog-index-hero">
    <div class="container">
      <p class="section-label">Behind the tools</p>
      <h1>StudioFlow Devlog</h1>
      <p>Development progress, ideas and stories from building practical tools for post-production.</p>
    </div>
  </section>
  <section class="blog-list-section">
    <div class="container blog-list">${cards || "<p>No devlogs published yet.</p>"}</div>
  </section>
</main>`;

await writeFile(path.join(outputRoot, "index.html"), chrome({
  title: "Devlog",
  description: "Development progress, ideas and behind-the-scenes stories from StudioFlow.",
  canonical: `${siteUrl}/devlog/`,
  main: indexMain
}));

await writeFile(path.join(outputRoot, "posts.json"), `${JSON.stringify(posts, null, 2)}\n`);
const feedItems = posts.map((post) => `<item><title>${escapeXml(post.title)}</title><link>${siteUrl}${post.url}</link><guid>${siteUrl}${post.url}</guid><pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate><description>${escapeXml(post.excerpt)}</description></item>`).join("");
await writeFile(path.join(outputRoot, "feed.xml"), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>StudioFlow Devlog</title><link>${siteUrl}/devlog/</link><description>Development progress, ideas and stories from StudioFlow.</description>${feedItems}</channel></rss>\n`);

console.log(`Built ${posts.length} blog post${posts.length === 1 ? "" : "s"}.`);
