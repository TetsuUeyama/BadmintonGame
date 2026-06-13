import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";

// 物理形状のためのインポート副作用（ツリーシェイク対策）
import "@babylonjs/core/Physics/physicsEngineComponent";

/**
 * バドミントンコートの公式寸法（メートル）。
 * 座標系ルール（developsecond）に従い右手系・+Z を forward とする。
 *  - 長手方向（ネットに垂直）を Z 軸に取る
 *  - 幅方向を X 軸に取る
 */
const COURT = {
  length: 13.4, // ダブルスコート全長（Z 方向）
  width: 6.1, // ダブルスコート全幅（X 方向）
  netHeight: 1.55, // ネット上端の高さ
} as const;

export interface GameHandles {
  engine: Engine;
  scene: Scene;
  dispose: () => void;
}

/**
 * Babylon の Engine と Scene を初期化し、バドミントンコートの土台シーンを構築する。
 * Havok 物理を有効化したうえで地面・ネット・シャトル（仮）を配置する。
 *
 * 注意（座標系ルール）:
 *  - scene.useRightHandedSystem = true（右手系）
 *  - forward は +Z。回転はハードコードせず、必要時は現在 forward との差分から算出する。
 */
export async function createGame(canvas: HTMLCanvasElement): Promise<GameHandles> {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });

  const scene = new Scene(engine);
  // 右手座標系（develop/developsecond 共通ルール）
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.05, 0.07, 0.1, 1);

  // --- カメラ ---
  // コート全体を斜め上から見下ろす。+Z を奥（forward）として配置。
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2, // alpha
    Math.PI / 3, // beta
    18, // radius
    new Vector3(0, 1, 0),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 40;
  camera.wheelPrecision = 20;

  // --- ライト ---
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.8;
  const dir = new DirectionalLight("dir", new Vector3(-0.4, -1, -0.6), scene);
  dir.intensity = 0.6;

  // --- 物理エンジン（Havok） ---
  // turbopack では webpack 設定が無視されるため public/HavokPhysics.wasm を locateFile で読む。
  const havok = await HavokPhysics({ locateFile: () => "/HavokPhysics.wasm" });
  const havokPlugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);

  // --- コート地面 ---
  const ground = MeshBuilder.CreateGround(
    "court",
    { width: COURT.width, height: COURT.length },
    scene
  );
  const groundMat = new StandardMaterial("courtMat", scene);
  groundMat.diffuseColor = new Color3(0.15, 0.45, 0.25); // コートグリーン
  groundMat.specularColor = new Color3(0.05, 0.05, 0.05);
  ground.material = groundMat;
  // 静的な床（質量 0）
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

  // --- ネット（中央 Z=0、X 方向に張る）---
  const net = MeshBuilder.CreatePlane(
    "net",
    { width: COURT.width, height: COURT.netHeight },
    scene
  );
  // 平面はデフォルトで法線が -Z 方向。X 方向に張りたいので Y 軸まわりに 90°。
  // ここは見た目用の固定配置であり、動的回転ではないため許容。
  net.rotation.y = Math.PI / 2;
  net.position = new Vector3(0, COURT.netHeight / 2, 0);
  const netMat = new StandardMaterial("netMat", scene);
  netMat.diffuseColor = new Color3(0.9, 0.9, 0.9);
  netMat.alpha = 0.35;
  netMat.backFaceCulling = false;
  net.material = netMat;

  // --- シャトル（仮：球）---
  const shuttle = MeshBuilder.CreateSphere("shuttle", { diameter: 0.2 }, scene);
  shuttle.position = new Vector3(0, 2.5, -3); // 手前側コート上空
  const shuttleMat = new StandardMaterial("shuttleMat", scene);
  shuttleMat.diffuseColor = new Color3(1, 1, 1);
  shuttle.material = shuttleMat;
  const shuttleBody = new PhysicsAggregate(
    shuttle,
    PhysicsShapeType.SPHERE,
    { mass: 0.005, restitution: 0.1 }, // 実シャトル約 5g
    scene
  );
  // 初速：相手コート（+Z, forward）方向へ放物線。
  // 速度はワールド forward(+Z) を基準に与える（ハードコード回転ではなくベクトル指定）。
  const forward = new Vector3(0, 0, 1);
  shuttleBody.body.setLinearVelocity(forward.scale(4).add(new Vector3(0, 3, 0)));

  // 座標系検証ログ（develop/developsecond ルール: forward と移動方向の一致確認用）
  console.log("[createScene] useRightHandedSystem =", scene.useRightHandedSystem);
  console.log("[createScene] world forward = +Z", forward.asArray());

  // --- 描画ループ ---
  engine.runRenderLoop(() => {
    scene.render();
  });

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  const dispose = () => {
    window.removeEventListener("resize", onResize);
    scene.dispose();
    engine.dispose();
  };

  return { engine, scene, dispose };
}
