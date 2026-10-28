import type { MetadataRoute } from "next";
/** Lets people install Direct2Hub on a phone or desktop from the browser menu ("Add to Home screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Direct2Hub", short_name: "Direct2Hub", description: "Inventory management for Indian sellers", start_url: "/dashboard", display: "standalone", background_color: "#0E1B2B", theme_color: "#0E1B2B",
    icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }, { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" }, { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
