import * as THREE from "three";

function hash3(x: number, y: number, z: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1103515245) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x: number, y: number, z: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, s);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x: number, y: number, z: number, s: number, oct = 5) {
  let t = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { t += a * noise3(x * f, y * f, z * f, s + i); f *= 2.03; a *= 0.5; }
  return t;
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));

/** Seamless procedural equirectangular planet texture, no image downloads needed. */
export function planetTexture(kind: "mars" | "earth", W = 512, H = 256) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    const lat = (py / H - 0.5) * Math.PI;
    for (let px = 0; px < W; px++) {
      const lon = (px / W) * Math.PI * 2;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      const n = fbm(x * 3, y * 3, z * 3, 3);
      let c: number[];
      if (kind === "mars") {
        c = mix([105, 40, 20], [222, 128, 70], n * 1.4 - 0.15);
        const maria = fbm(x * 1.4 + 9, y * 1.4, z * 1.4, 21, 4);
        c = mix(c, [64, 28, 20], (maria - 0.52) * 4);
        const dust = fbm(x * 9, y * 9, z * 9, 40, 3);
        c = mix(c, [236, 160, 100], (dust - 0.6) * 1.5);
        c = mix(c, [245, 238, 232], (Math.abs(lat) - 1.38) * 14);
      } else {
        const land = n > 0.53;
        if (land) {
          c = mix([46, 112, 62], [158, 138, 86], (n - 0.53) * 7);
        } else {
          c = mix([8, 32, 92], [28, 98, 178], (n - 0.2) * 3);
        }
        const cloud = fbm(x * 4 + 5, y * 4, z * 4 + 2, 77, 4);
        c = mix(c, [255, 255, 255], (cloud - 0.55) * 4);
        c = mix(c, [240, 246, 250], (Math.abs(lat) - 1.25) * 12);
      }
      const i = (py * W + px) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
