/**
 * 假的"学习站点"：给扩展的 content script 一个可以注入的页面。
 * 路径里带 /learn 才会命中扩展的通用适配器。
 */
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "fixtures", "site");
const port = Number(process.env.E2E_SITE_PORT || 17893);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
};

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  const relative = url.pathname === "/" ? "/learn/course.html" : url.pathname;
  const target = path.join(root, path.normalize(relative).replace(/^([/\\])+/, ""));
  if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  response.writeHead(200, { "content-type": MIME[path.extname(target)] || "application/octet-stream" });
  response.end(fs.readFileSync(target));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[e2e] fake site: http://127.0.0.1:${port}/learn/course.html`);
});
