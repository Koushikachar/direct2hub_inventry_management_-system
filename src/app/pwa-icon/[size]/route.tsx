import { ImageResponse } from "next/og";
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params, px = size === "512" ? 512 : 192;
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0E1B2B", color: "#F0A202", fontSize: px * 0.45, fontWeight: 800 }}>D2</div>, { width: px, height: px });
}
