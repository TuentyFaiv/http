/* eslint-disable import/extensions */
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

import pkg from "./package.json" assert { type: "json" };
import { getFiles } from "./scripts/getFiles.js";

const extensions = [".js", ".ts"];
const external = Object.keys(pkg.peerDependencies ?? {});

export default {
  input: [
    "./src/index.ts",
    ...getFiles("./src/logic/classes", extensions),
    // ...getFiles("./src/logic/constants", extensions),
    ...getFiles("./src/logic/functions", extensions),
    ...getFiles("./src/logic/typing", extensions),
  ],
  output: {
    dir: "dist",
    format: "esm",
  },
  plugins: [
    nodeResolve({ extensions }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.build.json",
      declaration: true,
      declarationDir: "./dist/",
      types: external,
    }),
    terser(),
  ],
  external,
};
