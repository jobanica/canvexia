/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @servd/core ships TypeScript source (D9); same as apps/servd and apps/resceta.
  transpilePackages: ["@servd/core", "@servd/db"],
};

export default nextConfig;
