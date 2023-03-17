/* eslint-disable import/extensions */
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

import pkg from "./package.json" assert { type: "json" };

const extensions = [".js", ".ts"];
const external = Object.keys(pkg.peerDependencies ?? {});

export default {
  input: "./src/index.ts",
  output: {
    file: "dist/index.js",
    format: "esm",
  },
  plugins: [
    nodeResolve({ extensions }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.build.json",
      declaration: true,
      declarationDir: "/",
      types: external,
    }),
    terser(),
  ],
  external,
};
