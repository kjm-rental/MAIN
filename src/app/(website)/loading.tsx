export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading page"
      className="bg-off-white min-h-[60vh] p-8"
    >
      <div className="mx-auto max-w-6xl animate-pulse space-y-5">
        <div className="bg-sand h-8 w-32 rounded-full" />
        <div className="bg-sand h-20 max-w-xl rounded-2xl" />
        <div className="grid gap-5 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-sand h-72 rounded-3xl" />
          ))}
        </div>
      </div>
    </main>
  );
}
