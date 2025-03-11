import fs from "fs";
import path from "path";

export function genEntries(entry, extensions = [], excludeExtensions = []) {
  const dirs = fs.readdirSync(entry);

  return dirs.flatMap((dir) => {
    const pathname = path.join(entry, dir);

    if (fs.lstatSync(pathname).isDirectory()) {
      const subpaths = genEntries(pathname, extensions, excludeExtensions);

      return subpaths;
    }

    if (!excludeExtensions.some((extension) => pathname.endsWith(extension))
      && extensions.some((extension) => pathname.endsWith(extension))
    ) {
      return `./${pathname}`;
    }

    return dir;
  });
}
