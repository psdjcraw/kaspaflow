import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KaspaFlow",
    short_name: "KaspaFlow",
    description: "Kaspa-only direct payment helper for merchants",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f3",
    theme_color: "#167761",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
