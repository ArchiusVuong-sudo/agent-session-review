/**
 * A small Markdown reader for the export preview. It covers only what
 * renderExport writes: headings, paragraphs, quotes, lists and pipe tables.
 */
export type Inline = { text: string; bold: boolean };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "paragraph"; text: string };

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replaceAll("\\|", "|"));

export function parseMarkdown(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length as 1 | 2 | 3, text: heading[2]! });
      i++;
    } else if (line.startsWith("> ")) {
      blocks.push({ kind: "quote", text: line.slice(2) });
      i++;
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) items.push(lines[i++]!.slice(2));
      blocks.push({ kind: "list", items });
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) rows.push(splitRow(lines[i++]!));
      const [head = [], , ...body] = rows;
      blocks.push({ kind: "table", head, rows: body });
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i]!.trim() && !/^(#{1,3} |> |- |\|)/.test(lines[i]!)) para.push(lines[i++]!);
      blocks.push({ kind: "paragraph", text: para.join(" ") });
    }
  }
  return blocks;
}

/** Splits **bold** spans out of a line. */
export function parseInline(text: string): Inline[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => (part.startsWith("**") && part.endsWith("**") ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));
}
