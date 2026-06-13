/**
 * リアクションステップ・ノック — ゲームエンジン。
 *
 * 元の単体 HTML（reaction-knock.html）の IIFE スクリプトを TypeScript へ移植したもの。
 * 挙動を変えないことを最優先に、型付けと以下の必要な置き換えのみ行っている:
 *   - window.storage（非標準 API）→ localStorage
 *   - クリーンアップ（requestAnimationFrame の停止 / window リスナー解除）
 *
 * DOM 要素は元実装と同様に document.getElementById で取得する。
 * 対応する id を持つマークアップは ReactionKnockGame コンポーネントが描画する。
 *
 * 2D Canvas ゲーム（俯瞰）であり Babylon.js は使用しない。
 */

type Mode = "short" | "long" | "free";
type Phase = "idle" | "ready" | "windup" | "flight" | "post";
type Screen = "menu" | "play" | "result";

interface Zone {
  x: number;
  y: number;
  row: number; // 0=前, 1=奥
}

interface Popup {
  text: string;
  x: number;
  y: number;
  color: string;
  t: number;
}

interface ReturnAnim {
  t: number;
  dur: number;
  from: { x: number; y: number };
  wobble: number;
}

interface Player {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

interface GameState {
  screen: Screen;
  mode: Mode;
  level: number;
  ball: number;
  score: number;
  combo: number;
  perfect: number;
  good: number;
  bad: number;
  miss: number;
  phase: Phase;
  t: number;
  windupStart: number;
  hitTime: number;
  pressed: boolean;
  reactGrade: string | null;
  reactFactor: number;
  speedMult: number;
  target: Zone | null;
  fakeTarget: Zone | null;
  hasDirFeint: boolean;
  hasHoldFeint: boolean;
  landTime: number;
  flightDur: number;
  shuttle: unknown;
  marker: unknown;
  player: Player;
  resolved: boolean;
  returnAnim: ReturnAnim | null;
  ballScore: number;
  popups: Popup[];
  rhythm: number;
  // 動的に付与されるフィールド
  readyDur: number;
  holdExtra: number;
  expectHit: number;
  courseHard: number;
  land: { x: number; y: number };
  fakeLand: { x: number; y: number };
  postUntil: number;
}

/**
 * ゲームを初期化し、描画ループを開始する。
 * @returns クリーンアップ関数（アンマウント時に呼ぶ）
 */
export function initReactionKnock(): () => void {
  /* ===== 基本セットアップ ===== */
  const byId = <T extends HTMLElement>(id: string): T =>
    document.getElementById(id) as T;

  const cv = byId<HTMLCanvasElement>("cv");
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  const W = 440,
    H = 660; // 論理サイズ
  let scale = 1;
  function fit() {
    const w = Math.min(460, window.innerWidth - 20);
    scale = w / W;
    cv.style.height = H * scale + "px";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", fit);
  fit();

  /* コート座標 */
  const COURT = { x: 40, y: 30, w: W - 80, h: H - 70 };
  const NET_Y = COURT.y + COURT.h * 0.32;
  const KNOCKER = { x: W / 2, y: COURT.y + COURT.h * 0.14 };
  const HOME = { x: W / 2, y: COURT.y + COURT.h * 0.72 };
  const PLAYER_TOP = NET_Y + 18;

  /* ゾーン（プレイヤー側 3列×2行） */
  function zones(mode: Mode): Zone[] {
    const cols = 3,
      list: Zone[] = [];
    const top = PLAYER_TOP + 14,
      bottom = COURT.y + COURT.h - 16;
    const midY = (top + bottom) / 2;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const x = COURT.x + (COURT.w * (c + 0.5)) / cols;
        const y = r === 0 ? (top + midY) / 2 : (midY + bottom) / 2;
        list.push({ x, y, row: r }); // row0=前, row1=奥
      }
    }
    if (mode === "short") return list.filter((z) => z.row === 0);
    if (mode === "long") return list.filter((z) => z.row === 1);
    return list;
  }

