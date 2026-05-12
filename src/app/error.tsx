"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h2>Something went wrong</h2>
      <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>{error?.message}</pre>
      <button onClick={reset}>Try again</button>
    </div>
  );
}