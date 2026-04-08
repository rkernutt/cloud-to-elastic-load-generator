/**
 * Serialize JSON with the same options as `prettier --check` (reads `.prettierrc.json`).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prettier from "prettier";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** resolveConfig() needs a path inside the repo so it finds `.prettierrc.json`. */
let cachedOptions = null;

async function getFormatOptions(filePath) {
  if (!cachedOptions) {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
    const config = (await prettier.resolveConfig(abs)) ?? {};
    cachedOptions = config;
  }
  return cachedOptions;
}

export async function writePrettierJson(filePath, obj) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
  const options = await getFormatOptions(abs);
  // `filepath` is required so output matches `prettier --check` (JSON layout rules differ without it).
  const text = await prettier.format(JSON.stringify(obj), {
    ...options,
    filepath: abs,
  });
  fs.writeFileSync(abs, text, "utf8");
}
