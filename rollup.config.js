/* eslint-disable import/extensions */
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";

import { genEntries } from "./scripts/genEntries.js";

const extensions = [".js", ".ts"];

export default {
  input: [
    "./src/index.ts",
    ...genEntries("./src/logic", extensions),
  ],
  output: {
    dir: "dist",
    format: "esm",
  },
  plugins: [
    nodeResolve({ extensions }),
    typescript({
      tsconfig: "./tsconfig.build.json",
      declaration: true,
      declarationDir: "./dist/",
    }),
    terser(),
  ],
};
