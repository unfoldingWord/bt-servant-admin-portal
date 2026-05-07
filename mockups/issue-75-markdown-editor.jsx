/**
 * MOCKUP — Issue #75 (Markdown editor + TOC) under epic #72.
 *
 * Design direction: "Outline-as-Index-Page".
 * The right rail is an emergent index of the document being written, drawn
 * alongside it — not a sidebar nav. Editorial restraint, typographic care,
 * one load-bearing visual idea: the spine rail.
 *
 * Four moves that take this from sketch to designed:
 *   1. Spine rail — vertical line on the TOC; H2s tick on it; H3s hang from
 *      their parent's tick on a short subordinate rail.
 *   2. Roman numerals + serif on TOC entries — the editorial signal.
 *   3. Active-section pin — single coral dot on the spine, scaled + ring,
 *      tracks the cursor's heading. The only chromatic accent.
 *   4. Paper-feel editor surface — warm off-white in light, ink-blue in dark,
 *      generous margin, no focus ring, mono with leading-[1.7].
 *
 * Comment syntax in sample content uses the canonical Ulysses convention:
 *   %% block/paragraph (paragraph-terminated)
 *   ++ inline span ++ (paired)
 *
 * Standalone: injects fonts + design tokens on mount. Drop into cowork.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// NOTE: this mockup uses Lucide icons for cowork renderability. The production
// lift to src/components/ uses Font Awesome Pro Light/Solid pairs to match the
// rest of the admin portal (see src/components/activity-bar-item.tsx,
// src/components/theme-toggle.tsx). The icon-swap-on-active pattern in
// production is FA Pro Light → Solid; in this mockup it's stroke-width contrast
// (1.5 → 2.5) since Lucide is single-stroke.
import {
  ChevronDown,
  FileText,
  Languages,
  MessagesSquare,
  Moon,
  Send,
  Sun,
} from "lucide-react";

const SAMPLE_CONTENT = `# Spoken Mode

%% Comment paragraph: this whole paragraph is editor-only and stripped before the model sees it.
%% You can add multiple lines like this until the next blank line.

This is a real instruction the model will receive.

## Language Tone

Speak with care, clarity, and the cadence of someone who has read the room. ++don't soften this past "the room"++

## Methodology

Follow the framework below.

### Phase 1: Discover

Listen first. Take notes.

### Phase 2: Synthesize

Pull the threads together.

## Examples

Here is what a markdown heading looks like inside a fenced code block:

\`\`\`
## not a heading
### also not a heading
\`\`\`

End of examples.

## Closing

Always close gracefully. ++Tim wants this softer — confirm++
`;

// ─── Tokens ──────────────────────────────────────────────────────────────────
// Injected once on mount so the mockup is self-contained. In production these
// move to globals.css under :root / .dark, and Tailwind tokens follow.

const TOKENS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

:root {
  /* Single UI font (Outfit) for everything but the editor textarea. Matches
     the project's index.html and globals.css. No serif, no italic — Outfit
     italics aren't loaded in production, so weight + size + structure carry
     the hierarchy. */
  --font-ui: 'Outfit', system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;

  /* Production tokens — copied from src/app/globals.css for mockup parity.
     The mockup standalones, but uses the same names so the lift to src/ is
     a straight token swap. */
  --background:          oklch(1 0 0);
  --foreground:          oklch(0.318 0 0);
  --card:                oklch(0.98 0 0);
  --card-foreground:     oklch(0.318 0 0);
  --primary:             oklch(0.475 0.157 248);
  --primary-foreground:  oklch(1 0 0);
  --muted-foreground:    oklch(0.467 0 0);
  --accent:              oklch(0.918 0 0);
  --accent-foreground:   oklch(0.318 0 0);
  --border:              oklch(0.918 0 0);

  /* Editor-specific tokens — justified deviations for the editorial aesthetic.
     Surface and ink stay distinct from the chrome (which uses --card / --background). */
  --editor-paper:        oklch(0.985 0.005 85);
  --editor-margin:       oklch(0.96 0.01 85);
  --editor-ink:          oklch(0.22 0.02 250);
  --editor-ink-soft:     oklch(0.22 0.02 250 / 0.55);
  --editor-ink-fade:     oklch(0.22 0.02 250 / 0.30);
  --editor-spine-soft:   oklch(0.475 0.157 248 / 0.18);
  --editor-active:       oklch(0.55 0.20 35);
  --editor-active-soft:  oklch(0.55 0.20 35 / 0.20);
  --editor-active-pulse: oklch(0.55 0.20 35 / 0.16);
}

