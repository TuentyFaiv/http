/* eslint-disable import/extensions */
import { visualizer } from "rollup-plugin-visualizer";

import config from "./rollup.config.js";

export default {
  input: config.input,
  output: config.output,
  plugins: [
    ...config.plugins,
    visualizer({
      filename: "bundle-analysis.html",
      open: true,
    }),
  ],
  external: config.external,
};
