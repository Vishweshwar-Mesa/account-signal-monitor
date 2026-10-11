export default function Loading() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 py-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-12 w-72 mb-4" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28" />)}
      </div>
      <div className="mt-4 flex flex-col lg:flex-row gap-4">
        <div className="skeleton h-96 w-full lg:w-[38%]" />
        <div className="skeleton h-96 flex-1" />
      </div>
    </main>
  );
}
