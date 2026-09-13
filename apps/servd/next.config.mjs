import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Menu-item image uploads (up to 5 MB) flow through a Server Action, whose
    // request body otherwise defaults to just 1 MB. (AI menu import uploads go
    // straight to Supabase Storage, so they aren't bound by this.)
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  images: {
    // Restaurant logos / menu photos are served from Supabase Storage.
    // Add your project's storage hostname here once you create the project.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
