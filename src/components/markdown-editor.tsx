import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { Compartment, EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

import { cn } from "@/lib/utils";
import { parseHeadings } from "@/lib/markdown-headings";
import { findCommentRanges } from "@/lib/markdown-comment-ranges";
import type { MarkdownHeading } from "@/types/markdown";

export interface MarkdownEditorHandle {
  focus(): void;
  jumpToLine(line: number): void;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onHeadingsChange?: (headings: MarkdownHeading[]) => void;
  onActiveLineChange?: (line: number) => void;
  className?: string;
  readOnly?: boolean;
}

// Visual treatment for Ulysses-style comments: %% line comments and
// ++…++ inline spans. Backend stripping (worker #201) is the source of
// truth; this is presentation only. A multi-line %% paragraph comment
// only gets its first line dimmed here — the author still sees the
// raw markers on subsequent lines, which is an acceptable v1.
//
// Fence-aware matching lives in `findCommentRanges` so that `%%` or
// `++…++` inside fenced code blocks (legitimate literal content) are
// left alone — same fence semantics the heading parser uses.
const COMMENT_MARK = Decoration.mark({ class: "cm-comment-mark" });

function buildCommentDecorations(view: EditorView): DecorationSet {
  const ranges = findCommentRanges(view.state.doc.toString());
  return Decoration.set(
    ranges.map((r) => COMMENT_MARK.range(r.from, r.to)),
    true
  );
}

const commentDecoration = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildCommentDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildCommentDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    background: "var(--editor-paper)",
    color: "var(--editor-ink)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "13px",
    lineHeight: "1.7",
    letterSpacing: "-0.005em",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "2.5rem 3rem",
    caretColor: "var(--editor-ink)",
  },
  ".cm-line": { padding: "0" },
  "&.cm-editor.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    background: "var(--editor-active-soft)",
  },
  ".cm-comment-mark": {
    color: "var(--editor-ink-fade)",
    fontStyle: "italic",
  },
});

function computeActiveLine(
  view: EditorView,
  headings: MarkdownHeading[]
): number {
  const pos = view.state.selection.main.head;
  // CM6 lines are 1-indexed; `parseHeadings` reports 0-indexed line numbers.
  const lineZero = view.state.doc.lineAt(pos).number - 1;
  let active = -1;
  for (const h of headings) {
    if (h.line <= lineZero) active = h.line;
    else break;
  }
  return active;
}

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    value,
    onChange,
    onHeadingsChange,
    onActiveLineChange,
    className,
    readOnly,
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Headings are recomputed inside the editor on every doc change; we
  // keep them in a ref so the active-line listener can read the latest
  // without re-creating the view.
  const headingsRef = useRef<MarkdownHeading[]>([]);
  // Latest callback closures (avoid re-creating the editor on each render
  // when a parent passes inline callbacks).
  const onChangeRef = useRef(onChange);
  const onHeadingsChangeRef = useRef(onHeadingsChange);
  const onActiveLineChangeRef = useRef(onActiveLineChange);
  useEffect(() => {
    onChangeRef.current = onChange;
    onHeadingsChangeRef.current = onHeadingsChange;
    onActiveLineChangeRef.current = onActiveLineChange;
  });

  // Per-instance Compartment for the read-only facet so a `readOnly`
  // prop change reconfigures the existing view instead of triggering a
  // remount (which would destroy undo history + cursor state).
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);
  if (readOnlyCompartmentRef.current === null) {
    readOnlyCompartmentRef.current = new Compartment();
  }
  // Initial readOnly captured at mount; subsequent changes flow through
  // the reconfigure effect below. Held in a ref so the extensions
  // useMemo can stay free of prop deps.
  const initialReadOnlyRef = useRef(readOnly === true);

  // Extensions array is stable for the component lifetime — no deps —
  // so the mount effect runs exactly once. `readOnly` flows through the
  // Compartment reconfigure effect below; callback closures flow through
  // the *Ref pattern above.
  const extensions = useMemo(
    () => [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      commentDecoration,
      editorTheme,
      EditorView.lineWrapping,
      readOnlyCompartmentRef.current!.of(
        EditorState.readOnly.of(initialReadOnlyRef.current)
      ),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const text = update.state.doc.toString();
          onChangeRef.current(text);
          const headings = parseHeadings(text);
          headingsRef.current = headings;
          onHeadingsChangeRef.current?.(headings);
        }
        if (update.docChanged || update.selectionSet) {
          const active = computeActiveLine(update.view, headingsRef.current);
          onActiveLineChangeRef.current?.(active);
        }
      }),
    ],
    []
  );

  // Mount once; tear down on unmount. The `extensions` array is stable
  // (empty deps above), so this effect fires exactly once per instance.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    // Seed TOC + active line on mount so consumers don't need a
    // separate effect for the initial render.
    const initialHeadings = parseHeadings(value);
    headingsRef.current = initialHeadings;
    onHeadingsChangeRef.current?.(initialHeadings);
    onActiveLineChangeRef.current?.(computeActiveLine(view, initialHeadings));
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // `value` is intentionally only the initial doc; external value
    // changes flow through the sync effect below. `extensions` is
    // stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value → editor sync. The guard prevents this from
  // overwriting in-flight user edits (typing → onChange → parent state
  // → value prop → here, where value already matches the editor's doc).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  // ReadOnly toggle → reconfigure compartment in place. No remount,
  // undo history + cursor state preserved.
  useEffect(() => {
    const view = viewRef.current;
    const compartment = readOnlyCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({
      effects: compartment.reconfigure(
        EditorState.readOnly.of(readOnly === true)
      ),
    });
  }, [readOnly]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
      jumpToLine(line: number) {
        const view = viewRef.current;
        if (!view) return;
        // `line` is 0-indexed from MarkdownHeading; CM6 is 1-indexed.
        const lineNumber = Math.min(
          Math.max(line + 1, 1),
          view.state.doc.lines
        );
        const docLine = view.state.doc.line(lineNumber);
        view.focus();
        view.dispatch({
          selection: { anchor: docLine.from },
          effects: EditorView.scrollIntoView(docLine.from, {
            y: "start",
            yMargin: 80,
          }),
        });
      },
    }),
    []
  );

  return (
    <div
      ref={hostRef}
      className={cn("h-full w-full", className)}
      style={{ background: "var(--editor-paper)" }}
    />
  );
});