.mockup-dark {
  --background:          oklch(0.211 0.01 248);
  --foreground:          oklch(0.827 0 0);
  --card:                oklch(0.176 0.012 248);
  --card-foreground:     oklch(0.827 0 0);
  --primary:             oklch(0.541 0.168 248);
  --primary-foreground:  oklch(1 0 0);
  --muted-foreground:    oklch(0.682 0 0);
  --accent:              oklch(0.249 0.01 248);
  --accent-foreground:   oklch(1 0 0);
  --border:              oklch(0.249 0.01 248);

  --editor-paper:        oklch(0.20 0.015 250);
  --editor-margin:       oklch(0.23 0.02 250);
  --editor-ink:          oklch(0.92 0.01 85);
  --editor-ink-soft:     oklch(0.92 0.01 85 / 0.55);
  --editor-ink-fade:     oklch(0.92 0.01 85 / 0.30);
  --editor-spine-soft:   oklch(0.541 0.168 248 / 0.20);
  --editor-active:       oklch(0.72 0.18 35);
  --editor-active-soft:  oklch(0.72 0.18 35 / 0.22);
  --editor-active-pulse: oklch(0.72 0.18 35 / 0.18);
}

@keyframes mockupPulse {
  0%   { opacity: 0; }
  18%  { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes mockupFadeUp {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Hide native textarea selection-on-focus glow — paper has no focus ring. */
.mockup-editor:focus { outline: none; }

/* Make the textarea selection use the primary tint instead of system blue. */
.mockup-editor::selection {
  background: color-mix(in oklch, var(--primary), transparent 70%);
}
`;

function useStyleInjection() {
  useEffect(() => {
    const id = "markdown-editor-mockup-tokens";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = TOKENS_CSS;
    document.head.appendChild(el);
  }, []);
}

// ─── Roman numerals ──────────────────────────────────────────────────────────

function toRoman(n) {
  const map = [
    ["XL", 40],
    ["X", 10],
    ["IX", 9],
    ["V", 5],
    ["IV", 4],
    ["I", 1],
  ];
  let out = "";
  let v = n;
  for (const [s, val] of map) {
    while (v >= val) {
      out += s;
      v -= val;
    }
  }
  return out || "—";
}

// ─── Tweened scroll ──────────────────────────────────────────────────────────
// cubic-bezier(0.22, 0.61, 0.36, 1) approximated as cubicOut.

function smoothScrollTo(el, targetTop, duration = 340) {
  const start = el.scrollTop;
  const delta = targetTop - start;
  if (Math.abs(delta) < 1) return Promise.resolve();
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  return new Promise((resolve) => {
    function step(now) {
      const t = Math.min(1, (now - t0) / duration);
      el.scrollTop = start + delta * ease(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// ─── Heading parser ──────────────────────────────────────────────────────────
// Mirrors src/lib/markdown-headings.ts. Paragraph-terminated %% (Ulysses),
// paired ++…++, fence-aware. H1 is excluded (reserved for doc title).

function parseHeadings(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let inFence = false;
  let inSpan = false;
  let inCommentParagraph = false;
  let atParagraphStart = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      inCommentParagraph = false;
      atParagraphStart = true;
      continue;
    }

    if (atParagraphStart && !inSpan && line.startsWith("%%")) {
      inCommentParagraph = true;
    }
    atParagraphStart = false;

    if (!inSpan && /^(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (!inSpan && !inCommentParagraph) {
      const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
      if (m && m[2]) {
        const text = m[2]
          .replace(/\+\+[\s\S]*?\+\+/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (text) {
          out.push({
            level: m[1].length,
            text,
            line: i,
            slug: `h-${i}-${text
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")}`,
          });
        }
      }
    }

    if (!inCommentParagraph) {
      const plus = (line.match(/\+\+/g) || []).length;
      if (plus % 2 === 1) inSpan = !inSpan;
    }
  }

  return out;
}

