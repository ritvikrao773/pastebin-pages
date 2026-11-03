const STORAGE_KEY = "pastebin-pages-draft-v1";
const MAX_URL_LENGTH = 8000;
const HAMR_VERSION = "e1241f25f3e193b070acc0485288961ec11ce34f";
const HAMR_CDN = `https://cdn.jsdelivr.net/gh/p2r3/ha.mr@${HAMR_VERSION}/docs/`;
const PASTEBIN_API_URL = (window.PASTEBIN_API_URL || "").replace(/\/$/, "");
let hamrModulesPromise;

const titleInput = document.getElementById("titleInput");
const pasteInput = document.getElementById("pasteInput");
const charCounter = document.getElementById("charCounter");
const createBtn = document.getElementById("createBtn");
const shortIdBtn = document.getElementById("shortIdBtn");
const hamrBtn = document.getElementById("hamrBtn");
const copyBtn = document.getElementById("copyBtn");
const copyRawBtn = document.getElementById("copyRawBtn");
const newPasteBtn = document.getElementById("newPasteBtn");
const shareBox = document.getElementById("shareBox");
const shareLink = document.getElementById("shareLink");
const openPasteBtn = document.getElementById("openPasteBtn");
const statusMessage = document.getElementById("statusMessage");

function updateCounter() {
  charCounter.textContent = pasteInput.value.length.toLocaleString();
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function persistDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: titleInput.value, content: pasteInput.value }));
  } catch (error) {
    console.warn("Unable to save draft in this browser.", error);
  }
}

function loadDraft() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === "object") {
      titleInput.value = typeof parsed.title === "string" ? parsed.title : "";
      pasteInput.value = typeof parsed.content === "string" ? parsed.content : "";
    }
  } catch (error) {
    console.warn("Unable to restore draft.", error);
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Invalid encoded data");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encodePayload(payload) {
  const input = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === "function") {
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return `z1.${bytesToBase64Url(compressed)}`;
  }
  return `p1.${bytesToBase64Url(input)}`;
}

async function decodePayload(encoded) {
  const separator = encoded.indexOf(".");
  if (separator < 0) return new TextDecoder("utf-8", { fatal: true }).decode(base64UrlToBytes(encoded));
  const format = encoded.slice(0, separator);
  const bytes = base64UrlToBytes(encoded.slice(separator + 1));
  if (format === "z1") {
    if (typeof DecompressionStream !== "function") throw new Error("This browser cannot decompress this paste.");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }
  if (format === "p1") return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  throw new Error("Unsupported paste format");
}

function createPayload() {
  const content = pasteInput.value;
  if (!content.trim()) {
    setStatus("Paste content cannot be empty.");
    pasteInput.focus();
    return null;
  }
  return { v: 1, title: titleInput.value.trim() || "Untitled paste", content, createdAt: new Date().toISOString() };
}

async function makeCompressedUrl(payload) {
  const encoded = await encodePayload(payload);
  return `${window.location.origin}${window.location.pathname}#${encoded}`;
}

function makeShortUrl(id) {
  return `${window.location.origin}${window.location.pathname}#${id}`;
}

function showShareUrl(url) {
  shareLink.value = url;
  shareBox.classList.remove("hidden");
}

async function createPaste() {
  const payload = createPayload();
  if (!payload) return;
  createBtn.disabled = true;
  createBtn.textContent = "Compressing…";
  setStatus("");
  try {
    const url = await makeCompressedUrl(payload);
    if (url.length > MAX_URL_LENGTH) {
      setStatus("This paste is too large for a reliable share URL after gzip compression.");
      return;
    }
    history.replaceState(null, "", url);
    showShareUrl(url);
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* storage may be disabled */ }
    setStatus(`Compressed link: ${url.length.toLocaleString()} characters.`);
    copyBtn.textContent = "Copy link";
  } catch (error) {
    console.error(error);
    setStatus("Could not compress this paste in your browser.");
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = "Create compressed link";
  }
}

async function createShortIdLink() {
  const payload = createPayload();
  if (!payload) return;
  if (!PASTEBIN_API_URL) {
    setStatus("Short links are not configured yet. Use Create compressed link instead.");
    return;
  }
  shortIdBtn.disabled = true;
  shortIdBtn.textContent = "Creating…";
  setStatus("Creating short link…");
  try {
    const response = await fetch(`${PASTEBIN_API_URL}/paste`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`API returned ${response.status}: ${await response.text()}`);
    const data = await response.json();
    if (!data || !/^[A-Za-z0-9]{10}$/.test(data.id)) throw new Error("Invalid paste ID returned by API.");
    const url = makeShortUrl(data.id);
    history.replaceState(null, "", url);
    showShareUrl(url);
    copyBtn.textContent = "Copy link";
    setStatus("Short link created. Pastes expire after 30 days.");
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* storage may be disabled */ }
  } catch (error) {
    console.error("Short-link creation failed.", error);
    setStatus("Could not create a short link. Check that the paste API and KV storage are deployed.");
  } finally {
    shortIdBtn.disabled = false;
    shortIdBtn.textContent = "Create short ID link";
  }
}

