import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { useStaggerNew } from "@/hooks/use-stagger-new";
import type { MarkdownHeading } from "@/types/markdown";

interface MarkdownTocProps {
  headings: MarkdownHeading[];
  activeLine?: number;
  onJump: (line: number) => void;
  className?: string;
}

interface H2Group {
  heading: MarkdownHeading;
  children: MarkdownHeading[];
}

const ROMAN_PAIRS: ReadonlyArray<readonly [string, number]> = [
  ["XL", 40],
  ["X", 10],
  ["IX", 9],
  ["V", 5],
  ["IV", 4],
  ["I", 1],
];

function toRoman(n: number): string {
  let out = "";
  let v = n;
  for (const [s, val] of ROMAN_PAIRS) {
    while (v >= val) {
      out += s;
      v -= val;
    }
  }
  return out || "—";
}

function group(headings: MarkdownHeading[]): H2Group[] {
  const tree: H2Group[] = [];
  for (const h of headings) {
    if (h.level === 2) {
      tree.push({ heading: h, children: [] });
    } else if (h.level === 3 && tree.length > 0) {
      tree[tree.length - 1]!.children.push(h);
    }
  }
  return tree;
}

export function MarkdownToc({
  headings,
  activeLine,
  onJump,
  className,
}: MarkdownTocProps) {
  const tree = useMemo(() => group(headings), [headings]);

  const allSlugs = useMemo(() => {
    const arr: string[] = [];
    for (const g of tree) {
      arr.push(g.heading.slug);
      for (const c of g.children) arr.push(c.slug);
    }
    return arr;
  }, [tree]);

  const animated = useStaggerNew(allSlugs);
  const hasContent = tree.length > 0;

  return (
    <aside
      className={cn("relative w-[280px] shrink-0 px-6 pt-9 pb-6", className)}
      style={{ color: "var(--editor-ink)" }}
    >
      <div
        className="mb-5 text-[10px] font-semibold tracking-[0.18em] uppercase select-none"
        style={{ color: "var(--editor-ink-soft)" }}
      >
        Outline
      </div>

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
          {tree.map((g, i) => {
            const h = g.heading;
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
                        animation: `editor-fade-up 220ms cubic-bezier(0.16, 1, 0.3, 1) ${fadeDelay}ms backwards`,
                      }
                    : undefined
                }
              >
                <button
                  onClick={() => onJump(h.line)}
                  className="flex w-full items-baseline gap-3 py-1 pl-6 text-left transition-[color,transform] duration-200 hover:translate-x-[2px] focus:outline-none focus-visible:translate-x-[2px]"
                  style={{
                    fontSize: "13.5px",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    color: isActive
                      ? "var(--editor-ink)"
                      : "var(--editor-ink-soft)",
                  }}
                >
                  {/* Rail tick — sits on the spine. left:0.75rem inside the
                     <li> + 1.5rem aside content offset = 2.25rem from aside-
                     left, exactly where the spine div is. */}
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
                        ? "0 0 0 4px var(--editor-active-soft)"
                        : "none",
                    }}
                  />
                  <span
                    className="w-6 shrink-0 text-[10px] uppercase tabular-nums select-none"
                    style={{
                      letterSpacing: "0.08em",
                      color: "var(--editor-ink-fade)",
                      fontWeight: 500,
                    }}
                  >
                    {toRoman(i + 1)}
                  </span>
                  <span className="leading-snug">{h.text}</span>
                </button>

                {g.children.length > 0 && (
                  <ul
                    className="relative mt-1 ml-[52px] space-y-0.5 pl-3"
                    style={{ borderLeft: "1px solid var(--editor-spine-soft)" }}
                  >
                    {g.children.map((c, ci) => {
                      const cActive = activeLine === c.line;
                      const cNew = animated.has(c.slug);
                      const cDelay = fadeDelay + (ci + 1) * 30;
                      return (
                        <li
                          key={c.slug}
                          style={
                            cNew
                              ? {
                                  animation: `editor-fade-up 220ms cubic-bezier(0.16, 1, 0.3, 1) ${cDelay}ms backwards`,
                                }
                              : undefined
                          }
                        >
                          <button
                            onClick={() => onJump(c.line)}
                            className="block py-0.5 text-left transition-[color,transform] duration-200 hover:translate-x-[2px] focus:outline-none focus-visible:translate-x-[2px]"
                            style={{
                              fontSize: "12.5px",
                              fontWeight: 300,
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

const WHISPER_ROWS: ReadonlyArray<{
  num: string;
  text: string;
  code?: string;
}> = [
  { num: "I", text: "Add a heading like", code: "## Section" },
  { num: "II", text: "…and another one" },
  { num: "III", text: "or a subsection with", code: "### Detail" },
];

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
        {WHISPER_ROWS.map((row, i) => (
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
                  fontWeight: 400,
                  color: "var(--editor-ink-soft)",
                }}
              >
                {row.text}
                {row.code && (
                  <code
                    className="ml-1.5 rounded px-1.5 py-0.5 font-mono text-[11px]"
                    style={{
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
