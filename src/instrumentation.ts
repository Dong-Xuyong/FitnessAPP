/**
 * Runs once per Node server process (including Firebase App Hosting / Cloud Run).
 * Debug session c5653c — confirms server process starts; H-prod-startup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // #region agent log
    void fetch("http://127.0.0.1:7644/ingest/5711ebc9-4d56-4847-838c-c61e3b7a9e43", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c5653c" },
      body: JSON.stringify({
        sessionId: "c5653c",
        hypothesisId: "H-prod-startup",
        location: "instrumentation.ts:register",
        message: "Node instrumentation register",
        data: {
          nodeEnv: process.env.NODE_ENV,
          vercelUrl: Boolean(process.env.VERCEL_URL),
          kService: Boolean(process.env.K_SERVICE),
        },
        timestamp: Date.now(),
        runId: "pre-fix",
      }),
    }).catch(() => {});
    // #endregion
  }
}
