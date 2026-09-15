/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @servd/core ships TypeScript source, not a build artifact, so Next has to
  // run it through the same pipeline as this app's own code. Same reasoning as
  // apps/servd — a shared package with a compile step between editing it and
  // seeing the change is a shared package nobody wants to work in.
  transpilePackages: ["@servd/core", "@servd/db"],
};

export default nextConfig;
