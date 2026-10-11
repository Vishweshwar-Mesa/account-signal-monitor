"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-[640px] px-4 py-16">
      <div className="card p-6">
        <h1 className="font-display font-bold text-xl">Something went wrong</h1>
        <p className="text-muted mt-2 text-sm">The page could not load. Your notes are safe; nothing was changed.</p>
        {error.digest && <p className="text-xs text-muted mt-2">Reference: {error.digest}</p>}
        <button type="button" className="btn btn-primary mt-4" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
