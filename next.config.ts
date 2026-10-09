import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // `next dev` takes an exclusive lockfile keyed by the project's dist
  // directory, so two dev servers from the same checkout (e.g. the E2E
  // suite's separate family/public servers, on different ports)
  // collide on the default `.next` unless each points at its own.
  // NEXT_DIST_DIR is set only by that test setup; every other run
  // (dev, build, start) keeps the default `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Emit a self-contained `.next/standalone` server (with only the
  // production deps it actually needs) for the Docker image.
  output: "standalone",
};

export default nextConfig;
