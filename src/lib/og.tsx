
import { ImageResponse } from "next/og";

export function ogCard(headline: string, sub: string) {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 72,
          background: "linear-gradient(135deg, #0E1B2B, #0F766E)",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>
          <span>Direct</span>
          <span style={{ color: "#F0A202" }}>2</span>
          <span>Hub</span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: headline.length > 28 ? 72 : 84,
            fontWeight: 800,
            lineHeight: 1.05,
            maxWidth: 1000,
          }}
        >
          {headline}
        </div>

        <div style={{ display: "flex", fontSize: 32, opacity: 0.8 }}>
          {sub}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