function groupHeadings(flat) {
  const tree = [];
  for (const h of flat) {
    if (h.level === 2) tree.push({ ...h, children: [] });
    else if (h.level === 3 && tree.length > 0)
      tree[tree.length - 1].children.push(h);
  }
  return tree;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useDebounced(value, delay) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function useActiveHeadingLine(textareaRef, value, headings) {
  const [activeLine, setActiveLine] = useState(-1);
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    function update() {
      const pos = ta.selectionStart;
      let line = 0;
      for (let i = 0; i < pos; i++) if (value.charCodeAt(i) === 10) line++;
      let active = -1;
      for (const h of headings) {
        if (h.line <= line) active = h.line;
        else break;
      }
      setActiveLine(active);
    }
    update();
    ta.addEventListener("keyup", update);
    ta.addEventListener("click", update);
    ta.addEventListener("focus", update);
    return () => {
      ta.removeEventListener("keyup", update);
      ta.removeEventListener("click", update);
      ta.removeEventListener("focus", update);
    };
  }, [textareaRef, value, headings]);
  return activeLine;
}

// Track which slugs have already been animated in, so re-renders during
// typing don't re-stagger existing entries.
function useStaggerNew(items) {
  const seenRef = useRef(new Set());
  const [animated, setAnimated] = useState(new Set());
  useEffect(() => {
    const fresh = [];
    for (const slug of items) {
      if (!seenRef.current.has(slug)) {
        seenRef.current.add(slug);
        fresh.push(slug);
      }
    }
    if (fresh.length > 0) {
      setAnimated((prev) => {
        const next = new Set(prev);
        fresh.forEach((s) => next.add(s));
        return next;
      });
    }
  }, [items]);
  return animated;
}

// ─── MarkdownEditor (the leaf component) ─────────────────────────────────────

function MarkdownEditor({ value, onChange, onHeadingsChange, textareaRef }) {
  const debounced = useDebounced(value, 150);
  const flat = useMemo(() => parseHeadings(debounced), [debounced]);

  useEffect(() => {
    onHeadingsChange?.(flat);
  }, [flat, onHeadingsChange]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      className="mockup-editor h-full w-full resize-none px-12 py-10 text-[13px] leading-[1.7] tracking-[-0.005em]"
      style={{
        background: "var(--editor-paper)",
        color: "var(--editor-ink)",
        fontFamily: "var(--font-mono)",
        border: "none",
      }}
    />
  );
}

// ─── MarkdownToc (parent-rendered, fed by onHeadingsChange) ──────────────────

