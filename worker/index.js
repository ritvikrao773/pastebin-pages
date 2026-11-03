const ALLOWED_METHODS = "GET, POST, OPTIONS";
const MAX_CONTENT_LENGTH = 100_000;
const EXPIRATION_SECONDS = 30 * 24 * 60 * 60;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const configuredOrigin = env.ALLOWED_ORIGIN || "";
    const requestOrigin = request.headers.get("Origin") || "";
    const corsHeaders = {
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    if (configuredOrigin && requestOrigin === configuredOrigin) {
      corsHeaders["Access-Control-Allow-Origin"] = configuredOrigin;
    }
    if (request.method === "OPTIONS") {
      if (!configuredOrigin || requestOrigin !== configuredOrigin) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "POST" && url.pathname === "/paste") {
      if (!configuredOrigin || requestOrigin !== configuredOrigin) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
      if (!env.PASTES) {
        return Response.json({ error: "Paste storage is not configured" }, { status: 503, headers: corsHeaders });
      }
      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > MAX_CONTENT_LENGTH + 1000) {
        return Response.json({ error: "Paste is too large" }, { status: 413, headers: corsHeaders });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Request body must be valid JSON" }, { status: 400, headers: corsHeaders });
      }
      const title = typeof body.title === "string" ? body.title.slice(0, 80) : "Untitled paste";
      const content = typeof body.content === "string" ? body.content : "";
      if (!content.trim()) {
        return Response.json({ error: "Paste content cannot be empty" }, { status: 400, headers: corsHeaders });
      }
      if (new TextEncoder().encode(content).byteLength > MAX_CONTENT_LENGTH) {
        return Response.json({ error: "Paste is too large" }, { status: 413, headers: corsHeaders });
      }

      const id = await createUniqueId(env.PASTES);
      const paste = {
        title,
        content,
        createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
      };
      await env.PASTES.put(id, JSON.stringify(paste), { expirationTtl: EXPIRATION_SECONDS });
      return Response.json({ id }, { status: 201, headers: corsHeaders });
    }

    const match = url.pathname.match(/^\/paste\/([A-Za-z0-9]{10})$/);
    if (request.method === "GET" && match) {
      if (!env.PASTES) {
        return Response.json({ error: "Paste storage is not configured" }, { status: 503, headers: corsHeaders });
      }
      const value = await env.PASTES.get(match[1]);
      if (!value) return Response.json({ error: "Paste not found or expired" }, { status: 404, headers: corsHeaders });
      return Response.json(JSON.parse(value), { headers: corsHeaders });
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  },
};

async function createUniqueId(kv) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const random = new Uint8Array(10);
    crypto.getRandomValues(random);
    let id = "";
    for (const byte of random) id += ID_ALPHABET[byte % ID_ALPHABET.length];
    if (!(await kv.get(id))) return id;
  }
  throw new Error("Could not allocate a unique paste ID");
}
