"use client";

import Link from "next/link";
import { useState } from "react";
import { parseInline, parseMarkdown, type Block } from "@/lib/md/render";

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      return block.level === 1 ? (
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{block.text}</h1>
      ) : block.level === 2 ? (
        <h2 className="pt-2 text-[15px] font-semibold text-slate-900">{block.text}</h2>
      ) : (
        <h3 className="text-[13.5px] font-semibold text-slate-700">{block.text}</h3>
      );
    case "quote":
      return <blockquote className="border-l-4 border-amber-300 bg-amber-50 px-3 py-1.5 text-[13px] text-amber-900">{block.text}</blockquote>;
    case "list":
      return (
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] leading-6 text-slate-700">
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <table className="w-full max-w-md border-collapse text-[13px]">
          <thead>
            <tr>
              {block.head.map((h, i) => (
                <th key={i} className={`border-b border-slate-300 py-1.5 font-semibold text-slate-700 ${i === 0 ? "text-left" : "text-center"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className="border-b border-slate-100">
                {row.map((c, i) => (
                  <td key={i} className={`py-1.5 ${i === 0 ? "text-left text-slate-700" : "text-center font-mono tabular-nums text-slate-900"}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "paragraph":
      return (
        <p className="text-[13.5px] leading-6 text-slate-700">
          <InlineText text={block.text} />
        </p>
      );
  }
}

export function ExportView(props: { slug: string; title: string; markdown: string; fileName: string }) {
  const [view, setView] = useState<"preview" | "source">("preview");
  const [copied, setCopied] = useState<"idle" | "done" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.markdown);
      setCopied("done");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  return (
    <main className="mx-auto w-full max-w-[960px] px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href={`/review/${props.slug}`} className="text-[13px] font-medium text-slate-500 hover:text-slate-900">
          ← Back to the review
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="tablist">
            {(["preview", "source"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                data-testid={`view-${v}`}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-[13px] font-medium ${view === v ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
              >
                {v === "preview" ? "Preview" : "Markdown"}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid="copy"
            onClick={copy}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-800 hover:bg-slate-50"
          >
            {copied === "done" ? "Copied" : copied === "error" ? "Copy failed" : "Copy"}
          </button>
          <a
            href={`/api/reviews/${props.slug}/export?download=1`}
            download={props.fileName}
            data-testid="download"
            className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-[13px] font-medium text-white hover:bg-slate-800"
          >
            Download {props.fileName}
          </a>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm">
        {view === "preview" ? (
          <article data-testid="export-preview" className="space-y-3 px-8 py-7">
            {parseMarkdown(props.markdown).map((block, i) => (
              <BlockView key={i} block={block} />
            ))}
          </article>
        ) : (
          <pre data-testid="export-source" className="scroll-thin overflow-x-auto whitespace-pre-wrap px-6 py-5 font-mono text-[12.5px] leading-6 text-slate-800">
            {props.markdown}
          </pre>
        )}
      </div>
    </main>
  );
}