function MarkdownToc({ tree, activeLine, onJump }) {
  const allSlugs = useMemo(() => {
    const arr = [];
    for (const h of tree) {
      arr.push(h.slug);
      for (const c of h.children) arr.push(c.slug);
    }
    return arr;
  }, [tree]);
  const animated = useStaggerNew(allSlugs);

  const hasContent = tree.length > 0;

  return (
    <aside
      className="relative w-[280px] shrink-0 px-6 pt-9 pb-6"
      style={{
        color: "var(--editor-ink)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <div
        className="mb-5 text-[10px] font-semibold tracking-[0.18em] uppercase select-none"
        style={{
          fontFamily: "var(--font-ui)",
          color: "var(--editor-ink-soft)",
        }}
      >
        Outline
      </div>

      {/* The spine — full-height vertical rail under the entries. */}
      {hasContent && (
        <div
          aria-hidden
          className="pointer-events-none absolute w-px"
          style={{
            left: "calc(1.5rem + 0.75rem)",
            top: "76px",
            bottom: "1.5rem",
            background: "var(--editor-spine-soft)",
          }}
        />
      )}

      {hasContent ? (
        <ol className="relative space-y-2.5">
          {tree.map((h, i) => {
            const isActive = activeLine === h.line;
            const isNew = animated.has(h.slug);
            const fadeDelay = i * 30;
            return (
              <li
                key={h.slug}
                className="group relative"
                style={
                  isNew
                    ? {
                        animation: `mockupFadeUp 220ms cubic-bezier(0.16, 1, 0.3, 1) ${fadeDelay}ms backwards`,
                      }
                    : undefined
                }
              >
                <button
                  onClick={() => onJump(h.line)}
                  className="flex w-full items-baseline gap-3 py-1 pl-6 text-left transition-[color,transform] duration-200 hover:translate-x-[2px] focus:outline-none focus-visible:translate-x-[2px]"
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "13.5px",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    color: isActive
                      ? "var(--editor-ink)"
                      : "var(--editor-ink-soft)",
                  }}
                >
                  {/* The rail tick — sits ON the spine.
                     Positioned at left: 0.75rem inside this <li>, which sits
                     at the aside's content-area (1.5rem from aside-left).
                     That puts the tick at 2.25rem from aside-left — exactly
                     where the spine div is. */}
                  <span
                    aria-hidden
                    className="absolute top-[10px] size-[7px] rounded-full transition-all duration-200"
                    style={{
                      left: "0.75rem",
                      transform: `translateX(-50%) scale(${isActive ? 1.35 : 1})`,
                      background: isActive
                        ? "var(--editor-active)"
                        : "var(--primary)",
                      boxShadow: isActive
                        ? `0 0 0 4px var(--editor-active-soft)`
                        : "none",
                    }}
                  />

                  {/* Roman numeral — small caps, tabular, dim */}
                  <span
                    className="w-6 shrink-0 text-[10px] uppercase tabular-nums select-none"
                    style={{
                      fontFamily: "var(--font-ui)",
                      letterSpacing: "0.08em",
                      color: "var(--editor-ink-fade)",
                      fontWeight: 500,
                    }}
                  >
                    {toRoman(i + 1)}
                  </span>

                  <span className="leading-snug">{h.text}</span>
                </button>

                {/* Nested H3s — hung off this H2 with their own short rail */}
                {h.children.length > 0 && (
                  <ul
                    className="relative mt-1 ml-[52px] space-y-0.5 pl-3"
                    style={{ borderLeft: "1px solid var(--editor-spine-soft)" }}
                  >
                    {h.children.map((c, ci) => {
                      const cActive = activeLine === c.line;
                      const cNew = animated.has(c.slug);
                      const cDelay = fadeDelay + (ci + 1) * 30;
                      return (
                        <li
                          key={c.slug}
                          style={
                            cNew
                              ? {
                                  animation: `mockupFadeUp 220ms cubic-bezier(0.16, 1, 0.3, 1) ${cDelay}ms backwards`,
                                }
                              : undefined
                          }
                        >
                          <button
                            onClick={() => onJump(c.line)}
                            className="block py-0.5 text-left transition-[color,transform] duration-200 hover:translate-x-[2px] focus:outline-none focus-visible:translate-x-[2px]"
                            style={{
                              fontFamily: "var(--font-ui)",
                              fontSize: "12.5px",
                              fontWeight: 300,
                              letterSpacing: "0",
                              color: cActive
                                ? "var(--editor-ink)"
                                : "var(--editor-ink-fade)",
                            }}
                          >
                            {c.text}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyOutlineWhisper />
      )}
    </aside>
  );
}

// Empty state — a whisper of what an outline will become.
// Teaches the syntax without a help block.
function EmptyOutlineWhisper() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute w-px"
        style={{
          left: "0.75rem",
          top: "10px",
          bottom: "8px",
          background: "var(--editor-spine-soft)",
          opacity: 0.4,
        }}
      />
      <ol
        aria-hidden
        className="relative space-y-3 select-none"
        style={{ opacity: 0.28 }}
      >
        {[
          { num: "I", text: "Add a heading like", code: "## Section" },
          { num: "II", text: "…and another one" },
          { num: "III", text: "or a subsection with", code: "### Detail" },
        ].map((row, i) => (
          <li key={i} className="relative pl-6">
            <span
              aria-hidden
              className="absolute top-[8px] size-[6px] rounded-full"
              style={{
                left: "0.75rem",
                transform: "translateX(-50%)",
                background: "var(--primary)",
              }}
            />
            <div className="flex items-baseline gap-3">
              <span
                className="w-6 shrink-0 text-[10px] uppercase tabular-nums"
                style={{
                  fontFamily: "var(--font-ui)",
                  letterSpacing: "0.08em",
                  color: "var(--editor-ink-soft)",
                  fontWeight: 500,
                }}
              >
                {row.num}
              </span>
              <span
                className="text-[13px] leading-snug"
                style={{
                  fontFamily: "var(--font-ui)",
                  fontWeight: 400,
                  color: "var(--editor-ink-soft)",
                }}
              >
                {row.text}
                {row.code && (
                  <code
                    className="ml-1.5 rounded px-1.5 py-0.5 text-[11px]"
                    style={{
                      fontFamily: "var(--font-mono)",
                      background: "var(--editor-spine-soft)",
                      color: "var(--editor-ink)",
                    }}
                  >
                    {row.code}
                  </code>
                )}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── ActivityNav (left rail — context, not part of #75) ─────────────────────
// Mirrors production src/components/activity-bar.tsx + activity-bar-item.tsx
// patterns: 48px wide, bg-card, right-side elevation shadow, 40px ghost-icon
// buttons with FA Pro Light/Solid swap on active, plus a primary-coloured
// vertical indicator bar to the left of the active item.

const NAV_ITEMS = [
  { key: "Modes", Icon: FileText },
  { key: "Languages", Icon: Languages },
];

function ActivityNav({ active, onChange }) {
  return (
    <aside
      className="relative z-10 flex h-full shrink-0 flex-col items-center py-3"
      style={{
        width: "48px",
        background: "var(--card)",
        boxShadow: "2px 0 12px rgba(0,0,0,0.2)",
      }}
    >
      <div className="flex flex-col items-center gap-1.5">
        {NAV_ITEMS.map(({ key, Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              aria-label={key}
              title={key}
              className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-md transition-all hover:shadow-sm active:scale-95"
              style={{
                color: isActive
                  ? "var(--foreground)"
                  : "var(--muted-foreground)",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent)";
                e.currentTarget.style.color = "var(--foreground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = isActive
                  ? "var(--foreground)"
                  : "var(--muted-foreground)";
              }}
            >
              {/* Active-state primary indicator bar — left of the icon.
                 Production replaces this with the FA Pro Light → Solid swap;
                 the bar stays in both implementations. */}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute top-1.5 bottom-1.5 -left-1 w-0.5 rounded-full transition-all"
                  style={{ background: "var(--primary)" }}
                />
              )}
              {/* Stroke-width contrast as a Lucide stand-in for the FA Pro
                 Light/Solid swap. Active = heavier stroke. */}
              <Icon className="size-5" strokeWidth={isActive ? 2.5 : 1.5} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ─── TestPane (right rail — context, not part of #75) ───────────────────────
// Lives in production behind issue #24 (already shipped) and #81 (active-
// selection wiring). Included here in the same paper aesthetic so it sits
// alongside the editor without visually clashing.

function TestPane() {
  return (
    <aside
      className="relative flex shrink-0 flex-col gap-3 px-5 py-6"
      style={{
        width: "300px",
        background: "var(--card)",
        color: "var(--card-foreground)",
        boxShadow: "-4px 0 12px rgba(0,0,0,0.2)",
      }}
    >
      <div
        className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] uppercase"
        style={{
          fontFamily: "var(--font-ui)",
          color: "var(--muted-foreground)",
        }}
      >
        <MessagesSquare className="size-3" strokeWidth={1.5} />
        Test pane
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-auto pt-2">
        {/* User bubble */}
        <div
          className="max-w-[88%] px-3.5 py-2.5"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "12.5px",
            lineHeight: 1.55,
            color: "var(--foreground)",
            background: "var(--accent)",
            borderRadius:
              "var(--radius-xl, 14px) var(--radius-xl, 14px) var(--radius-xl, 14px) var(--radius-sm, 4px)",
          }}
        >
          How does Spoken Mode answer a translation question?
        </div>
        {/* Assistant bubble — uses the primary accent, the only place outside
            the TOC where chromatic accent appears in the page chrome */}
        <div
          className="ml-auto max-w-[88%] px-3.5 py-2.5"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "12.5px",
            lineHeight: 1.55,
            color: "var(--primary-foreground)",
            background: "var(--primary)",
            borderRadius:
              "var(--radius-xl, 14px) var(--radius-xl, 14px) var(--radius-sm, 4px) var(--radius-xl, 14px)",
          }}
        >
          Speaking with the tone defined in your mode's Language Tone section,
          with care and a measured cadence…
        </div>
      </div>

      {/* Shadcn default-variant button: bg-primary text-primary-foreground hover:bg-primary/90 */}
      <button
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-all hover:opacity-90 focus:outline-none focus-visible:ring-[3px]"
        style={{
          fontFamily: "var(--font-ui)",
          color: "var(--primary-foreground)",
          background: "var(--primary)",
        }}
      >
        <Send className="size-3.5" strokeWidth={2} />
        Test Spoken Mode
      </button>
    </aside>
  );
}

// ─── The mockup page ─────────────────────────────────────────────────────────

export default function MarkdownEditorMockup() {
  useStyleInjection();
  const [content, setContent] = useState(SAMPLE_CONTENT);
  const [headings, setHeadings] = useState([]);
  const [pulseLine, setPulseLine] = useState(null);
  const [dark, setDark] = useState(false);
  const [activeNav, setActiveNav] = useState("Modes");
  const textareaRef = useRef(null);

  const tree = useMemo(() => groupHeadings(headings), [headings]);
  const activeLine = useActiveHeadingLine(textareaRef, content, headings);

  const jumpTo = useCallback(async (line) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const lh = parseFloat(getComputedStyle(ta).lineHeight);
    const lineHeight = Number.isFinite(lh) ? lh : 22;

    const cs = getComputedStyle(ta);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const targetTop = Math.max(0, padTop + line * lineHeight - 24);

    await smoothScrollTo(ta, targetTop, 340);

    // Cursor at line start, focused.
    const lines = ta.value.split("\n");
    let offset = 0;
    for (let i = 0; i < line; i++) offset += (lines[i]?.length ?? 0) + 1;
    ta.setSelectionRange(offset, offset);
    ta.focus();

    // Pulse the destination line — fires after scroll lands so position is stable.
    setPulseLine({ line, lineHeight, padTop, key: Date.now() });
    setTimeout(() => setPulseLine(null), 700);
  }, []);

  // Char counter color — warm pin only when over.
  const charLimit = 8000;
  const overLimit = content.length > charLimit;

  return (
    <div
      className={dark ? "mockup-dark" : ""}
      style={{
        background: "var(--editor-paper)",
        color: "var(--editor-ink)",
        fontFamily: "var(--font-ui)",
        height: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "row",
      }}
    >
      <ActivityNav active={activeNav} onChange={setActiveNav} />

      {/* Center column: header + (editor + TOC) */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Thin top frame — breadcrumb context + theme toggle.
           Mode dropdown is omitted (belongs to #76). */}
        <header
          className="flex shrink-0 items-center justify-between px-9 py-4"
          style={{
            background: "var(--editor-paper)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex items-baseline gap-3">
            <span
              className="text-[10px] font-semibold tracking-[0.18em] uppercase"
              style={{
                fontFamily: "var(--font-ui)",
                color: "var(--editor-ink-soft)",
              }}
            >
              Modes
            </span>
            <span style={{ color: "var(--editor-ink-fade)" }}>/</span>
            <button
              className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
              style={{
                fontFamily: "var(--font-ui)",
                fontWeight: 500,
                fontSize: "15px",
                color: "var(--editor-ink)",
                letterSpacing: "-0.005em",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
              title="Switch mode (mockup — switcher belongs to #76)"
            >
              Spoken Mode
              <ChevronDown
                className="size-3.5"
                strokeWidth={1.75}
                style={{ color: "var(--editor-ink-fade)" }}
              />
            </button>
          </div>

          {/* Theme toggle — emulates the production <ThemeToggle /> component:
             ghost-icon shadcn button (40px), FA Pro sun/moon, hover bg-accent. */}
          <button
            onClick={() => setDark((v) => !v)}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            title={dark ? "Light theme" : "Dark theme"}
            className="inline-flex size-10 items-center justify-center rounded-md transition-all focus:outline-none active:scale-95"
            style={{
              color: "var(--muted-foreground)",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent)";
              e.currentTarget.style.color = "var(--foreground)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--muted-foreground)";
            }}
          >
            {dark ? (
              <Sun className="size-5" strokeWidth={1.75} />
            ) : (
              <Moon className="size-5" strokeWidth={1.75} />
            )}
          </button>
        </header>

        {/* Editor + TOC — share one frame. No vertical border between them.
         The spine rail in the TOC is the only vertical line. */}
        <div
          className="relative flex min-h-0 flex-1"
          style={{ background: "var(--editor-paper)" }}
        >
          {/* Editor surface */}
          <main className="relative min-w-0 flex-1">
            {/* Margin column — a printed book's gutter */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 h-full w-12"
              style={{ background: "var(--editor-margin)" }}
            />

            <MarkdownEditor
              value={content}
              onChange={setContent}
              onHeadingsChange={setHeadings}
              textareaRef={textareaRef}
            />

            {/* Destination pulse — overlay on the editor after scroll lands */}
            {pulseLine && textareaRef.current && (
              <div
                key={pulseLine.key}
                aria-hidden
                className="pointer-events-none absolute right-0 left-12"
                style={{
                  top:
                    pulseLine.padTop +
                    pulseLine.line * pulseLine.lineHeight -
                    (textareaRef.current.scrollTop ?? 0),
                  height: pulseLine.lineHeight,
                  background: "var(--editor-active-pulse)",
                  animation: "mockupPulse 600ms ease-out forwards",
                }}
              />
            )}

            {/* Char counter — bottom-right, tabular, no card */}
            <div
              className="absolute right-6 bottom-3 text-[11px] tabular-nums select-none"
              style={{
                fontFamily: "var(--font-ui)",
                color: overLimit
                  ? "var(--editor-active)"
                  : "var(--editor-ink-fade)",
                fontWeight: overLimit ? 600 : 400,
              }}
            >
              {content.length.toLocaleString()} / {charLimit.toLocaleString()}
            </div>
          </main>

          {/* TOC */}
          <MarkdownToc tree={tree} activeLine={activeLine} onJump={jumpTo} />
        </div>
      </div>

      <TestPane />
    </div>
  );
}
