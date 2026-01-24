import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/game', destination: '/game/index.html' },
      { source: '/game/', destination: '/game/index.html' },
    ];
  },

  /* config options here */
};

export default nextConfig;
