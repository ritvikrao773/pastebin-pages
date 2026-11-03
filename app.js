const STORAGE_KEY = "pastebin-pages-draft-v1";
const MAX_URL_LENGTH = 8000;
const HAMR_VERSION = "e1241f25f3e193b070acc0485288961ec11ce34f";
const HAMR_CDN = `https://cdn.jsdelivr.net/gh/p2r3/ha.mr@${HAMR_VERSION}/docs/`;
let hamrModulesPromise;

const titleInput = document.getElementById("titleInput");
const pasteInput = document.getElementById("pasteInput");
const charCounter = document.getElementById("charCounter");
const createBtn = document.getElementById("createBtn");
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

async function makeNormalPasteUrl(payload) {
  const encoded = await encodePayload(payload);
  return `${window.location.origin}${window.location.pathname}#${encoded}`;
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
    const url = await makeNormalPasteUrl(payload);
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
    setStatus("Could not compress this paste in your browser.");
    console.error(error);
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = "Create compressed link";
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
  setStatus("Loading the pinned ha.mr compressor and testing link size…");
  try {
    const normalUrl = await makeNormalPasteUrl(payload);
    const { compress, alphabet } = await loadHamrModules();
    const hamrUrl = `https://ha.mr#${compress(normalUrl, alphabet)}`;
    const chosenUrl = hamrUrl.length < normalUrl.length ? hamrUrl : normalUrl;

    showShareUrl(chosenUrl);
    copyBtn.textContent = "Copy link";
    if (chosenUrl === hamrUrl) {
      setStatus(`ha.mr made it shorter: ${normalUrl.length.toLocaleString()} → ${hamrUrl.length.toLocaleString()} characters. Opening it may show ha.mr’s redirect confirmation.`);
    } else {
      setStatus(`Tried ha.mr: its link was ${hamrUrl.length.toLocaleString()} characters; the normal link is shorter at ${normalUrl.length.toLocaleString()}. Showing the shorter link.`);
    }
  } catch (error) {
    setStatus("Could not load or run ha.mr’s browser compressor. Check your connection and try again.");
    console.error("ha.mr compression failed.", error);
  } finally {
    hamrBtn.disabled = false;
    hamrBtn.textContent = "Try ha.mr compression";
  }
}

async function loadPasteFromUrl() {
  const encoded = window.location.hash.slice(1);
  if (!encoded) return false;
  try {
    const payload = JSON.parse(await decodePayload(encoded));
    if (!payload || payload.v !== 1 || typeof payload.content !== "string") throw new Error("Unsupported paste format");
    titleInput.value = typeof payload.title === "string" ? payload.title : "Untitled paste";
    pasteInput.value = payload.content;
    updateCounter();
    showShareUrl(window.location.href);
    return true;
  } catch (error) {
    // A ha.mr link decodes to this page with the original paste hash, so paste loading is local.
    setStatus("This paste link is invalid or cannot be decoded by this browser.");
    console.warn("Unable to load paste from URL.", error);
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
hamrBtn.addEventListener("click", createHamrLink);
copyBtn.addEventListener("click", () => copyWithFeedback(copyBtn, shareLink.value || window.location.href, "Copy link"));
copyRawBtn.addEventListener("click", () => copyWithFeedback(copyRawBtn, pasteInput.value, "Copy raw text"));
newPasteBtn.addEventListener("click", resetForm);
openPasteBtn.addEventListener("click", () => { if (shareLink.value) window.open(shareLink.value, "_blank", "noopener,noreferrer"); });