async function loadPasteByShortId(id) {
  if (!PASTEBIN_API_URL) return false;
  try {
    const response = await fetch(`${PASTEBIN_API_URL}/paste/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return false;
    const payload = await response.json();
    if (!payload || typeof payload.content !== "string") return false;
    titleInput.value = typeof payload.title === "string" ? payload.title : "Untitled paste";
    pasteInput.value = payload.content;
    updateCounter();
    showShareUrl(window.location.href);
    return true;
  } catch (error) {
    console.warn("Unable to load paste by short ID.", error);
    return false;
  }
}

async function loadHamrModules() {
  if (!hamrModulesPromise) {
    hamrModulesPromise = Promise.all([
      import(`${HAMR_CDN}compress.js`),
      import(`${HAMR_CDN}alphabets.js`),
    ]).then(([codec, alphabets]) => ({ compress: codec.compress, alphabet: alphabets.outputAlphabetASCII }));
  }
  return hamrModulesPromise;
}

async function createHamrLink() {
  const payload = createPayload();
  if (!payload) return;
  hamrBtn.disabled = true;
  hamrBtn.textContent = "Trying ha.mr…";
  setStatus("Loading the pinned ha.mr compressor…");
  try {
    const normalUrl = await makeCompressedUrl(payload);
    const { compress, alphabet } = await loadHamrModules();
    const hamrUrl = `https://ha.mr#${compress(normalUrl, alphabet)}`;
    const chosenUrl = hamrUrl.length < normalUrl.length ? hamrUrl : normalUrl;
    showShareUrl(chosenUrl);
    copyBtn.textContent = "Copy link";
    setStatus(chosenUrl === hamrUrl
      ? `ha.mr shortened the link from ${normalUrl.length.toLocaleString()} to ${hamrUrl.length.toLocaleString()} characters.`
      : `The compressed link is shorter than the ha.mr link (${normalUrl.length.toLocaleString()} characters).`);
  } catch (error) {
    console.error("ha.mr compression failed.", error);
    setStatus("Could not load ha.mr compression. Check your connection and try again.");
  } finally {
    hamrBtn.disabled = false;
    hamrBtn.textContent = "Try ha.mr compression";
  }
}

async function loadPasteFromUrl() {
  const encoded = window.location.hash.slice(1);
  if (!encoded) return false;
  if (encoded.startsWith("z1.") || encoded.startsWith("p1.")) {
    try {
      const payload = JSON.parse(await decodePayload(encoded));
      if (!payload || payload.v !== 1 || typeof payload.content !== "string") throw new Error("Unsupported paste format");
      titleInput.value = typeof payload.title === "string" ? payload.title : "Untitled paste";
      pasteInput.value = payload.content;
      updateCounter();
      showShareUrl(window.location.href);
      return true;
    } catch (error) {
      console.warn("Unable to decode paste URL.", error);
      setStatus("This compressed paste link is invalid or unsupported by this browser.");
      return false;
    }
  }
  if (/^[A-Za-z0-9]{10}$/.test(encoded)) {
    if (await loadPasteByShortId(encoded)) return true;
    setStatus("This short link is invalid, expired, or its API is unavailable.");
    return false;
  }
  // Retain support for legacy unprefixed base64 payloads.
  try {
    const payload = JSON.parse(await decodePayload(encoded));
    if (!payload || typeof payload.content !== "string") throw new Error("Invalid legacy payload");
    titleInput.value = typeof payload.title === "string" ? payload.title : "Untitled paste";
    pasteInput.value = payload.content;
    updateCounter();
    showShareUrl(window.location.href);
    return true;
  } catch (error) {
    setStatus("This paste link is invalid or cannot be decoded by this browser.");
    return false;
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (error) {
    const temporary = document.createElement("textarea");
    temporary.value = value;
    temporary.setAttribute("readonly", "");
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.appendChild(temporary);
    temporary.select();
    const copied = document.execCommand("copy");
    temporary.remove();
    if (!copied) throw new Error("Clipboard copy failed");
  }
}

async function copyWithFeedback(button, value, label) {
  if (!value) {
    setStatus("There is nothing to copy yet.");
    return;
  }
  try {
    await copyText(value);
    button.textContent = "Copied!";
  } catch (error) {
    button.textContent = "Copy failed";
    console.warn(error);
  }
  window.setTimeout(() => { button.textContent = label; }, 1400);
}

function resetForm() {
  titleInput.value = "";
  pasteInput.value = "";
  updateCounter();
  shareBox.classList.add("hidden");
  shareLink.value = "";
  setStatus("");
  history.replaceState(null, "", window.location.pathname);
  try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* storage may be disabled */ }
  pasteInput.focus();
}

loadDraft();
loadPasteFromUrl().then((loaded) => { if (!loaded) updateCounter(); });
titleInput.addEventListener("input", persistDraft);
pasteInput.addEventListener("input", () => { updateCounter(); persistDraft(); });
createBtn.addEventListener("click", createPaste);
shortIdBtn.addEventListener("click", createShortIdLink);
hamrBtn.addEventListener("click", createHamrLink);
copyBtn.addEventListener("click", () => copyWithFeedback(copyBtn, shareLink.value || window.location.href, "Copy link"));
copyRawBtn.addEventListener("click", () => copyWithFeedback(copyRawBtn, pasteInput.value, "Copy raw text"));
newPasteBtn.addEventListener("click", resetForm);
openPasteBtn.addEventListener("click", () => {
  if (shareLink.value) window.open(shareLink.value, "_blank", "noopener,noreferrer");
});
