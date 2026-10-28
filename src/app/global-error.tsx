"use client";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#eef3f6", color: "#0E1B2B" }}>
    <div style={{ maxWidth: 380, textAlign: "center", padding: 24 }}><h1>Something went wrong</h1><p>Please try again.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <button onClick={reset} style={{ padding: "10px 18px", borderRadius: 12, border: 0, background: "#0F766E", color: "#fff", fontSize: 16 }}>Try again</button></div></body></html>;
}