  /* ===== 効果音（WebAudio・軽量） ===== */
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
    } catch (e) {
      void e;
    }
  }

  /* ===== 状態 ===== */
  const TOTAL_BALLS = 20;
  const G: GameState = {
    screen: "menu",
    mode: "short",
    level: 1,
    ball: 0,
    score: 0,
    combo: 0,
    perfect: 0,
    good: 0,
    bad: 0,
    miss: 0,
    phase: "idle",
    t: 0,
    // ボールごと
    windupStart: 0,
    hitTime: 0,
    pressed: false,
    reactGrade: null,
    reactFactor: 0,
    speedMult: 1,
    target: null,
    fakeTarget: null,
    hasDirFeint: false,
    hasHoldFeint: false,
    landTime: 0,
    flightDur: 1,
    shuttle: null,
    marker: null,
    player: { x: HOME.x, y: HOME.y, tx: HOME.x, ty: HOME.y },
    resolved: false,
    returnAnim: null,
    ballScore: 0,
    popups: [],
    rhythm: 1.1,
    readyDur: 0,
    holdExtra: 0,
    expectHit: 0,
    courseHard: 0,
    land: { x: 0, y: 0 },
    fakeLand: { x: 0, y: 0 },
    postUntil: 0,
  };
  let lastTs = 0;

  /* ===== ストレージ（自己ベスト） ===== */
  function bestKey() {
    return "rsk-best:" + G.mode + ":" + G.level;
  }
  function loadBest(): number | null {
    try {
      const v = localStorage.getItem(bestKey());
      return v ? JSON.parse(v).score : null;
    } catch (e) {
      void e;
      return null;
    }
  }
  function saveBest(score: number) {
    try {
      localStorage.setItem(bestKey(), JSON.stringify({ score }));
    } catch (e) {
      void e;
    }
  }
  function refreshBestLabel() {
    const b = loadBest();
    byId("best").textContent =
      "自己ベスト（" +
      modeName(G.mode) +
      " / Lv." +
      G.level +
      "）：" +
      (b == null ? "—" : b + "点");
  }
  function modeName(m: Mode) {
    return m === "short" ? "オールショート" : m === "long" ? "オールロング" : "フリー";
  }

  /* ===== UI ===== */
  const stepBtn = byId<HTMLButtonElement>("stepBtn");
  const menu = byId("menu");
  const result = byId("result");

  function bindOpts(id: string, cb: (v: string) => void) {
    const box = byId(id);
    const handler = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      box.querySelectorAll("button").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      cb(b.dataset.v as string);
    };
    box.addEventListener("click", handler);
  }
  bindOpts("modeOpts", (v) => {
    G.mode = v as Mode;
    refreshBestLabel();
  });
  bindOpts("lvOpts", (v) => {
    G.level = +v;
    refreshBestLabel();
  });
  refreshBestLabel();

  const onStart = () => startGame();
  const onAgain = () => {
    result.classList.add("hidden");
    startGame();
  };
  const onMenu = () => {
    result.classList.add("hidden");
    menu.classList.remove("hidden");
    G.screen = "menu";
    refreshBestLabel();
  };
  byId("startBtn").addEventListener("click", onStart);
  byId("againBtn").addEventListener("click", onAgain);
  byId("menuBtn").addEventListener("click", onMenu);

  function startGame() {
    Object.assign(G, {
      screen: "play",
      ball: 0,
      score: 0,
      combo: 0,
      perfect: 0,
      good: 0,
      bad: 0,
      miss: 0,
      popups: [],
    });
    G.player = { x: HOME.x, y: HOME.y, tx: HOME.x, ty: HOME.y };
    G.rhythm = 1.0 + Math.random() * 0.3;
    menu.classList.add("hidden");
    byId("hudMode").textContent = modeName(G.mode) + " / Lv." + G.level;
    updateHud();
    nextBall(0.9);
  }

  function updateHud() {
    byId("hudBall").textContent = String(Math.min(G.ball, TOTAL_BALLS));
    byId("hudScore").textContent = String(G.score);
    byId("hudCombo").innerHTML =
      G.combo >= 2
        ? '<span style="color:var(--hot);font-weight:800">' + G.combo + " COMBO</span>"
        : "&nbsp;";
  }

  /* ===== ボール進行 ===== */
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
    G.resolved = false;
    G.reactFactor = 0.35;
    G.speedMult = 0.6; // ステップ前は初動が鈍い
    G.shuttle = null;
    G.marker = null;
    G.returnAnim = null;
    stepBtn.disabled = true;
    updateHud();
  }

  function beginWindup(now: number) {
    G.phase = "windup";
    G.windupStart = now;
    // 基本リズム + 揺らぎ
    const dur = G.rhythm + (Math.random() * 0.24 - 0.12);
    G.hasHoldFeint = false;
    G.holdExtra = 0;
    if (G.level >= 2 && Math.random() < (G.level === 2 ? 0.3 : 0.42)) {
      G.hasHoldFeint = true;
      G.holdExtra = 0.28 + Math.random() * 0.34; // タメ：見た目のリズムより遅れて打つ
    }
    G.expectHit = G.windupStart + dur; // リングが示す「予定」のヒット
    G.hitTime = G.expectHit + G.holdExtra; // 実際のヒット
    // コース決定
    const zs = zones(G.mode);
    G.target = pick(zs);
    G.hasDirFeint = G.level >= 3 && Math.random() < 0.38;
    if (G.hasDirFeint) {
      const others = zs.filter((z) => z !== G.target);
      G.fakeTarget = pick(others.length ? others : zs);
    } else {
      G.fakeTarget = G.target;
    }
    stepBtn.disabled = false;
  }
  function pick<T>(a: T[]): T {
    return a[(Math.random() * a.length) | 0];
  }

  function launch(now: number) {
    G.phase = "flight";
    const deep = G.target!.row === 1;
    G.flightDur = deep ? 1.3 : 0.92;
    // 厳しさ：ホームからの距離で難度係数
    const d = Math.hypot(G.target!.x - HOME.x, G.target!.y - HOME.y);
    G.courseHard = Math.min(1, d / 260);
    G.landTime = now + G.flightDur;
    // 着地点ジッター
    G.land = {
      x: G.target!.x + (Math.random() * 28 - 14),
      y: G.target!.y + (Math.random() * 22 - 11),
    };
    G.fakeLand = G.hasDirFeint
      ? {
          x: G.fakeTarget!.x + (Math.random() * 20 - 10),
          y: G.fakeTarget!.y + (Math.random() * 16 - 8),
        }
      : G.land;
    beep(740, 0.08, "square", 0.12); // 打球音
    // まだ押してなければ猶予内（遅押し）受付は handlePress 側で
  }

  function judgePress(now: number) {
    if (G.pressed) return;
    if (G.phase !== "windup" && G.phase !== "flight") return;
    G.pressed = true;
    const dt = now - G.hitTime; // 負=早い 正=遅い
    let grade: string, factor: number, mult: number;
    const a = Math.abs(dt);
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
      W / 2,
      NET_Y - 36,
      grade === "PERFECT" ? "#ffd76e" : grade === "GOOD" ? "#9fe6b8" : "#ff8b80"
    );
    stepBtnFlash();
  }
  function noPressPenalty() {
    if (G.pressed) return;
    G.pressed = true;
    G.reactGrade = "NO STEP";
    G.reactFactor = 0.35;
    G.speedMult = 0.5;
    G.bad++;
    popup("ノーステップ…", W / 2, NET_Y - 36, "#ff8b80");
  }
  function stepBtnFlash() {
    stepBtn.disabled = true;
  }

  /* リターン解決 */
  function resolveLanding(now: number) {
    G.resolved = true;
    const p = G.player;
    const dist = Math.hypot(p.x - G.land.x, p.y - G.land.y);
    const STRETCH = 86;
    if (dist <= STRETCH) {
      // 返球成功：質を計算
      const posFactor = Math.max(0.25, 1 - Math.max(0, dist - 12) / STRETCH);
      let s = Math.round(100 * (0.6 * G.reactFactor + 0.4 * posFactor));
      s = Math.round(s * (1 + 0.15 * G.courseHard)); // 厳しいコースを返せたら加点
      s = Math.min(120, s);
      G.ballScore = s;
      G.score += s;
      G.combo++;
      const q =
        G.reactFactor >= 0.8 && posFactor >= 0.75
          ? "◎ナイスリターン"
          : posFactor >= 0.5
            ? "○リターン"
            : "△体勢ブレ返球";
      popup(
        "+" + s + " " + q,
        G.land.x,
        G.land.y - 26,
        s >= 90 ? "#ffd76e" : s >= 60 ? "#9fe6b8" : "#ffb29a"
      );
      // 返球アニメ（質が低いほどヨレた軌道）
      G.returnAnim = {
        t: 0,
        dur: 0.65,
        from: { x: G.land.x, y: G.land.y },
        wobble: (1 - posFactor) * 26,
      };
      beep(560, 0.07, "square", 0.1);
    } else {
      G.ballScore = 0;
      G.miss++;
      G.combo = 0;
      popup("ミス！ノータッチ", G.land.x, G.land.y - 26, "#ff6b5e");
      beep(180, 0.25, "sawtooth", 0.14);
    }
    updateHud();
    G.phase = "post";
    G.postUntil = now + 0.95;
  }

  function finish() {
    G.screen = "result";
    G.phase = "idle";
    stepBtn.disabled = true;
    const sc = G.score;
    const max = TOTAL_BALLS * 100;
    const r = sc / max;
    const rank =
      r >= 0.85 ? "S" : r >= 0.7 ? "A" : r >= 0.52 ? "B" : r >= 0.34 ? "C" : "D";
    byId("rankBig").textContent = rank;
    byId("resScore").textContent = String(sc);
    byId("resTitle").textContent = modeName(G.mode) + " / Lv." + G.level;
    byId("stPerfect").textContent = String(G.perfect);
    byId("stGood").textContent = String(G.good);
    byId("stBad").textContent = String(G.bad);
    byId("stMiss").textContent = String(G.miss);
    const nb = byId("newBest");
    nb.style.display = "none";
    const b = loadBest();
    if (b == null || sc > b) {
      nb.style.display = "block";
      saveBest(sc);
    }
    result.classList.remove("hidden");
  }

  /* ===== 入力 ===== */
  const onStepDown = (e: PointerEvent) => {
    e.preventDefault();
    if (G.screen === "play") judgePress(perfNow());
  };
  stepBtn.addEventListener("pointerdown", onStepDown);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (G.screen === "play") judgePress(perfNow());
    }
  };
  window.addEventListener("keydown", onKeyDown);

  const onCvDown = (e: PointerEvent) => {
    if (G.screen !== "play") return;
    const rect = cv.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    if (y < NET_Y + 6) return; // 自陣のみ
    // 打たれる前に動くのは「お見合い」：移動はヒット後のみ有効
    if (G.phase === "flight" || G.phase === "post") {
      G.player.tx = clamp(x, COURT.x + 14, COURT.x + COURT.w - 14);
      G.player.ty = clamp(y, NET_Y + 24, COURT.y + COURT.h - 12);
    }
  };
  cv.addEventListener("pointerdown", onCvDown);

  function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
  }
  function perfNow() {
    return performance.now() / 1000;
  }

  /* ===== ポップアップ文字 ===== */
  function popup(text: string, x: number, y: number, color: string) {
    G.popups.push({ text, x, y, color, t: 0 });
  }

  /* ===== メインループ ===== */
  let rafId = 0;
  function loop(ts: number) {
    const now = ts / 1000;
    const dt = Math.min(0.05, now - (lastTs || now));
    lastTs = now;
    if (G.screen === "play") update(now, dt);
    draw(now);
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  function update(now: number, dt: number) {
    // フェーズ進行
    if (G.phase === "ready") {
      G.t += dt;
      if (G.t >= G.readyDur) beginWindup(now);
    } else if (G.phase === "windup") {
      if (now >= G.hitTime) launch(now);
    } else if (G.phase === "flight") {
      if (!G.pressed && now > G.hitTime + 0.38) noPressPenalty();
      if (now >= G.landTime) resolveLanding(now);
    } else if (G.phase === "post") {
      if (G.returnAnim) {
        G.returnAnim.t += dt;
      }
      // ホームへ自動で戻る
      G.player.tx += (HOME.x - G.player.tx) * dt * 1.6;
      G.player.ty += (HOME.y - G.player.ty) * dt * 1.6;
      if (now >= G.postUntil) nextBall(0.35 + Math.random() * 0.4);
    }
    // プレイヤー移動
    const p = G.player;
    const sp = 360 * (G.phase === "flight" ? G.speedMult : 1) * dt;
    const dx = p.tx - p.x,
      dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const m = Math.min(1, sp / d);
      p.x += dx * m;
      p.y += dy * m;
    }
    // popups
    G.popups.forEach((o) => (o.t += dt));
    G.popups = G.popups.filter((o) => o.t < 1.1);
  }

  /* ===== 描画 ===== */
  function draw(now: number) {
    ctx.clearRect(0, 0, W, H);
    // 床
    ctx.fillStyle = "#10141a";
    ctx.fillRect(0, 0, W, H);
    // コート
    roundRect(COURT.x - 14, COURT.y - 12, COURT.w + 28, COURT.h + 24, 10, "#1c5a44");
    roundRect(COURT.x, COURT.y, COURT.w, COURT.h, 4, "var-court");
    ctx.fillStyle = "#2e8b6a";
    ctx.fillRect(COURT.x, COURT.y, COURT.w, COURT.h);
    // 奥側を少し暗く（遠近の気配）
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.fillRect(COURT.x, COURT.y, COURT.w, NET_Y - COURT.y);
    // ライン
    ctx.strokeStyle = "#f2f5f0";
    ctx.lineWidth = 2;
    ctx.strokeRect(COURT.x, COURT.y, COURT.w, COURT.h);
    line(COURT.x, NET_Y, COURT.x + COURT.w, NET_Y, 3); // ネット
    // ネット支柱風
    ctx.fillStyle = "#dfe6df";
    ctx.fillRect(COURT.x - 6, NET_Y - 10, 4, 20);
    ctx.fillRect(COURT.x + COURT.w + 2, NET_Y - 10, 4, 20);
    // サービスライン等（雰囲気）
    const ssl = NET_Y + (COURT.y + COURT.h - NET_Y) * 0.28;
    line(COURT.x, ssl, COURT.x + COURT.w, ssl, 1);
    line(W / 2, ssl, W / 2, COURT.y + COURT.h, 1);
    const dl = COURT.y + COURT.h - 26;
    line(COURT.x, dl, COURT.x + COURT.w, dl, 1);

    // ゾーンガイド（薄く）
    if (G.screen === "play") {
      zones(G.mode).forEach((z) => {
        ctx.beginPath();
        ctx.arc(z.x, z.y, 26, 0, 7);
        ctx.strokeStyle = "rgba(255,255,255,.10)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    drawKnocker(now);
    drawTimingRing(now);
    drawMarkerAndShuttle(now);
    drawPlayer(now);
    drawReturn();
    drawPopups();
  }

  function roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: string
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill === "var-court" ? "#2e8b6a" : fill;
    ctx.fill();
  }
  function line(x1: number, y1: number, x2: number, y2: number, w: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = w;
    ctx.strokeStyle = "#f2f5f0";
    ctx.stroke();
  }

  /* ノッカー */
  function drawKnocker(now: number) {
    const k = KNOCKER;
    let armAng = -0.5; // 待機
    let flash = 0;
    if (G.phase === "windup") {
      // 予定リズムに沿って振りかぶる。タメ中は引いたまま静止 → 観察で見破れる
      const prog = Math.min(
        1,
        (now - G.windupStart) / Math.max(0.01, G.expectHit - G.windupStart)
      );
      armAng = -0.5 - prog * 1.5;
      if (now > G.expectHit) armAng = -2.0 + Math.sin(now * 14) * 0.04; // タメの揺れ
    } else if (G.phase === "flight" && now - G.hitTime < 0.18) {
      armAng = 0.7;
      flash = 1 - (now - G.hitTime) / 0.18;
    } else if (G.phase === "flight" || G.phase === "post") {
      armAng = 0.2;
    }
    // 影
    ctx.beginPath();
    ctx.ellipse(k.x, k.y + 20, 22, 7, 0, 0, 7);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fill();
    // 体
    ctx.beginPath();
    ctx.arc(k.x, k.y, 15, 0, 7);
    ctx.fillStyle = "#3a4856";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#a9b8c6";
    ctx.stroke();
    // 腕＋ラケット
    const ax = k.x + Math.cos(armAng) * 26,
      ay = k.y + Math.sin(armAng) * 26;
    ctx.beginPath();
    ctx.moveTo(k.x, k.y);
    ctx.lineTo(ax, ay);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#a9b8c6";
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(ax, ay, 8, 11, armAng, 0, 7);
    ctx.fillStyle = "#222a32";
    ctx.fill();
    ctx.strokeStyle = "#cfd9e2";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (flash > 0) {
      ctx.beginPath();
      ctx.arc(ax, ay, 16 + 14 * (1 - flash), 0, 7);
      ctx.strokeStyle = "rgba(255,215,110," + flash + ")";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // 構え中の手元シャトル
    if (G.phase === "windup" || G.phase === "ready") {
      ctx.beginPath();
      ctx.arc(k.x - 14, k.y + 6, 4, 0, 7);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
  }

  /* タイミングリング：ノッカーの「リズム」を示す。タメフェイント時はリズムより実打が遅れる */
  function drawTimingRing(now: number) {
    if (G.phase !== "windup") return;
    const k = KNOCKER;
    const total = G.expectHit - G.windupStart;
    const remain = G.expectHit - now;
    const prog = clamp(1 - remain / total, 0, 1);
    const r = 56 - 38 * prog;
    ctx.beginPath();
    ctx.arc(k.x, k.y, Math.max(18, r), 0, 7);
    ctx.strokeStyle = remain < 0 ? "rgba(255,107,94,.9)" : "rgba(255,180,84,.85)";
    ctx.lineWidth = remain < 0 ? 3.5 : 2.5;
    ctx.setLineDash(remain < 0 ? [4, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    // 基準円
    ctx.beginPath();
    ctx.arc(k.x, k.y, 18, 0, 7);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* 落下マーカー＆シャトル */
  function drawMarkerAndShuttle(now: number) {
    if (G.phase !== "flight") return;
    const ft = clamp((now - G.hitTime) / G.flightDur, 0, 1);
    // マーカー：方向フェイント時は最初の0.32秒だけ偽コース表示
    const showFake = G.hasDirFeint && now - G.hitTime < 0.32;
    const m = showFake ? G.fakeLand : G.land;
    const pulse = 1 + Math.sin(now * 10) * 0.08;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 18 * pulse, 0, 7);
    ctx.strokeStyle = showFake ? "rgba(255,255,255,.5)" : "rgba(255,180,84,.95)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(m.x, m.y, 3, 0, 7);
    ctx.fillStyle = showFake ? "rgba(255,255,255,.6)" : "#ffb454";
    ctx.fill();

    // シャトル軌道：偽コース方向へ膨らむ2次ベジェ
    const sx = KNOCKER.x,
      sy = KNOCKER.y;
    const cx = (G.fakeLand.x + G.land.x) / 2,
      cyRaw = (G.fakeLand.y + G.land.y) / 2;
    const cy = Math.min(cyRaw, NET_Y) - (G.target!.row === 1 ? 60 : 20); // 山なり
    const bx = lerp3(sx, cx, G.land.x, ft);
    const by = lerp3(sy, cy, G.land.y, ft);
    // 影
    const gy = lerp(sy, G.land.y, ft);
    ctx.beginPath();
    ctx.ellipse(bx, Math.max(by + 8, gy), 6, 2.5, 0, 0, 7);
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fill();
    // シャトル本体（高さで拡縮）
    const h = Math.sin(ft * Math.PI);
    const sR = 5 + h * 3;
    ctx.beginPath();
    ctx.arc(bx, by - h * 26, sR, 0, 7);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by - h * 26 + sR * 0.5, sR * 0.55, 0, 7);
    ctx.fillStyle = "#ffb454";
    ctx.fill();
  }
  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }
  function lerp3(a: number, c: number, b: number, t: number) {
    const u = 1 - t;
    return u * u * a + 2 * u * t * c + t * t * b;
  }

  /* プレイヤー */
  function drawPlayer(now: number) {
    const p = G.player;
    // 体勢ブレ：反応が悪いほど揺れる
    let wob = 0;
    if (
      (G.phase === "flight" || G.phase === "post") &&
      G.reactFactor &&
      G.reactFactor < 0.8
    ) {
      wob = (0.8 - G.reactFactor) * 10 * Math.sin(now * 18);
    }
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 18, 20, 6, 0, 0, 7);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x + wob, p.y, 16, 0, 7);
    ctx.fillStyle = "#ff6b5e";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ffd1c8";
    ctx.stroke();
    // ラケット
    ctx.beginPath();
    ctx.ellipse(p.x + wob + 18, p.y - 12, 6, 9, 0.5, 0, 7);
    ctx.fillStyle = "#222a32";
    ctx.fill();
    ctx.strokeStyle = "#ffd1c8";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 目標地点
    if (G.phase === "flight") {
      ctx.beginPath();
      ctx.arc(p.tx, p.ty, 6, 0, 7);
      ctx.strokeStyle = "rgba(255,255,255,.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /* 返球アニメ */
  function drawReturn() {
    const r = G.returnAnim;
    if (!r || r.t >= r.dur) return;
    const t = r.t / r.dur;
    const x = lerp(r.from.x, KNOCKER.x, t) + Math.sin(t * 9) * r.wobble * (1 - t);
    const yArc = Math.sin(t * Math.PI) * 70;
    const y = lerp(r.from.y, KNOCKER.y, t) - yArc;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 7);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  /* ポップアップ */
  function drawPopups() {
    G.popups.forEach((o) => {
      const a = 1 - o.t / 1.1;
      ctx.font = "800 17px sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(10,13,17," + a * 0.8 + ")";
      ctx.strokeText(o.text, o.x, o.y - o.t * 26);
      ctx.fillStyle = o.color.startsWith("#") ? hexA(o.color, a) : o.color;
      ctx.fillText(o.text, o.x, o.y - o.t * 26);
    });
    ctx.textAlign = "start";
  }
  function hexA(hex: string, a: number) {
    const n = parseInt(hex.slice(1), 16);
    return (
      "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"
    );
  }

  /* ===== クリーンアップ ===== */
  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", fit);
    window.removeEventListener("keydown", onKeyDown);
    stepBtn.removeEventListener("pointerdown", onStepDown);
    cv.removeEventListener("pointerdown", onCvDown);
    byId("startBtn").removeEventListener("click", onStart);
    byId("againBtn").removeEventListener("click", onAgain);
    byId("menuBtn").removeEventListener("click", onMenu);
    if (AC) {
      AC.close();
      AC = null;
    }
  };
}
