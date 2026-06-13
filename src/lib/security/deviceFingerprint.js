/**
 * Client Device Fingerprinting Utility
 *
 * Generates a stateless, consistent browser device fingerprint by hashing
 * a composite of stable browser/environment properties.
 *
 * This is NOT a tracking cookie — it is a transient signal sent with each
 * login payload so the server can bind rate-limit state to a specific device.
 *
 * Properties collected:
 *   - User agent (browser + OS family)
 *   - Language + timezone
 *   - Screen resolution + color depth
 *   - Hardware concurrency (CPU cores)
 *   - Platform
 *   - Canvas/WebGL renderer hash (GPU fingerprint)
 *   - Max touch points, device pixel ratio
 *
 * NOTE: This fingerprint is deliberately coarse. It does not use invasive
 * techniques (e.g., full font enumeration, battery API). It aims for
 * "good enough" device distinctiveness without violating privacy.
 */

/** Canvas renderer hash — varies by OS font stack + GPU pipeline */
function getCanvasHash() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";

    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial', sans-serif";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 200, 50);
    ctx.fillStyle = "#069";
    ctx.fillText("CSTA-fp:\u{1D11E}→€", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("DeviceSig:∑∏∂", 4, 30);

    return canvas.toDataURL("image/jpeg", 0.3);
  } catch (_e) {
    return "canvas-blocked";
  }
}

/** WebGL renderer hash — GPU vendor + renderer string */
function getWebGLHash() {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!gl) return "no-webgl";

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return "no-debug";

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return `${vendor}::${renderer}`;
  } catch (_e) {
    return "webgl-blocked";
  }
}

/** Build the raw fingerprint string from all collected signals */
function buildRawFingerprint() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(navigator.hardwareConcurrency || 0),
    navigator.platform,
    getCanvasHash(),
    getWebGLHash(),
    String(navigator.maxTouchPoints || 0),
    window.devicePixelRatio?.toFixed(2) || "1.0",
  ];

  return parts.join("|||");
}

/** Lightweight djb2 hash → returns a stable hex string */
function djb2Hex(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  // Convert to unsigned 32-bit hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Generate a consistent device fingerprint.
 * Returns a hex string that uniquely identifies this browser/device combo.
 * Safe to call repeatedly — it's stateless and deterministic.
 */
export function getDeviceFingerprint() {
  const raw = buildRawFingerprint();
  return djb2Hex(raw);
}

/**
 * Synchronous check: is this a fresh fingerprint context?
 * Useful for detecting if localStorage was cleared (possible tamper signal).
 */
export function isFingerprintConsistent() {
  const STORAGE_KEY = "csta_device_sig";
  try {
    const sig = getDeviceFingerprint();
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === sig) return true;
    localStorage.setItem(STORAGE_KEY, sig);
    return stored === null; // First visit = consistent
  } catch (_e) {
    return true;
  }
}
