#!/usr/bin/env node
// Minimal static file server for the production build in dist/. No
// dependencies on purpose — this is what the systemd service (see setup.sh)
// runs, and OpenSims has no backend of its own: all game state lives in the
// browser's localStorage, so this process only ever reads files, never writes.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

function contentTypeFor(path) {
  return MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    let relativePath = decodeURIComponent(url.pathname);
    if (relativePath === "/" || relativePath === "") relativePath = "/index.html";

    // Strip any leading ".." segments before joining, then confirm the
    // resolved path still lives under DIST_DIR — belt and suspenders against
    // path traversal from a crafted request path.
    const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = join(DIST_DIR, safePath);
    if (!filePath.startsWith(DIST_DIR + sep) && filePath !== DIST_DIR) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Forbidden");
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentTypeFor(filePath) }).end(body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Internal server error");
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`OpenSims serving ${DIST_DIR} at http://${HOST}:${PORT}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
