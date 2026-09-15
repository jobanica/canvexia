/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Both shared packages ship TypeScript source rather than a build artifact,
  // so Next runs them through the same pipeline as this app's own code.
  transpilePackages: ["@servd/core", "@servd/db"],
};

export default nextConfig;
