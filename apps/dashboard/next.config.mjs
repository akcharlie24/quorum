/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ["@silk/core"],
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],

  // @silk/core is NodeNext TypeScript: its relative imports carry .js extensions
  // that must resolve to .ts sources. Turbopack (the Next 16 default) does this
  // natively; the webpack branch is kept for `next build --webpack`.
  turbopack: {},
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
