import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Hides the dev-only route indicator badge (bottom-left "N"). Compile/runtime errors
  // still surface normally.
  devIndicators: false,
  // Addresses from before the civilian / coordinator / crew split, so old links and bookmarks
  // still land. Not permanent (307) in case a path is reused later.
  async redirects() {
    const coordinator = ["dispatch", "review", "resolved", "archive", "crews"].map((page) => ({
      source: `/${page}`,
      destination: `/coordinator/${page}`,
      permanent: false,
    }));
    return [
      ...coordinator,
      { source: "/incident/:id", destination: "/coordinator/incident/:id", permanent: false },
      { source: "/submit", destination: "/civilian", permanent: false },
      { source: "/report", destination: "/civilian", permanent: false },
    ];
  },
};

export default nextConfig;
