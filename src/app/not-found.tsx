import Link from "next/link";
export default function NotFound() {
  return (
    <main className="bg-sand grid min-h-[70vh] place-items-center p-6 text-center">
      <div>
        <p className="text-ocean text-xs font-bold tracking-widest">
          A SMALL DETOUR
        </p>
        <h1 className="text-deep-teal mt-4 text-5xl font-bold">
          Let’s get you back
          <br />
          on the island road.
        </h1>
        <p className="text-muted mt-5 text-sm">
          This page is unavailable or you don’t have access to it.
        </p>
        <Link
          href="/motorcycles"
          className="bg-deep-teal mt-7 inline-flex min-h-12 items-center rounded-full px-6 font-bold text-white"
        >
          Explore motorcycles
        </Link>
      </div>
    </main>
  );
}
