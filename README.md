# Badminton Game

Next.js + TypeScript + Babylon.js で作るバドミントンゲーム。

## 技術スタック

| 領域 | 採用 |
|------|------|
| フレームワーク | Next.js 15.3.3 (App Router) |
| 言語 | TypeScript 5 |
| 3D / ゲーム | Babylon.js v8 (`@babylonjs/core`, `gui`, `loaders`, `materials`) |
| 物理 | Havok Physics v2 (`@babylonjs/havok`) |
| スタイル | Tailwind CSS v4 |

## 座標系ルール（重要）

本プロジェクトは `developsecond` 配下のため、3D 座標系の共通ルールに従う。

- **右手座標系**（`scene.useRightHandedSystem = true`）
- **forward は +Z**
- 回転はハードコードせず、現在 forward と目標 forward の **差分** から算出する
- コート: 長手方向 = Z 軸 / 幅方向 = X 軸 / ネットは中央 `Z=0`

## セットアップ

```bash
npm install      # postinstall で Havok の wasm を public/ にコピー
npm run dev      # http://localhost:3000
```

`npm run dev` / `npm run build` の前に `scripts/copy-havok-wasm.mjs` が走り、
`node_modules/@babylonjs/havok` 内の `HavokPhysics.wasm` を `public/` に配置する。
turbopack では `next.config.ts` の webpack 設定が無視されるため、
`HavokPhysics({ locateFile: () => "/HavokPhysics.wasm" })` で読み込む。

## ディレクトリ構成

```
src/
  app/
    layout.tsx        ルートレイアウト
    page.tsx          トップ（GameCanvas をマウント）
    globals.css       全画面キャンバス用スタイル
  components/
    GameCanvas.tsx    Babylon キャンバス + ライフサイクル管理（client）
  game/
    createScene.ts    Engine/Scene 構築・コート・ネット・シャトル・Havok 初期化
scripts/
  copy-havok-wasm.mjs Havok wasm を public/ にコピー
```

## 現状

- コート地面・ネット・シャトル（仮の球）を配置した土台シーンまで。
- シャトルは Havok 剛体として +Z 方向へ放物線で発射する初期実装。
  ※ 実シャトルの空力（高い抗力で急減速）は未実装。今後 `workPlan.md` に沿って実装する。
