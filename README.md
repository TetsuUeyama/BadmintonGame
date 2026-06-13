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
| `/` | **リアクションステップ・ノック 3D**（Babylon.js のメインゲーム） |
| `/classic` | 移植元の 2D Canvas 版（設計の参考用） |

## ディレクトリ構成

```
src/
  app/
    layout.tsx                  ルートレイアウト
    page.tsx                    トップ（3D 版）
    globals.css                 最小限のリセット
    classic/page.tsx            2D 版（/classic・参考）
  components/
    ReactionKnock3D.tsx         3D 版の React UI（menu/HUD/result）+ エンジン起動
    reaction-knock-3d.css       3D 版 UI スタイル
    ReactionKnockGame.tsx       2D 版（参考）
    reaction-knock.css          2D 版スタイル
  game/
    reaction-knock-3d/
      engine.ts                 Babylon シーン + ゲームロジック（3D）
    reaction-knock/
      engine.ts                 2D Canvas ロジック（参考）
scripts/
  copy-havok-wasm.mjs           Havok wasm を public/ にコピー
```

## リアクションステップ・ノックとは

ノッカーが打つ瞬間に「ステップ！」を押し（リアクションステップ）、シャトルの落下点を
タップして移動 → 届けば自動リターン、という反応速度トレーニング系ミニゲーム。
ステップ精度が初動速度と体勢の安定（＝リターンの質）に影響する。20 球でスコアとランク判定。

- メニュー: オールショート / オールロング / フリー
- ノッカー Lv: 1（正直）/ 2（タメあり）/ 3（フェイント）
- 自己ベストは `localStorage` に保存

## 3D 版の設計

`reaction-knock.html`（2D Canvas）の**ゲーム設計を参考**に Babylon.js で作り替えたもの。
タイミング判定・採点・レベル・フェイントのロジックは 2D 版を踏襲し、描画と座標のみ 3D 化。

- 座標系: 右手系 / **forward = +Z**（プレイヤーはネット方向 +Z を向く）
- 配置: ネット = `Z:0` / プレイヤー半面 = `-Z` / ノッカー = `+Z`
- シャトルは物理エンジンではなく**スクリプト軌道（放物線）**。反応ゲームとして着地点・
  着地時刻を確定させる方が設計に合うため（Havok は依存に残すが本ゲームでは未使用）。
- タイミングリング・スコアポップアップは `@babylonjs/gui`。

## 現状 / 未検証

- ✅ `tsc --noEmit` / `npm run lint` / `npm run build` の成功は確認済み。
- ⚠️ **ブラウザでの実プレイは未検証**（描画・カメラ・タイミング体感・当たり判定の距離調整・
  音）。`npm run dev` で要確認。特に `STRETCH`（返球が届く距離）やプレイヤー速度などの
  数値はプレイして調整が必要。
- シャトルの空力姿勢（コルク先行）は未実装（簡易表示）。
