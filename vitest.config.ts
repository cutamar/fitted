import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/src/**/*.test.ts"],
    env: { DATA_DIR: path.join(os.tmpdir(), "resume-builder-test") },
  },
});
