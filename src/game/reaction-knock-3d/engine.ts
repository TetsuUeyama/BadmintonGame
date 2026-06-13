/**
 * リアクションステップ・ノック 3D — Babylon.js 実装。
 *
 * 2D 版（reaction-knock.html / src/game/reaction-knock）の「ゲーム設計」を参考に、
 * 3D で作り替えたもの。タイミング判定・採点・レベル・フェイントのロジックは
 * 2D 版を踏襲し、描画と座標だけ 3D ワールドへ置き換えている。
 *
 * === 座標系ルール（develop/developsecond 共通）===
 *   - 右手座標系（scene.useRightHandedSystem = true）
 *   - forward は +Z。プレイヤーはネット（+Z）方向を向く。
 *   - ネット = Z:0 / プレイヤー半面 = -Z / ノッカー = +Z
 *   - 回転はハードコードしない。本ゲームの可動オブジェクト（プレイヤー/ノッカー）は
 *     左右対称メッシュで forward が +Z 既定のため回転不要。シャトルは姿勢制御せず
 *     簡易表示（空力姿勢は TODO）。
 *
 * シャトルは物理エンジンではなくスクリプト軌道（放物線）で飛ばす。
 * 反応ゲームとして「着地点・着地時刻を確定させる」方が設計に合うため。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { AdvancedDynamicTexture, Ellipse, TextBlock } from "@babylonjs/gui";

export type Mode = "short" | "long" | "free";
type Phase = "idle" | "ready" | "windup" | "flight" | "post";
type Screen = "menu" | "play" | "result";

export interface HudData {
  ball: number;
  total: number;
  score: number;
  combo: number;
  modeLabel: string;
}
export interface ResultData {
  rank: string;
  score: number;
  title: string;
  perfect: number;
  good: number;
  bad: number;
  miss: number;
  newBest: boolean;
}
export interface ReactionKnock3DHost {
  onHud: (d: HudData) => void;
  onResult: (d: ResultData) => void;
}
export interface ReactionKnock3DController {
  start: (mode: Mode, level: number) => void;
  step: () => void;
  dispose: () => void;
}

interface Zone {
  x: number;
  z: number;
  row: number; // 0=前（ネット寄り）, 1=奥
}

const TOTAL_BALLS = 20;
const COURT = { width: 6.1, length: 13.4, netHeight: 1.55 };
const HALF_W = COURT.width / 2; // 3.05
const HALF_L = COURT.length / 2; // 6.7
const HOME = new Vector3(0, 0, -3.4);
const KNOCKER_POS = new Vector3(0, 0, 3.6);
const SHUTTLE_START = new Vector3(0, 1.4, 3.3);
const STRETCH = 1.9; // 返球が届く水平距離(m)
const PLAYER_SPEED = 6.2; // m/s（speedMult を掛ける）

export function modeName(m: Mode): string {
  return m === "short" ? "オールショート" : m === "long" ? "オールロング" : "フリー";
}
export function bestKey(mode: Mode, level: number): string {
  return "rsk3d-best:" + mode + ":" + level;
}
export function getBest(mode: Mode, level: number): number | null {
  try {
    const v = localStorage.getItem(bestKey(mode, level));
    return v ? JSON.parse(v).score : null;
  } catch {
    return null;
  }
}

export function createReactionKnock3D(
  canvas: HTMLCanvasElement,
  host: ReactionKnock3DHost
): ReactionKnock3DController {
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true; // 右手系
  scene.clearColor = new Color4(0.08, 0.1, 0.12, 1);

  // === カメラ：プレイヤー後方(-Z)から +Z(ネット方向) を見下ろす ===
  const camera = new ArcRotateCamera("cam", 0, 0, 10, new Vector3(0, 0.6, -1), scene);
  camera.setPosition(new Vector3(0, 8.5, -11));
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 7;
  camera.upperRadiusLimit = 24;
  camera.lowerBetaLimit = 0.15;
  camera.upperBetaLimit = Math.PI / 2.2;
  camera.wheelPrecision = 24;

  // === ライト ===
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.85;
  const dir = new DirectionalLight("dir", new Vector3(-0.4, -1, 0.3), scene);
  dir.intensity = 0.55;

  // === マテリアル ===
  const mat = (name: string, r: number, g: number, b: number, alpha = 1) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = new Color3(r, g, b);
    m.specularColor = new Color3(0.04, 0.04, 0.04);
    m.alpha = alpha;
    return m;
  };
  const courtMat = mat("court", 0.18, 0.55, 0.42);
  const lineMat = mat("line", 0.95, 0.96, 0.94);
  const netMat = mat("net", 0.9, 0.9, 0.9, 0.32);
  netMat.backFaceCulling = false;
  const whiteMat = mat("white", 1, 1, 1);
  const corkMat = mat("cork", 1, 0.71, 0.33);
  const playerMat = mat("player", 1, 0.42, 0.37);
  const knockerMat = mat("knocker", 0.36, 0.46, 0.55);
  const racketMat = mat("racket", 0.13, 0.16, 0.2);

  // === コート地面 ===
  const ground = MeshBuilder.CreateGround(
    "court",
    { width: COURT.width + 1.2, height: COURT.length + 1.2 },
    scene
  );
  ground.material = courtMat;

  // コートライン（薄い箱を地面のすぐ上に）
  const lineY = 0.011;
  const lineThickness = 0.05;
  const addLine = (x: number, z: number, w: number, l: number) => {
    const b = MeshBuilder.CreateBox(
      "ln",
      { width: w, height: 0.02, depth: l },
      scene
    );
    b.position.set(x, lineY, z);
    b.material = lineMat;
    b.isPickable = false;
    return b;
  };
  // 外周
  addLine(-HALF_W, 0, lineThickness, COURT.length); // 左サイド
  addLine(HALF_W, 0, lineThickness, COURT.length); // 右サイド
  addLine(0, -HALF_L, COURT.width, lineThickness); // 手前エンド
  addLine(0, HALF_L, COURT.width, lineThickness); // 奥エンド
  addLine(0, 0, COURT.width, lineThickness * 1.4); // ネットライン
  // センターライン（プレイヤー半面）
  addLine(0, -HALF_L / 2, lineThickness, HALF_L);
  // ショートサービスライン（雰囲気）
  addLine(0, -1.98, COURT.width, lineThickness);

  // === ネット ===
  const net = MeshBuilder.CreatePlane(
    "net",
    { width: COURT.width, height: COURT.netHeight },
    scene
  );
  // 平面の既定法線は -Z。ネットは X 方向に張るので Y 軸 90°。
  // これは静的な見た目用配置（動的回転ではない）ため許容。
  net.rotation.y = Math.PI / 2;
  net.position.set(0, COURT.netHeight / 2, 0);
  net.material = netMat;
  net.isPickable = false;
  // 支柱
  for (const sx of [-HALF_W, HALF_W]) {
    const post = MeshBuilder.CreateCylinder(
      "post",
      { height: COURT.netHeight + 0.1, diameter: 0.08 },
      scene
    );
    post.position.set(sx, (COURT.netHeight + 0.1) / 2, 0);
    post.material = lineMat;
    post.isPickable = false;
  }

  // === ゾーン定義（プレイヤー半面 -Z）===
  function zones(mode: Mode): Zone[] {
    const cols = [-2, 0, 2];
    const frontZ = -1.7; // ネット寄り
    const backZ = -5.0; // 奥
    const list: Zone[] = [];
    for (let r = 0; r < 2; r++) {
      for (const cx of cols) {
        list.push({ x: cx, z: r === 0 ? frontZ : backZ, row: r });
      }
    }
    if (mode === "short") return list.filter((z) => z.row === 0);
    if (mode === "long") return list.filter((z) => z.row === 1);
    return list;
  }

  // ゾーンガイド（薄いリング）
  const zoneRings: Mesh[] = [];
  function buildZoneRings(mode: Mode) {
    zoneRings.forEach((m) => m.dispose());
    zoneRings.length = 0;
    const gm = mat("zone", 1, 1, 1, 0.12);
    zones(mode).forEach((z) => {
      const t = MeshBuilder.CreateTorus(
        "zr",
        { diameter: 1.5, thickness: 0.04, tessellation: 28 },
        scene
      );
      t.position.set(z.x, 0.02, z.z);
      t.material = gm;
      t.isPickable = false;
      zoneRings.push(t);
    });
  }

  // === 着地マーカー ===
  const marker = MeshBuilder.CreateTorus(
    "marker",
    { diameter: 1.2, thickness: 0.06, tessellation: 32 },
    scene
  );
  marker.material = mat("markerMat", 1, 0.71, 0.33, 1);
  marker.isPickable = false;
  marker.isVisible = false;

  // === シャトル（簡易：コルク球 + フェザー円錐）===
  const shuttle = new TransformNode("shuttle", scene);
  const cork = MeshBuilder.CreateSphere("cork", { diameter: 0.16 }, scene);
  cork.material = whiteMat;
  cork.parent = shuttle;
  cork.position.y = -0.05;
  const skirt = MeshBuilder.CreateCylinder(
    "skirt",
    { height: 0.22, diameterBottom: 0.06, diameterTop: 0.24, tessellation: 12 },
    scene
  );
  skirt.material = corkMat;
  skirt.parent = shuttle;
  skirt.position.y = 0.08;
  shuttle.setEnabled(false);

  // === プレイヤー（カプセル + 頭 + ラケット）===
  const playerRoot = new TransformNode("playerRoot", scene);
  const playerBody = new TransformNode("playerBody", scene); // wobble 用
  playerBody.parent = playerRoot;
  const pCap = MeshBuilder.CreateCapsule("pCap", { height: 1.1, radius: 0.28 }, scene);
  pCap.material = playerMat;
  pCap.parent = playerBody;
  pCap.position.y = 0.75;
  const pHead = MeshBuilder.CreateSphere("pHead", { diameter: 0.34 }, scene);
  pHead.material = playerMat;
  pHead.parent = playerBody;
  pHead.position.y = 1.5;
  const pRacket = MeshBuilder.CreateBox("pRacket", { width: 0.06, height: 0.5, depth: 0.32 }, scene);
  pRacket.material = racketMat;
  pRacket.parent = playerBody;
  pRacket.position.set(0.42, 1.05, 0.1);
  pCap.isPickable = pHead.isPickable = pRacket.isPickable = false;
  playerRoot.position.copyFrom(HOME);

  // === ノッカー ===
  const knockerRoot = new TransformNode("knockerRoot", scene);
  const kCap = MeshBuilder.CreateCapsule("kCap", { height: 1.1, radius: 0.28 }, scene);
  kCap.material = knockerMat;
  kCap.parent = knockerRoot;
  kCap.position.y = 0.75;
  const kHead = MeshBuilder.CreateSphere("kHead", { diameter: 0.34 }, scene);
  kHead.material = knockerMat;
  kHead.parent = knockerRoot;
  kHead.position.y = 1.5;
  const kArm = new TransformNode("kArm", scene);
  kArm.parent = knockerRoot;
  kArm.position.set(0, 1.1, 0);
  const kRacket = MeshBuilder.CreateBox("kRacket", { width: 0.06, height: 0.5, depth: 0.3 }, scene);
  kRacket.material = racketMat;
  kRacket.parent = kArm;
  kRacket.position.set(0, 0.3, -0.2);
  kCap.isPickable = kHead.isPickable = kRacket.isPickable = false;
  knockerRoot.position.copyFrom(KNOCKER_POS);

  // === GUI（タイミングリング + ポップアップ）===
  const adt = AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
  const ring = new Ellipse("ring");
  ring.thickness = 4;
  ring.color = "#ffb454";
  ring.background = "transparent";
  ring.isVisible = false;
  ring.widthInPixels = 120;
  ring.heightInPixels = 120;
  adt.addControl(ring);
  // リングをノッカー頭上にリンク
  const ringAnchor = new TransformNode("ringAnchor", scene);
  ringAnchor.parent = knockerRoot;
  ringAnchor.position.set(0, 1.7, 0);
  ring.linkWithMesh(ringAnchor);

  interface Pop {
    tb: TextBlock;
    t: number;
  }
  const pops: Pop[] = [];
  function popup(text: string, world: Vector3, color: string) {
    const anchor = new TransformNode("popAnchor", scene);
    anchor.position.copyFrom(world);
    const tb = new TextBlock("pop", text);
    tb.color = color;
    tb.fontSize = 26;
    tb.fontWeight = "800";
    tb.outlineColor = "rgba(10,13,17,0.85)";
    tb.outlineWidth = 5;
    tb.resizeToFit = true;
    adt.addControl(tb);
    tb.linkWithMesh(anchor);
    tb.linkOffsetY = -10;
    // anchor をポップに紐付け（dispose 用）
    (tb as unknown as { _anchor: TransformNode })._anchor = anchor;
    pops.push({ tb, t: 0 });
  }

  // === 効果音 ===
  let AC: AudioContext | null = null;
  function beep(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
    try {
      AC =
        AC ||
        new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
      const o = AC.createOscillator(),
        g = AC.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
      o.connect(g);
      g.connect(AC.destination);
      o.start();
      o.stop(AC.currentTime + dur);
    } catch {
      /* noop */
    }
  }

  // === ゲーム状態 ===
  const G = {
    screen: "menu" as Screen,
    mode: "short" as Mode,
    level: 1,
    ball: 0,
    score: 0,
    combo: 0,
    perfect: 0,
    good: 0,
    bad: 0,
    miss: 0,
    phase: "idle" as Phase,
    t: 0,
    readyDur: 0.9,
    rhythm: 1.1,
    windupStart: 0,
    expectHit: 0,
    hitTime: 0,
    holdExtra: 0,
    pressed: false,
    reactGrade: null as string | null,
    reactFactor: 0,
    speedMult: 1,
    target: null as Zone | null,
    fakeTarget: null as Zone | null,
    hasDirFeint: false,
    hasHoldFeint: false,
    flightDur: 1,
    landTime: 0,
    courseHard: 0,
    land: new Vector3(0, 0, -3),
    fakeLand: new Vector3(0, 0, -3),
    postUntil: 0,
    playerTarget: HOME.clone(),
    returnAnim: null as { t: number; dur: number; from: Vector3; wobble: number } | null,
  };
  let now = 0;

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const pick = <T,>(a: T[]): T => a[(Math.random() * a.length) | 0];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const lerp3 = (a: number, c: number, b: number, t: number) => {
    const u = 1 - t;
    return u * u * a + 2 * u * t * c + t * t * b;
  };

  function emitHud() {
    host.onHud({
      ball: Math.min(G.ball, TOTAL_BALLS),
      total: TOTAL_BALLS,
      score: G.score,
      combo: G.combo,
      modeLabel: modeName(G.mode) + " / Lv." + G.level,
    });
  }

  function start(mode: Mode, level: number) {
    G.mode = mode;
    G.level = level;
    G.screen = "play";
    G.ball = 0;
    G.score = 0;
    G.combo = 0;
    G.perfect = G.good = G.bad = G.miss = 0;
    G.rhythm = 1.0 + Math.random() * 0.3;
    playerRoot.position.copyFrom(HOME);
    G.playerTarget = HOME.clone();
    buildZoneRings(mode);
    emitHud();
    nextBall(0.9);
  }

  function nextBall(delay: number) {
    G.ball++;
    if (G.ball > TOTAL_BALLS) {
      finish();
      return;
    }
    G.phase = "ready";
    G.t = 0;
    G.readyDur = delay;
    G.pressed = false;
    G.reactGrade = null;
    G.reactFactor = 0.35;
    G.speedMult = 0.6;
    G.returnAnim = null;
    shuttle.setEnabled(false);
    marker.isVisible = false;
    ring.isVisible = false;
    emitHud();
  }

  function beginWindup() {
    G.phase = "windup";
    G.windupStart = now;
    const dur = G.rhythm + (Math.random() * 0.24 - 0.12);
    G.hasHoldFeint = false;
    G.holdExtra = 0;
    if (G.level >= 2 && Math.random() < (G.level === 2 ? 0.3 : 0.42)) {
      G.hasHoldFeint = true;
      G.holdExtra = 0.28 + Math.random() * 0.34;
    }
    G.expectHit = G.windupStart + dur;
    G.hitTime = G.expectHit + G.holdExtra;
    const zs = zones(G.mode);
    G.target = pick(zs);
    G.hasDirFeint = G.level >= 3 && Math.random() < 0.38;
    if (G.hasDirFeint) {
      const others = zs.filter((z) => z !== G.target);
      G.fakeTarget = pick(others.length ? others : zs);
    } else {
      G.fakeTarget = G.target;
    }
    ring.isVisible = true;
    shuttle.setEnabled(true);
    shuttle.position.copyFrom(SHUTTLE_START);
  }

  function launch() {
    G.phase = "flight";
    const deep = G.target!.row === 1;
    G.flightDur = deep ? 1.3 : 0.92;
    const d = Math.hypot(G.target!.x - HOME.x, G.target!.z - HOME.z);
    G.courseHard = Math.min(1, d / 6);
    G.landTime = now + G.flightDur;
    G.land.set(
      G.target!.x + (Math.random() * 0.9 - 0.45),
      0,
      G.target!.z + (Math.random() * 0.9 - 0.45)
    );
    if (G.hasDirFeint) {
      G.fakeLand.set(
        G.fakeTarget!.x + (Math.random() * 0.7 - 0.35),
        0,
        G.fakeTarget!.z + (Math.random() * 0.7 - 0.35)
      );
    } else {
      G.fakeLand.copyFrom(G.land);
    }
    marker.isVisible = true;
    beep(740, 0.08, "square", 0.12);
  }

  function judgePress() {
    if (G.pressed) return;
    if (G.phase !== "windup" && G.phase !== "flight") return;
    G.pressed = true;
    const dt = now - G.hitTime;
    const a = Math.abs(dt);
    let grade: string, factor: number, mult: number;
    if (a <= 0.1) {
      grade = "PERFECT";
      factor = 1.0;
      mult = 1.0;
      G.perfect++;
      beep(1180, 0.12, "triangle", 0.18);
    } else if (a <= 0.2) {
      grade = "GOOD";
      factor = 0.82;
      mult = 0.86;
      G.good++;
      beep(880, 0.1, "triangle", 0.15);
    } else {
      grade = dt < 0 ? "EARLY" : "LATE";
      factor = 0.55;
      mult = 0.66;
      G.bad++;
      beep(300, 0.15, "sawtooth", 0.1);
    }
    G.reactGrade = grade;
    G.reactFactor = factor;
    G.speedMult = mult;
    popup(
      grade,
      new Vector3(0, 1.8, 0),
      grade === "PERFECT" ? "#ffd76e" : grade === "GOOD" ? "#9fe6b8" : "#ff8b80"
    );
  }

  function noPressPenalty() {
    if (G.pressed) return;
    G.pressed = true;
    G.reactGrade = "NO STEP";
    G.reactFactor = 0.35;
    G.speedMult = 0.5;
    G.bad++;
    popup("ノーステップ…", new Vector3(0, 1.8, 0), "#ff8b80");
  }

  function resolveLanding() {
    const p = playerRoot.position;
    const dist = Math.hypot(p.x - G.land.x, p.z - G.land.z);
    if (dist <= STRETCH) {
      const posFactor = Math.max(0.25, 1 - Math.max(0, dist - 0.3) / STRETCH);
      let s = Math.round(100 * (0.6 * G.reactFactor + 0.4 * posFactor));
      s = Math.round(s * (1 + 0.15 * G.courseHard));
      s = Math.min(120, s);
      G.score += s;
      G.combo++;
      const q =
        G.reactFactor >= 0.8 && posFactor >= 0.75
          ? "◎ナイス"
          : posFactor >= 0.5
            ? "○リターン"
            : "△体勢ブレ";
      popup(
        "+" + s + " " + q,
        new Vector3(G.land.x, 0.6, G.land.z),
        s >= 90 ? "#ffd76e" : s >= 60 ? "#9fe6b8" : "#ffb29a"
      );
      G.returnAnim = {
        t: 0,
        dur: 0.65,
        from: new Vector3(G.land.x, 0.5, G.land.z),
        wobble: (1 - posFactor) * 1.2,
      };
      beep(560, 0.07, "square", 0.1);
    } else {
      G.miss++;
      G.combo = 0;
      popup("ミス！ノータッチ", new Vector3(G.land.x, 0.6, G.land.z), "#ff6b5e");
      beep(180, 0.25, "sawtooth", 0.14);
    }
    shuttle.setEnabled(false);
    marker.isVisible = false;
    emitHud();
    G.phase = "post";
    G.postUntil = now + 0.95;
  }

  function finish() {
    G.screen = "result";
    G.phase = "idle";
    shuttle.setEnabled(false);
    marker.isVisible = false;
    ring.isVisible = false;
    const sc = G.score;
    const r = sc / (TOTAL_BALLS * 100);
    const rank =
      r >= 0.85 ? "S" : r >= 0.7 ? "A" : r >= 0.52 ? "B" : r >= 0.34 ? "C" : "D";
    const best = getBest(G.mode, G.level);
    const newBest = best == null || sc > best;
    if (newBest) {
      try {
        localStorage.setItem(bestKey(G.mode, G.level), JSON.stringify({ score: sc }));
      } catch {
        /* noop */
      }
    }
    host.onResult({
      rank,
      score: sc,
      title: modeName(G.mode) + " / Lv." + G.level,
      perfect: G.perfect,
      good: G.good,
      bad: G.bad,
      miss: G.miss,
      newBest,
    });
  }

  // === 入力：コートをクリックして移動目標を設定（飛行中/post のみ）===
  scene.onPointerObservable.add((pi) => {
    if (pi.type !== PointerEventTypes.POINTERDOWN) return;
    if (G.screen !== "play") return;
    if (G.phase !== "flight" && G.phase !== "post") return;
    const p = pi.pickInfo?.pickedPoint;
    if (!p) return;
    if (p.z > -0.2) return; // プレイヤー半面（-Z）のみ
    G.playerTarget = new Vector3(
      clamp(p.x, -HALF_W + 0.2, HALF_W - 0.2),
      0,
      clamp(p.z, -HALF_L + 0.3, -0.4)
    );
  });

  // === メインループ ===
  function update(dt: number) {
    if (G.phase === "ready") {
      G.t += dt;
      if (G.t >= G.readyDur) beginWindup();
    } else if (G.phase === "windup") {
      if (now >= G.hitTime) launch();
    } else if (G.phase === "flight") {
      if (!G.pressed && now > G.hitTime + 0.38) noPressPenalty();
      if (now >= G.landTime) resolveLanding();
    } else if (G.phase === "post") {
      if (G.returnAnim) G.returnAnim.t += dt;
      // ホームへ自動で戻る
      G.playerTarget.x += (HOME.x - G.playerTarget.x) * dt * 1.6;
      G.playerTarget.z += (HOME.z - G.playerTarget.z) * dt * 1.6;
      if (now >= G.postUntil) nextBall(0.35 + Math.random() * 0.4);
    }

    // プレイヤー移動
    const p = playerRoot.position;
    const sp = PLAYER_SPEED * (G.phase === "flight" ? G.speedMult : 1) * dt;
    const dx = G.playerTarget.x - p.x,
      dz = G.playerTarget.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.02) {
      const m = Math.min(1, sp / d);
      p.x += dx * m;
      p.z += dz * m;
    }
    // 体勢ブレ（反応が悪いほど揺れる）
    let wob = 0;
    if ((G.phase === "flight" || G.phase === "post") && G.reactFactor && G.reactFactor < 0.8) {
      wob = (0.8 - G.reactFactor) * 0.18 * Math.sin(now * 18);
    }
    playerBody.position.x = wob;

    // シャトル位置（飛行中）
    if (G.phase === "flight") {
      const ft = clamp((now - G.hitTime) / G.flightDur, 0, 1);
      const showFake = G.hasDirFeint && now - G.hitTime < 0.32;
      const mk = showFake ? G.fakeLand : G.land;
      marker.position.set(mk.x, 0.02, mk.z);
      const pulse = 1 + Math.sin(now * 10) * 0.12;
      marker.scaling.setAll(pulse);
      (marker.material as StandardMaterial).diffuseColor = showFake
        ? new Color3(1, 1, 1)
        : new Color3(1, 0.71, 0.33);
      // XZ は偽コース→実コースへ寄る2次ベジェ、Y は山なり
      const cx = (G.fakeLand.x + G.land.x) / 2;
      const cz = (G.fakeLand.z + G.land.z) / 2;
      const bx = lerp3(SHUTTLE_START.x, cx, G.land.x, ft);
      const bz = lerp3(SHUTTLE_START.z, cz, G.land.z, ft);
      const arc = Math.sin(ft * Math.PI) * (G.target!.row === 1 ? 2.6 : 1.6);
      const by = lerp(SHUTTLE_START.y, 0.1, ft) + arc;
      shuttle.position.set(bx, by, bz);
    }

    // 返球アニメ
    if (G.returnAnim && G.returnAnim.t < G.returnAnim.dur) {
      const r = G.returnAnim;
      const t = r.t / r.dur;
      const x = lerp(r.from.x, KNOCKER_POS.x, t) + Math.sin(t * 9) * r.wobble * (1 - t);
      const z = lerp(r.from.z, KNOCKER_POS.z, t);
      const y = 0.5 + Math.sin(t * Math.PI) * 1.8;
      shuttle.setEnabled(true);
      shuttle.position.set(x, y, z);
      if (t > 0.98) shuttle.setEnabled(false);
    }

    // ノッカーの腕（振りかぶり→スイング）
    if (G.phase === "windup") {
      const prog = clamp((now - G.windupStart) / Math.max(0.01, G.expectHit - G.windupStart), 0, 1);
      kArm.rotation.x = -prog * 1.2; // 振りかぶり
    } else if (G.phase === "flight" && now - G.hitTime < 0.2) {
      kArm.rotation.x = 0.8; // スイング
    } else {
      kArm.rotation.x += (0 - kArm.rotation.x) * dt * 6;
    }

    // タイミングリング（windup 中のみ）
    if (G.phase === "windup") {
      const total = G.expectHit - G.windupStart;
      const remain = G.expectHit - now;
      const prog = clamp(1 - remain / total, 0, 1);
      const px = 130 - 90 * prog;
      ring.widthInPixels = Math.max(46, px);
      ring.heightInPixels = Math.max(46, px);
      ring.color = remain < 0 ? "#ff6b5e" : "#ffb454";
      ring.thickness = remain < 0 ? 5 : 4;
    }

    // ポップアップ更新
    for (let i = pops.length - 1; i >= 0; i--) {
      const o = pops[i];
      o.t += dt;
      o.tb.alpha = Math.max(0, 1 - o.t / 1.1);
      o.tb.linkOffsetY = -10 - o.t * 36;
      if (o.t >= 1.1) {
        const anchor = (o.tb as unknown as { _anchor: TransformNode })._anchor;
        o.tb.dispose();
        anchor.dispose();
        pops.splice(i, 1);
      }
    }
  }

  let last = 0;
  scene.onBeforeRenderObservable.add(() => {
    now = performance.now() / 1000;
    const dt = Math.min(0.05, now - (last || now));
    last = now;
    if (G.screen === "play") update(dt);
  });

  // 座標系検証ログ（rule 6）
  console.log("[rk3d] useRightHandedSystem =", scene.useRightHandedSystem);
  console.log("[rk3d] player forward = +Z (ネット方向)。net@Z0 / player@-Z / knocker@+Z");

  engine.runRenderLoop(() => scene.render());
  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    start,
    step: () => {
      if (G.screen === "play") judgePress();
    },
    dispose: () => {
      window.removeEventListener("resize", onResize);
      if (AC) {
        AC.close();
        AC = null;
      }
      adt.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
