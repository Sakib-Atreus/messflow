import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // don't announce the framework in every response header
  poweredByHeader: false,
  experimental: {
    // Going back to a page opened in the last 30 seconds shows it instantly from the phone's memory
    // instead of loading it again. Your own changes still refresh it at once (every save revalidates),
    // and so do signing out and switching mess.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
