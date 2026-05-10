"use client";
import { useEffect } from "react";

// #region agent log — debug-c5653c H3
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[debug-c5653c H3] app error boundary:", error?.message, error?.digest, error?.stack);
  }, [error]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h2>Something went wrong</h2>
      <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>{error?.message}</pre>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
// #endregion