/**
 * Browser fingerprinting utility.
 * Generates a persistent random identifier for this browser profile.
 * Hardware fingerprinting is used only as a fallback when secure randomness
 * is unavailable, avoiding collisions between similar phones.
 */

async function getCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    // Draw text with specific styling — rendering differs per device/GPU
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("NIMechE browser ID", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("NIMechE browser ID", 4, 17);

    return canvas.toDataURL();
  } catch {
    return "";
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl || !(gl instanceof WebGLRenderingContext)) return "";

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return "";

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
    return `${vendor}~${renderer}`;
  } catch {
    return "";
  }
}

function getDeviceSignals(): string {
  const signals = [
    screen.width,
    screen.height,
    screen.colorDepth,
    navigator.language,
    navigator.languages?.join(",") ?? "",
    navigator.hardwareConcurrency ?? 0,
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0,
    new Date().getTimezoneOffset(),
    navigator.platform ?? "",
    navigator.maxTouchPoints ?? 0,
    // Screen orientation if available
    screen.orientation?.type ?? "",
  ];
  return signals.join("|");
}

/**
 * Simple but effective hash function (FNV-1a variant).
 * Produces a hex string from an arbitrary input string.
 */
function hashString(str: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, keep as uint32
  }
  // Run a second pass for better distribution
  const hash2 = hash;
  for (let i = str.length - 1; i >= 0; i--) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash2.toString(16).padStart(8, "0") + hash.toString(16).padStart(8, "0");
}

/**
 * Generate a stable device fingerprint.
 * Combines canvas rendering, WebGL info, and device signals into a single hash.
 * Returns a 16-char hex string.
 */
export async function generateFingerprint(): Promise<string> {
  const storageKey = "voting_device_fingerprint_v1";
  try {
    const cached = window.localStorage.getItem(storageKey);
    if (cached && /^[a-f0-9]{16,64}$/i.test(cached)) return cached;
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }

  let fingerprint = "";
  try {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    fingerprint = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    const [canvasData, webglData, deviceData] = await Promise.all([
      getCanvasFingerprint(),
      Promise.resolve(getWebGLFingerprint()),
      Promise.resolve(getDeviceSignals()),
    ]);
    fingerprint = hashString(`${Date.now()}|${Math.random()}|${canvasData}||${webglData}||${deviceData}`);
  }
  try {
    window.localStorage.setItem(storageKey, fingerprint);
  } catch {
    // Fingerprint still works for this session even if it cannot be cached.
  }
  return fingerprint;
}
