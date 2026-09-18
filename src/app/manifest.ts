import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meu Cesto",
    short_name: "Meu Cesto",
    description: "Collaborative shopping assistant",
    start_url: "/shopping",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f9f8",
    theme_color: "#059669",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
