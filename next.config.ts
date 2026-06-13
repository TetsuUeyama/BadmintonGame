import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Babylon の Engine を React で生成するため、StrictMode の二重マウントによる
  // エンジン二重初期化を避けて false にする。
  reactStrictMode: false,
  eslint: {
    // lint はビルドをブロックしない（型チェックは有効のまま）
    ignoreDuringBuilds: true,
  },
  // next build(webpack) では Havok の wasm を asyncWebAssembly で扱えるようにする。
  // dev(--turbopack) ではこの設定は無視されるため、public/HavokPhysics.wasm を locateFile で読む。
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

export default nextConfig;
