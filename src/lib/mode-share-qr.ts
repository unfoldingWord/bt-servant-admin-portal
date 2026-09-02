// QR rendering helpers for the mode share panel (#311).
//
// `uqr` does the encoding (a port of nayuki's reference implementation:
// zero dependencies, no canvas, runs anywhere). Rendering is ours so the
// on-screen SVG is real React markup — no `innerHTML` — and the downloaded
// file is byte-identical to what was shown.

import { encode } from "uqr";

export interface QrMatrix {
  /** Modules per side, excluding the quiet zone. */
  size: number;
  /** `true` = dark module. Row-major, `size` × `size`. */
  modules: boolean[][];
}

/**
 * Encode `text` at error-correction level M. M (15% recoverable) is the
 * usual choice for a printed code that will be photographed off paper or a
 * phone screen; L would give a smaller symbol but less tolerance for the
 * glare and folds a shared sticker picks up.
 */
export function buildQrMatrix(text: string): QrMatrix {
  const result = encode(text, { ecc: "M", border: 0 });
  return { size: result.size, modules: result.data };
}

/** Quiet zone the spec asks for: four modules on every side. */
export const QR_QUIET_ZONE = 4;

/**
 * One SVG path covering every dark module, in module units, offset by the
 * quiet zone. One path (not one rect per module) keeps a version-5 symbol
 * to a few hundred bytes of DOM.
 */
export function qrPathData(
  matrix: QrMatrix,
  quietZone: number = QR_QUIET_ZONE
): string {
  if (matrix.modules.length !== matrix.size) {
    throw new Error("QR matrix row count does not match its size");
  }
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    const row = matrix.modules[y];
    if (!row || row.length !== matrix.size) {
      // A short row would silently emit a symbol that scans to nothing.
      throw new Error(`QR matrix row ${y} does not match its size`);
    }
    for (let x = 0; x < matrix.size; x++) {
      if (row[x]) {
        parts.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
      }
    }
  }
  return parts.join("");
}

/** Side length of the symbol including its quiet zone, in modules. */
export function qrViewBoxSize(
  matrix: QrMatrix,
  quietZone: number = QR_QUIET_ZONE
): number {
  return matrix.size + quietZone * 2;
}

export interface QrSvgOptions {
  /** Rendered side in CSS px (the SVG is scalable; this sets the default). */
  sizePx?: number;
  dark?: string;
  light?: string;
  /** Accessible name; emitted as `<title>` so the file is self-describing. */
  title?: string;
}

/**
 * Standalone SVG document for download. Plain black on white regardless of
 * the portal theme: a printed or shared code has to scan on paper.
 */
export function buildQrSvg(
  matrix: QrMatrix,
  options: QrSvgOptions = {}
): string {
  const { sizePx = 1024, dark = "#000000", light = "#ffffff", title } = options;
  const box = qrViewBoxSize(matrix);
  const titleEl = title ? `<title>${escapeXml(title)}</title>` : "";
  // Every string input is escaped, colours included — callers pass
  // literals today, but this is a public lib helper.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" ` +
    `width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">` +
    titleEl +
    `<rect width="${box}" height="${box}" fill="${escapeXml(light)}"/>` +
    `<path d="${qrPathData(matrix)}" fill="${escapeXml(dark)}"/>` +
    `</svg>`
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
