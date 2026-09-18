/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @servd/core ships TypeScript source, not a build artifact, so Next has to
  // run it through the same pipeline as this app's own code. Same reasoning as
  // apps/servd — a shared package with a compile step between editing it and
  // seeing the change is a shared package nobody wants to work in.
  transpilePackages: ["@servd/core", "@servd/db"],
  experimental: {
    serverActions: {
      /*
        THE CATALOGUE IMPORT POSTS THE WHOLE CSV as a form field, because the
        server re-parses the raw text rather than trusting a JSON blob the page
        could have rewritten. Next's default cap is 1MB, and a real pharmacy
        price list — two thousand rows with generic names and barcodes — gets
        close enough to it that the failure would be a silent rejection with no
        row count to explain it.
      */
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
