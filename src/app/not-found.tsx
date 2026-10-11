import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-slate-600">There is no task at this address.</p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800">
        ← Back to the queue
      </Link>
    </main>
  );
}
