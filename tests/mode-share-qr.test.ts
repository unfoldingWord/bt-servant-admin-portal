import { describe, expect, it } from "vitest";

import {
  QR_QUIET_ZONE,
  buildQrMatrix,
  buildQrSvg,
  qrPathData,
  qrViewBoxSize,
} from "../src/lib/mode-share-qr";

// #311 — the QR renderer. Encoding is uqr's; what is pinned here is OUR
// rendering: the path geometry, the quiet zone, and that the downloadable
// SVG is a self-contained, plain black-on-white document.

describe("buildQrMatrix", () => {
  it("encodes a wa.me link into a square module grid with finder patterns", () => {
    const m = buildQrMatrix("https://wa.me/573001234567?text=%23fia-mode");
    expect(m.size).toBeGreaterThan(20);
    expect(m.modules).toHaveLength(m.size);
    for (const row of m.modules) expect(row).toHaveLength(m.size);
    // Top-left finder: the outer ring of the 7x7 pattern is dark.
    for (let i = 0; i < 7; i++) {
      expect(m.modules[0]![i]).toBe(true);
      expect(m.modules[i]![0]).toBe(true);
    }
    // ...and the ring just inside it is light.
    expect(m.modules[1]![1]).toBe(false);
  });

  it("is deterministic for the same input", () => {
    const a = buildQrMatrix("https://wa.me/15550100100?text=%23x");
    const b = buildQrMatrix("https://wa.me/15550100100?text=%23x");
    expect(a).toEqual(b);
  });
});

describe("qrPathData", () => {
  const tiny = {
    size: 2,
    modules: [
      [true, false],
      [false, true],
    ],
  };

  it("emits one unit square per dark module, offset by the quiet zone", () => {
    expect(qrPathData(tiny, 0)).toBe("M0 0h1v1h-1zM1 1h1v1h-1z");
    expect(qrPathData(tiny)).toBe(
      `M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h1v1h-1zM${QR_QUIET_ZONE + 1} ${QR_QUIET_ZONE + 1}h1v1h-1z`
    );
  });

  it("sizes the view box to the symbol plus the quiet zone on both sides", () => {
    expect(qrViewBoxSize(tiny)).toBe(2 + QR_QUIET_ZONE * 2);
    expect(qrViewBoxSize(tiny, 0)).toBe(2);
  });
});

describe("buildQrSvg", () => {
  const tiny = { size: 1, modules: [[true]] };

  it("is a standalone black-on-white SVG document", () => {
    const svg = buildQrSvg(tiny, { sizePx: 256 });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
      true
    );
    expect(svg).toContain('viewBox="0 0 9 9"');
    expect(svg).toContain('width="256" height="256"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('<path d="M4 4h1v1h-1z" fill="#000000"/>');
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("escapes the title so a mode label cannot break the document", () => {
    const svg = buildQrSvg(tiny, { title: 'Kids <"&"> Mode' });
    expect(svg).toContain("<title>Kids &lt;&quot;&amp;&quot;&gt; Mode</title>");
  });
});
