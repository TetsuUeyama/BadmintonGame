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

## ルート

| パス | 内容 |
|------|------|
| `/` | **リアクションステップ・ノック**（2D Canvas のメインゲーム） |
| `/babylon` | Babylon.js 3D デモ（将来の 3D 化に向けた土台） |

## ディレクトリ構成

```
src/
  app/
    layout.tsx              ルートレイアウト
    page.tsx                トップ（リアクションステップ・ノック）
    globals.css             最小限のリセット
    babylon/
      page.tsx              Babylon デモ（/babylon）
      babylon.css           全画面キャンバス用スタイル
  components/
    ReactionKnockGame.tsx   ゲーム本体の DOM + エンジン起動（client）
    reaction-knock.css      ゲーム専用スタイル
    GameCanvas.tsx          Babylon キャンバス + ライフサイクル管理（client）
  game/
    reaction-knock/
      engine.ts             ゲームロジック（2D Canvas・型付き移植）
    createScene.ts          Babylon Engine/Scene 構築（コート/ネット/シャトル/Havok）
scripts/
  copy-havok-wasm.mjs       Havok wasm を public/ にコピー
```

## リアクションステップ・ノックとは

ノッカーが打つ瞬間に「ステップ！」を押し（リアクションステップ）、球の落下点を
タップして移動 → 届けば自動リターン、という反応速度トレーニング系ミニゲーム。
ステップ精度が初動速度と体勢の安定（＝リターンの質）に影響する。20 球でスコアとランク判定。

- メニュー: オールショート / オールロング / フリー
- ノッカー Lv: 1（正直）/ 2（タメあり）/ 3（フェイント）
- 自己ベストは `localStorage` に保存（元 HTML の `window.storage` から置換）

## 移植元

`reaction-knock.html`（単体 HTML）を TypeScript + React に移植したもの。
ゲームロジックは挙動を変えずに `src/game/reaction-knock/engine.ts` へ集約。

## 現状 / 未検証

- `npm run build` / `tsc --noEmit` の成功は確認済み。
- ブラウザでの実プレイ（描画・入力判定・音）は未検証。`npm run dev` で要確認。
- Babylon デモ（`/babylon`）はコート/ネット/シャトル（仮）の土台シーンまで。
