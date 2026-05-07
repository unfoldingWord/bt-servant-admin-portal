export type MarkdownHeadingLevel = 1 | 2 | 3;

export interface MarkdownHeading {
  level: MarkdownHeadingLevel;
  text: string;
  slug: string;
  line: number;
}
