import type { CheckStreamEvent } from "@/lib/checker/service";
import type { Decision, Finding, Interrupt, Review, ReviewDraft } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status}).`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  setInterrupt: (sessionId: string, turnId: string, note: string) =>
    call<Interrupt>(`/api/sessions/${sessionId}/interrupt`, { method: "PUT", body: JSON.stringify({ turnId, note }) }),
  clearInterrupt: (sessionId: string) => call<void>(`/api/sessions/${sessionId}/interrupt`, { method: "DELETE" }),
  decide: (findingId: number, decision: Decision) =>
    call<Finding>(`/api/findings/${findingId}`, { method: "PATCH", body: JSON.stringify({ decision }) }),
  saveDraft: (slug: string, draft: ReviewDraft) =>
    call<Review>(`/api/reviews/${slug}`, { method: "PUT", body: JSON.stringify(draft) }),
  submit: (slug: string) => call<Review>(`/api/reviews/${slug}/submit`, { method: "POST" }),
};

/** Starts a check and calls `onEvent` for each NDJSON line as it arrives. */
export async function streamCheck(sessionId: string, onEvent: (event: CheckStreamEvent) => void, signal?: AbortSignal) {
  const res = await fetch(`/api/sessions/${sessionId}/check`, { method: "POST", signal });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Check failed to start (${res.status}).`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as CheckStreamEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as CheckStreamEvent);
}
