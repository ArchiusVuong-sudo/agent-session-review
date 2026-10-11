import type { Metadata } from "next";
import Link from "next/link";
import { ModeBadge } from "@/components/ModeBadge";
import { currentMode } from "@/lib/checker/mode";
import { checkModel } from "@/lib/checker/sdk-env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Session Review",
  description: "Review coding-agent sessions: facts, claim checks, a 2-vs-4 rubric and written feedback.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = await currentMode();
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-3 px-5">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">SR</span>
              Agent Session Review
            </Link>
            <span className="text-sm text-slate-400">Read the session. Judge the move. Write it down.</span>
            <div className="ml-auto">
              <ModeBadge mode={mode.mode} model={checkModel()} reason={mode.reason} />
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
