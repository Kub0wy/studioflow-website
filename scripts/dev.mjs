import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const blogRoot = path.join(root, "BLOG");
const buildScript = path.join(root, "scripts", "build-blog.mjs");
const port = Number.parseInt(process.env.PORT || "4173", 10);
const clients = new Set();
let buildNumber = 0;
let building = false;
let rebuildQueued = false;
let debounceTimer;

const contentTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"]
]);

const reloadScript = `<script>
(() => {
  const updates = new EventSource("/__studioflow_updates");
  updates.onmessage = () => window.location.reload();
})();
</script>`;

function broadcastReload() {
  for (const response of clients) response.write("data: reload\n\n");
}

async function buildBlog() {
  if (building) {
    rebuildQueued = true;
    return;
  }

  building = true;
  try {
    buildNumber += 1;
    await import(`${pathToFileURL(buildScript).href}?build=${buildNumber}`);
    broadcastReload();
  } catch (error) {
    console.error("Blog build failed:", error);
  } finally {
    building = false;
    if (rebuildQueued) {
      rebuildQueued = false;
      await buildBlog();
    }
  }
}

function scheduleBuild(filename = "") {
  if (filename && path.basename(filename).startsWith(".")) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(buildBlog, 140);
}

await buildBlog();
watch(blogRoot, { recursive: true }, (_eventType, filename) => scheduleBuild(filename || ""));

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/__studioflow_updates") {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });
    response.write(": connected\n\n");
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  try {
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    let filePath = path.resolve(root, `.${decodedPath}`);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid path");

    let fileStats = await stat(filePath);
    if (fileStats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      fileStats = await stat(filePath);
    }
    if (!fileStats.isFile()) throw new Error("Not a file");

    const extension = path.extname(filePath).toLowerCase();
    const contentType = contentTypes.get(extension) || "application/octet-stream";
    const file = await readFile(filePath);
    const body = extension === ".html"
      ? file.toString("utf8").replace("</body>", `${reloadScript}</body>`)
      : file;
    response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": contentType });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`StudioFlow is available at http://127.0.0.1:${port}/`);
  console.log("BLOG changes are rebuilt automatically.");
});
