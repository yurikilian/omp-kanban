import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loopback-only, single-origin surface: no reason to advertise the
  // framework in responses.
  poweredByHeader: false,
};

export default nextConfig;
