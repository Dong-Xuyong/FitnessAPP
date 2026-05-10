"use client";
import { useEffect } from "react";

// #region agent log — debug-c5653c H3
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[debug-c5653c H3] global-error boundary:", error?.message, error?.digest, error?.stack);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        <h2>Something went wrong</h2>
        <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>{error?.message}</pre>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
// #endregion