// Havok の WASM を public/ にコピーする。
// turbopack 環境では next.config.ts の webpack 設定が無視されるため、
// HavokPhysics({ locateFile: () => "/HavokPhysics.wasm" }) で読めるよう
// バンドラに依存せず public/ に実体を置く。
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const havokDir = join(projectRoot, "node_modules", "@babylonjs", "havok");
const publicDir = join(projectRoot, "public");
const dest = join(publicDir, "HavokPhysics.wasm");

/** node_modules 内から HavokPhysics.wasm を再帰探索する（パスはパッケージ版により異なるため） */
function findWasm(dir) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      const found = findWasm(full);
      if (found) return found;
    } else if (entry === "HavokPhysics.wasm") {
      return full;
    }
  }
  return null;
}

const src = findWasm(havokDir);
if (!src) {
  // 依存が未インストールの段階（最初の install 直前など）はスキップして install を失敗させない
  console.warn(
    "[copy-havok-wasm] HavokPhysics.wasm が見つかりません。依存未インストールの可能性。スキップします。"
  );
  process.exit(0);
}

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-havok-wasm] copied:\n  from ${src}\n  to   ${dest}`);
