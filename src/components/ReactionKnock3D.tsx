"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createReactionKnock3D,
  getBest,
  modeName,
  type Mode,
  type ReactionKnock3DController,
  type HudData,
  type ResultData,
} from "@/game/reaction-knock-3d/engine";
import "./reaction-knock-3d.css";

type Screen = "menu" | "play" | "result";

const MODE_OPTS: { v: Mode; label: string; sub: string }[] = [
  { v: "short", label: "オールショート", sub: "前6点" },
  { v: "long", label: "オールロング", sub: "奥6点" },
  { v: "free", label: "フリー", sub: "全面" },
];
const LV_OPTS: { v: number; label: string; sub: string }[] = [
  { v: 1, label: "Lv.1", sub: "正直" },
  { v: 2, label: "Lv.2", sub: "タメあり" },
  { v: 3, label: "Lv.3", sub: "フェイント" },
];

export default function ReactionKnock3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<ReactionKnock3DController | null>(null);

  const [screen, setScreen] = useState<Screen>("menu");
  const [mode, setMode] = useState<Mode>("short");
  const [level, setLevel] = useState(1);
  const [hud, setHud] = useState<HudData>({
    ball: 0,
    total: 20,
    score: 0,
    combo: 0,
    modeLabel: "",
  });
  const [result, setResult] = useState<ResultData | null>(null);
  const [bestLabel, setBestLabel] = useState("自己ベスト：—");

  // エンジン生成（マウント時のみ）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctrl = createReactionKnock3D(canvas, {
      onHud: setHud,
      onResult: (r) => {
        setResult(r);
        setScreen("result");
      },
    });
    ctrlRef.current = ctrl;
    return () => {
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, []);

  // 自己ベストラベル
  useEffect(() => {
    const b = getBest(mode, level);
    setBestLabel(
      "自己ベスト（" +
        modeName(mode) +
        " / Lv." +
        level +
        "）：" +
        (b == null ? "—" : b + "点")
    );
  }, [mode, level]);

  const step = useCallback(() => {
    ctrlRef.current?.step();
  }, []);

  // スペースキーでステップ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (screen === "play") step();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, step]);

  const startGame = () => {
    ctrlRef.current?.start(mode, level);
    setScreen("play");
  };

  return (
    <div className="rk3d">
      <canvas ref={canvasRef} className="stage" />

      {/* HUD */}
      {screen === "play" && (
        <div className="hud">
          <div>
            <div className="sub">{hud.modeLabel}</div>
            <div className="big">
              {hud.ball}
              <span className="sub"> / {hud.total}球</span>
            </div>
          </div>
          <div className="right">
            <div className="combo">{hud.combo >= 2 ? `${hud.combo} COMBO` : " "}</div>
            <div className="big">{hud.score}</div>
          </div>
        </div>
      )}

      {/* ステップボタン */}
      {screen === "play" && (
        <div className="controls">
          <button
            className="stepBtn"
            onPointerDown={(e) => {
              e.preventDefault();
              step();
            }}
          >
            ステップ！
          </button>
          <div className="hint">ノッカーが打つ瞬間にボタン（PCはスペースキー）／落下点をタップで移動</div>
        </div>
      )}

      {/* メニュー */}
      {screen === "menu" && (
        <div className="overlay">
          <div className="panel">
            <h1>
              <small>REACTION STEP KNOCK 3D</small>リアクションステップ・ノック
            </h1>
            <p className="lead">
              ① ノッカーが打つ<b>瞬間</b>に「ステップ！」（PCはスペース）
              <br />② シャトルの落下点をタップして移動 → 届けば自動リターン
              <br />
              ステップの精度が高いほど初動が速く、体勢が安定して<b>リターンの質</b>が上がる。
            </p>
            <div className="optgroup">
              <div className="label">メニュー</div>
              <div className="opts">
                {MODE_OPTS.map((o) => (
                  <button
                    key={o.v}
                    className={mode === o.v ? "sel" : ""}
                    onClick={() => setMode(o.v)}
                  >
                    {o.label}
                    <span className="sub">{o.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="optgroup">
              <div className="label">ノッカーのレベル</div>
              <div className="opts">
                {LV_OPTS.map((o) => (
                  <button
                    key={o.v}
                    className={level === o.v ? "sel" : ""}
                    onClick={() => setLevel(o.v)}
                  >
                    {o.label}
                    <span className="sub">{o.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <button className="primary" onClick={startGame}>
              ノック開始
            </button>
            <div className="best">{bestLabel}</div>
          </div>
        </div>
      )}

      {/* リザルト */}
      {screen === "result" && result && (
        <div className="overlay">
          <div className="panel">
            <h1>
              <small>RESULT</small>
              {result.title}
            </h1>
            <div className="rankBig">{result.rank}</div>
            {result.newBest && <div className="newBest">★ NEW RECORD ★</div>}
            <div className="resultScore">
              スコア <b>{result.score}</b> 点
            </div>
            <div className="stats">
              <div className="stat">
                <div className="v">{result.perfect}</div>
                <div className="k">PERFECT</div>
              </div>
              <div className="stat">
                <div className="v">{result.good}</div>
                <div className="k">GOOD</div>
              </div>
              <div className="stat">
                <div className="v">{result.bad}</div>
                <div className="k">体勢ブレ</div>
              </div>
              <div className="stat">
                <div className="v">{result.miss}</div>
                <div className="k">ミス（ノータッチ）</div>
              </div>
            </div>
            <button className="primary" onClick={startGame}>
              もう一度
            </button>
            <button
              className="ghost"
              onClick={() => {
                setScreen("menu");
                setResult(null);
              }}
            >
              メニューに戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
