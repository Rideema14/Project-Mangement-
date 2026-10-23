import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use the Tailwind v4 Turbopack loader included in this project's lockfile.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
