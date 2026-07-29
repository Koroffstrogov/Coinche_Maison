import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const outputDirectory = "dist";
const serverDirectory = join(outputDirectory, "server");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "server") continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else {
      files.push(path);
    }
  }

  return files;
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const assets = {};
for (const file of await listFiles(outputDirectory)) {
  const key = relative(outputDirectory, file).split(sep).join("/");
  assets[key] = {
    body: (await readFile(file)).toString("base64"),
    type: mimeTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
  };
}

const workerSource = `const assets = ${JSON.stringify(assets)};

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function responseFor(asset, request, cacheControl) {
  const headers = new Headers({
    "Content-Type": asset.type,
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  });
  return new Response(request.method === "HEAD" ? null : decodeBase64(asset.body), {
    status: 200,
    headers,
  });
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const url = new URL(request.url);
    let path;
    try {
      path = decodeURIComponent(url.pathname).replace(/^\\/+/, "");
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    if (!path) path = "index.html";

    const asset = assets[path];
    if (asset) {
      const immutable = path.startsWith("assets/");
      return responseFor(
        asset,
        request,
        immutable
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
      );
    }

    return responseFor(
      assets["index.html"],
      request,
      "public, max-age=0, must-revalidate",
    );
  },
};
`;

await mkdir(serverDirectory, { recursive: true });
await writeFile(join(serverDirectory, "index.js"), workerSource);

console.log(
  `Prepared Sites worker with ${Object.keys(assets).length} embedded assets.`,
);
