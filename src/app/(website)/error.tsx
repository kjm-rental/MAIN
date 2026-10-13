"use client";
export default function WebsiteError({ reset }: { reset: () => void }) {
  return (
    <main className="bg-sand grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <h1 className="text-deep-teal text-4xl font-bold">
          A pause in the journey.
        </h1>
        <p className="text-muted mt-4">
          We couldn’t load this page. Please try again.
        </p>
        <button
          onClick={reset}
          className="bg-deep-teal mt-6 min-h-12 rounded-full px-6 font-bold text-white"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
