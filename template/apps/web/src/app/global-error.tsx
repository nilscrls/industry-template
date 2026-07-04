"use client";

/** Last-resort boundary — renders without providers, so no i18n here. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ display: "grid", placeItems: "center", minHeight: "100dvh", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px" }} type="button">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
