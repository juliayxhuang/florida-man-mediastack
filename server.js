import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function safeParseUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function isPrivateHostname(hostname) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost") return true;
  if (lower.endsWith(".local")) return true;
  if (lower === "0.0.0.0") return true;
  if (lower === "::1") return true;

  // Quick IPv4 private-range check if hostname is a raw IP.
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }

  return false;
}

function collectMetaCandidates(html) {
  const candidates = [];

  // <meta property="article:published_time" content="...">
  const metaRe =
    /<meta\s+[^>]*?(?:property|name)\s*=\s*["']([^"']+)["'][^>]*?content\s*=\s*["']([^"']+)["'][^>]*?>/gi;
  let metaMatch;
  while ((metaMatch = metaRe.exec(html))) {
    const key = metaMatch[1].trim().toLowerCase();
    const value = metaMatch[2].trim();
    candidates.push({ source: `meta:${key}`, value });
  }

  // <time datetime="...">
  const timeRe = /<time\s+[^>]*?datetime\s*=\s*["']([^"']+)["'][^>]*?>/gi;
  let timeMatch;
  while ((timeMatch = timeRe.exec(html))) {
    candidates.push({ source: "time:datetime", value: timeMatch[1].trim() });
  }

  return candidates;
}

function findJsonLdBlocks(html) {
  const blocks = [];
  const scriptRe =
    /<script\s+[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(html))) {
    const raw = match[1].trim();
    if (raw) blocks.push(raw);
  }
  return blocks;
}

function* walkJson(value) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) yield* walkJson(item);
    return;
  }
  if (typeof value === "object") {
    yield value;
    for (const v of Object.values(value)) yield* walkJson(v);
  }
}

function collectJsonLdCandidates(json) {
  const candidates = [];
  for (const obj of walkJson(json)) {
    for (const key of ["datePublished", "dateCreated", "uploadDate", "publishedAt"]) {
      const raw = obj?.[key];
      if (typeof raw === "string" && raw.trim()) {
        candidates.push({ source: `jsonld:${key}`, value: raw.trim() });
      }
    }
  }
  return candidates;
}

function parseToDate(value) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function pickBestCandidate(candidates) {
  const priority = [
    "meta:article:published_time",
    "meta:og:article:published_time",
    "meta:datepublished",
    "meta:parsely-pub-date",
    "meta:publishdate",
    "meta:pubdate",
    "meta:dc.date.issued",
    "meta:dc.date",
    "jsonld:datePublished",
    "jsonld:dateCreated",
    "time:datetime"
  ];

  const normalized = candidates
    .map((c) => ({ ...c, date: parseToDate(c.value) }))
    .filter((c) => c.date);

  for (const key of priority) {
    const hit = normalized.find((c) => c.source === key);
    if (hit) return hit;
  }

  return normalized[0] ?? null;
}

async function fetchHtmlWithLimits(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; FloridaManDateChecker/1.0; +https://render.com)",
        accept: "text/html,application/xhtml+xml"
      }
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      return { ok: false, status: res.status, contentType, html: null };
    }

    // Quick gate: don’t attempt to parse non-HTML.
    if (!contentType.toLowerCase().includes("text/html")) {
      return { ok: false, status: 415, contentType, html: null };
    }

    const MAX_BYTES = 2_000_000; // 2MB
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { ok: true, status: res.status, contentType, html: text.slice(0, 200_000) };
    }

    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) {
        return { ok: false, status: 413, contentType, html: null };
      }
      chunks.push(value);
    }

    const html = Buffer.concat(chunks).toString("utf8");
    return { ok: true, status: res.status, contentType, html };
  } finally {
    clearTimeout(timeout);
  }
}

async function handlePublishDateApi(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const raw = reqUrl.searchParams.get("url") || "";
  const target = safeParseUrl(raw);

  if (!target) {
    sendJson(res, 400, { ok: false, error: "Invalid url" });
    return;
  }
  if (isPrivateHostname(target.hostname)) {
    sendJson(res, 400, { ok: false, error: "Blocked hostname" });
    return;
  }

  const fetched = await fetchHtmlWithLimits(target.toString());
  if (!fetched.ok || !fetched.html) {
    sendJson(res, 200, {
      ok: true,
      url: target.toString(),
      published: null,
      source: null,
      reason: "fetch_failed_or_non_html",
      status: fetched.status,
      contentType: fetched.contentType || null
    });
    return;
  }

  const metaCandidates = collectMetaCandidates(fetched.html);
  const jsonLdBlocks = findJsonLdBlocks(fetched.html);

  let jsonLdCandidates = [];
  for (const block of jsonLdBlocks) {
    try {
      const json = JSON.parse(block);
      jsonLdCandidates = jsonLdCandidates.concat(collectJsonLdCandidates(json));
    } catch {
      // ignore invalid json-ld blocks
    }
  }

  const candidates = metaCandidates.concat(jsonLdCandidates);
  const best = pickBestCandidate(candidates);

  sendJson(res, 200, {
    ok: true,
    url: target.toString(),
    published: best?.date ? best.date.toISOString() : null,
    source: best?.source ?? null,
    status: fetched.status,
    contentType: fetched.contentType || null
  });
}

async function serveStatic(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  const safePath = pathname.replaceAll("..", "");
  const filePath = path.join(__dirname, safePath === "/" ? "/index.html" : safePath);

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES.get(ext) || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (pathname === "/api/publish-date") {
      await handlePublishDateApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: "Server error" });
    console.error(err);
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`Listening on http://${displayHost}:${PORT}`);
});
