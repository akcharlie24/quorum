/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ["@silk/core"],
  serverExternalPackages: ["better-sqlite3"],
  // @silk/core is NodeNext TypeScript: its relative imports carry .js extensions
  // that must resolve to .ts sources when bundled.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
