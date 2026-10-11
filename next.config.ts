import type { NextConfig } from "next";

const config: NextConfig = {
  // The agent SDK spawns its bundled binary and better-sqlite3 is native: keep both out of the bundle.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "better-sqlite3"],
  outputFileTracingIncludes: { "/**": ["./data/**/*", "./fixtures/**/*"] },
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
};

export default config;
