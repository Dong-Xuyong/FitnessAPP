"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="font-body antialiased bg-background text-foreground">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-xl border bg-card text-card-foreground shadow">
            <div className="flex flex-col space-y-1.5 p-6">
              <h2 className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Something went wrong
              </h2>
              <p className="text-sm text-muted-foreground">
                A critical error occurred. Please try again.
              </p>
            </div>
            <div className="p-6 pt-0">
              <div className="relative w-full rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
                <p className="font-mono text-xs break-all">
                  {error?.message || "Unknown error"}
                </p>
              </div>
            </div>
            <div className="flex items-center p-6 pt-0">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
