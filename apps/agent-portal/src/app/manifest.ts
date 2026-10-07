import type { MetadataRoute } from "next";

/**
 * What a phone needs to install the portal to the home screen. Agents work
 * from their phones all day; staff verify receipts from theirs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CANVEXIA Agents",
    short_name: "CANVEXIA",
    description: "Refer businesses to CANVEXIA products and track your commission.",
    // Signed out this lands on the sign-in page; an agent gets their home,
    // staff are sent to the admin area.
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0d18",
    theme_color: "#6c5dbe",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
