# Pastebin Pages

A static GitHub Pages pastebin with two sharing modes:

- **Compressed link:** The paste is compressed in the browser and encoded in the URL. No paste backend is used, but the resulting URL can still be long.
- **Short ID link:** The paste is stored in Cloudflare Workers KV and shared using a 10-character ID. Pastes expire after 30 days.

## Short-ID backend setup

GitHub Pages and Jekyll are static hosting/build tools; GitHub Actions deploys the site but does not provide a database or API. The short-ID feature therefore uses a small Cloudflare Worker API with Workers KV storage. The website continues to be hosted on GitHub Pages.

### 1. Create a KV namespace

Install Wrangler, authenticate with Cloudflare, then from the repository root run:

```sh
npx wrangler login
npx wrangler kv namespace create PASTES
```

Copy the returned namespace ID into `worker/wrangler.toml`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`.

### 2. Configure and deploy the Worker

Set `ALLOWED_ORIGIN` to the exact origin serving the Pages site. For a project site, it will usually look like `https://ritvikrao773.github.io` (no trailing slash; the repository path is not part of the origin).

```sh
cd worker
npx wrangler secret put ALLOWED_ORIGIN
```

When prompted, enter the allowed site origin. Then deploy:

```sh
npx wrangler deploy
```

Copy the deployed Worker URL (for example, `https://pastebin-pages-api.<account>.workers.dev`).

### 3. Connect the website

Edit `config.js` and set:

```js
window.PASTEBIN_API_URL = "https://pastebin-pages-api.<account>.workers.dev";
```

Commit the change. GitHub Pages will deploy the front end; the Worker is deployed separately with Wrangler. Once both are deployed, **Create short ID link** stores the paste and gives a URL ending in `?id=...`.

## Limits and privacy

- Short-ID pastes are readable by anyone who has the link and are stored for 30 days.
- Compression and short IDs are not encryption. Do not store passwords, API keys, private keys, or confidential content.
- The Worker rejects cross-origin requests except from the configured site origin and limits paste payloads to 100 KB.
- The 10-character ID makes links compact, but this is public, unlisted sharing—not access control.
- The short-ID button will report that setup is missing until `config.js`, the Worker, and KV namespace are configured.
- GitHub Pages still supports compressed links without the Worker.

## Local drafts

Unshared drafts are saved in the current browser's local storage and do not sync across devices.
