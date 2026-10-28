import { ImageResponse } from "next/og";
/** 1200x630 social card in the brand colours. Each page's opengraph-image.tsx calls this with its own headline, so shared links show the right title. */
export function ogCard(headline: string, sub: string) {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg,#0E1B2B,#0F766E)", color: "#fff" }}>
    <div style={{ fontSize: 44, fontWeight: 800 }}>Direct<span style={{ color: "#F0A202" }}>2</span>Hub</div>
    <div style={{ fontSize: headline.length > 28 ? 72 : 84, fontWeight: 800, lineHeight: 1.05, maxWidth: 1000 }}>{headline}</div>
    <div style={{ fontSize: 32, opacity: 0.8 }}>{sub}</div></div>, { width: 1200, height: 630 });
}
