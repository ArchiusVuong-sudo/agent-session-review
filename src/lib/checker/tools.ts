import { z } from "zod";
import { TurnId, type Turn } from "../types";

/**
 * The three read-only tools the check agent gets. Pure functions over a
 * session's turns, so they are tested without the SDK.
 */

export const ListTurnsInput = {};
export const GetTurnInput = { id: TurnId.describe("Turn id, like t3.") };
export const SearchSessionInput = {
  query: z.string().trim().min(2).max(80).describe("Case-insensitive text to find in the session."),
};

export const TOOL_DESCRIPTIONS = {
  list_turns: "List every turn of the session with its id, kind and a one-line summary.",
  get_turn: "Get the full content of one turn: text, command with exit code and output, file excerpt, or diff.",
  search_session: "Find lines that contain a piece of text, across all turns. Returns turn id, kind and the matching line.",
} as const;

export type ToolName = keyof typeof TOOL_DESCRIPTIONS;
export const TOOL_NAMES = Object.keys(TOOL_DESCRIPTIONS) as ToolName[];

const MAX_OUTPUT_CHARS = 6000;
const MAX_MATCHES = 12;

const oneLine = (text: string, max = 110) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export function summarizeTurn(turn: Turn): string {
  switch (turn.kind) {
    case "command":
      return `$ ${turn.command} (exit ${turn.exitCode})`;
    case "read":
      return `read ${turn.path}`;
    case "edit":
      return `edited ${turn.files.map((f) => f.path).join(", ")}`;
    default:
      return oneLine(turn.text);
  }
}

export function listTurns(turns: readonly Turn[]) {
  return turns.map((turn) => ({ id: turn.id, kind: turn.kind, summary: summarizeTurn(turn) }));
}

const clip = (text: string) =>
  text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (${text.length - MAX_OUTPUT_CHARS} more chars)` : text;

export function getTurn(turns: readonly Turn[], args: { id: string }): Turn | { error: string } {
  const turn = turns.find((t) => t.id === args.id);
  if (!turn) return { error: `No turn ${args.id}. This session has t1 to t${turns.length}.` };
  if (turn.kind === "command") return { ...turn, output: clip(turn.output) };
  return turn;
}

function searchableLines(turn: Turn): string[] {
  switch (turn.kind) {
    case "command":
      return [`$ ${turn.command}`, ...turn.output.split("\n")];
    case "read":
      return [turn.path, ...turn.excerpt.split("\n")];
    case "edit":
      return turn.files.flatMap((f) => [f.path, ...f.diff.split("\n")]);
    default:
      return turn.text.split("\n");
  }
}

export function searchSession(turns: readonly Turn[], args: { query: string }) {
  const needle = args.query.trim().toLowerCase();
  const matches: { id: string; kind: Turn["kind"]; line: string }[] = [];
  for (const turn of turns) {
    for (const line of searchableLines(turn)) {
      if (line.toLowerCase().includes(needle)) {
        matches.push({ id: turn.id, kind: turn.kind, line: oneLine(line, 160) });
        if (matches.length >= MAX_MATCHES) return { query: args.query, matches, truncated: true };
      }
    }
  }
  return { query: args.query, matches, truncated: false };
}
