"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">This page failed to load</h1>
      <p className="mt-2 text-sm text-slate-600">{error.digest ? `Error ${error.digest}. ` : ""}Check the server log, then try again.</p>
      <button type="button" onClick={reset} className="mt-6 text-sm font-medium text-indigo-600 hover:text-indigo-800">
        Try again
      </button>
    </main>
  );
}
