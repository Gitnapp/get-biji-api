/**
 * Minimal markdown → TipTap (ProseMirror) converter for biji.com notes.
 *
 * Supported blocks:    heading (1-6), paragraph, bulletList, orderedList, empty paragraph
 * Supported inline:    code (` `), bold (**), italic (* or _)
 * Unsupported blocks:  table (| ... |), code fence, blockquote (>)
 *                      → routed through fallbackUnsupportedBlock() for user-defined behavior
 */

export interface TextNode {
  type: "text";
  text: string;
  marks?: Array<{ type: string }>;
}

export interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Array<BlockNode | TextNode>;
}

// ──────────────────── Inline parser ────────────────────

/**
 * Tokenize a line into TipTap text nodes, respecting mark precedence:
 *   code (highest) → bold → italic.
 * Code spans swallow everything inside (no nested marks).
 */
function parseInline(line: string): TextNode[] {
  if (!line) return [];
  const out: TextNode[] = [];
  let i = 0;
  while (i < line.length) {
    // ` ... ` — code span, no nested marks
    if (line[i] === "`") {
      const end = line.indexOf("`", i + 1);
      if (end > i) {
        out.push({ type: "text", text: line.slice(i + 1, end), marks: [{ type: "code" }] });
        i = end + 1;
        continue;
      }
    }
    // ** ... ** — bold (must check before single *)
    if (line[i] === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end > i) {
        out.push(...parseInline(line.slice(i + 2, end)).map((t) => ({
          ...t,
          marks: [...(t.marks ?? []), { type: "bold" }],
        })));
        i = end + 2;
        continue;
      }
    }
    // * ... * or _ ... _ — italic
    if (line[i] === "*" || line[i] === "_") {
      const ch = line[i];
      const end = line.indexOf(ch, i + 1);
      if (end > i && line[i + 1] !== " ") {
        out.push(...parseInline(line.slice(i + 1, end)).map((t) => ({
          ...t,
          marks: [...(t.marks ?? []), { type: "italic" }],
        })));
        i = end + 1;
        continue;
      }
    }
    // plain text run — find next mark start
    let j = i + 1;
    while (j < line.length && line[j] !== "`" && line[j] !== "*" && line[j] !== "_") j++;
    out.push({ type: "text", text: line.slice(i, j) });
    i = j;
  }
  return out;
}

// ──────────────────── Block builders ────────────────────

function paragraph(text: string): BlockNode {
  const content = parseInline(text);
  const node: BlockNode = { type: "paragraph", attrs: { textAlign: null } };
  if (content.length > 0) node.content = content;
  return node;
}

function heading(level: number, text: string): BlockNode {
  return { type: "heading", attrs: { textAlign: null, level }, content: parseInline(text) };
}

export function listItem(text: string): BlockNode {
  return { type: "listItem", content: [paragraph(text)] };
}

// ──────────────────── Fallback for unsupported blocks ────────────────────

export type UnsupportedBlock =
  | { kind: "table"; lines: string[] }
  | { kind: "codeFence"; lang?: string; lines: string[] }
  | { kind: "blockquote"; lines: string[] };

/**
 * USER DECISION POINT — fallback for markdown blocks v1 doesn't natively support.
 *
 * Called when the block parser encounters:
 *   - table:      "| col1 | col2 |" rows
 *   - codeFence:  ```lang ... ``` blocks
 *   - blockquote: "> " prefixed lines
 *
 * Three reasonable strategies:
 *   A) Flatten to paragraphs (current default below): preserves text, loses structure
 *   B) Wrap in `code` marks: visual differentiation via monospace
 *   C) Per-kind strategy: e.g., table → bulletList of rows, codeFence → paragraph with
 *      code marks, blockquote → italic paragraph
 *
 * The default below is (A). Edit this function to change behavior — return BlockNode[]
 * that will be inserted into the doc in place of the unsupported block.
 */
export function fallbackUnsupportedBlock(block: UnsupportedBlock): BlockNode[] {
  // Strategy C: per-kind degradation
  //   table       → bulletList where each row joins cells with "·"
  //   codeFence   → one paragraph per line, each line marked as `code` (monospace)
  //   blockquote  → paragraphs with `italic` mark, "> " prefix stripped
  if (block.kind === "table") {
    const rows = block.lines.filter((l) => !/^\|\s*-/.test(l)); // skip |---|---| separator
    const items = rows.map((r) =>
      listItem(r.replace(/^\||\|$/g, "").trim().split(/\s*\|\s*/).join(" · ")),
    );
    return [{ type: "bulletList", content: items }];
  }
  if (block.kind === "codeFence") {
    return block.lines.map((line) => ({
      type: "paragraph",
      attrs: { textAlign: null },
      content: [{ type: "text", text: line, marks: [{ type: "code" }] }],
    }));
  }
  // blockquote
  return block.lines.map((line) => {
    const stripped = line.replace(/^>\s?/, "");
    return {
      type: "paragraph",
      attrs: { textAlign: null },
      content: stripped ? [{ type: "text", text: stripped, marks: [{ type: "italic" }] }] : [],
    };
  });
}

// ──────────────────── Block parser ────────────────────

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const BULLET_RE = /^[-*]\s+/;
const ORDERED_RE = /^\d+\.\s+/;
const CODE_FENCE_RE = /^```/;
const TABLE_ROW_RE = /^\|.*\|\s*$/;
const BLOCKQUOTE_RE = /^>\s?/;

/**
 * Convert markdown into a TipTap doc JSON string compatible with biji.com's editor.
 * Always returns a stringified `{type: "doc", content: BlockNode[]}`.
 */
export function markdownToTipTap(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // empty line → empty paragraph (preserves visual spacing)
    if (line.trim() === "") {
      blocks.push({ type: "paragraph", attrs: { textAlign: null } });
      i++;
      continue;
    }

    // heading (# ... ######)
    const h = line.match(HEADING_RE);
    if (h) {
      blocks.push(heading(h[1].length, h[2]));
      i++;
      continue;
    }

    // bullet list — consecutive "- " or "* " lines
    if (BULLET_RE.test(line)) {
      const items: BlockNode[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(listItem(lines[i].replace(BULLET_RE, "")));
        i++;
      }
      blocks.push({ type: "bulletList", content: items });
      continue;
    }

    // ordered list — consecutive "N. " lines
    if (ORDERED_RE.test(line)) {
      const items: BlockNode[] = [];
      while (i < lines.length && ORDERED_RE.test(lines[i])) {
        items.push(listItem(lines[i].replace(ORDERED_RE, "")));
        i++;
      }
      blocks.push({ type: "orderedList", attrs: { start: 1, type: null }, content: items });
      continue;
    }

    // unsupported: code fence ```
    if (CODE_FENCE_RE.test(line)) {
      const lang = line.replace(CODE_FENCE_RE, "").trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !CODE_FENCE_RE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      blocks.push(...fallbackUnsupportedBlock({ kind: "codeFence", lang, lines: codeLines }));
      continue;
    }

    // unsupported: table (line starts and ends with |)
    if (TABLE_ROW_RE.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push(...fallbackUnsupportedBlock({ kind: "table", lines: tableLines }));
      continue;
    }

    // unsupported: blockquote "> "
    if (BLOCKQUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && BLOCKQUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i]);
        i++;
      }
      blocks.push(...fallbackUnsupportedBlock({ kind: "blockquote", lines: quoteLines }));
      continue;
    }

    // default: paragraph
    blocks.push(paragraph(line));
    i++;
  }

  return JSON.stringify({ type: "doc", content: blocks });
}
