import type { NextConfig } from "next";

import { SECURITY_HEADERS } from "./src/lib/csp";

/** The per-request CSP (with a nonce) is set in src/proxy.ts; these apply to every response. */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
