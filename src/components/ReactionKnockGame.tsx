"use client";

import { useEffect } from "react";
import { initReactionKnock } from "@/game/reaction-knock/engine";
import "./reaction-knock.css";

/**
 * リアクションステップ・ノック本体。
 * 元 HTML の body マークアップを JSX で再現し、エンジンを useEffect で起動する。
 * エンジンは document.getElementById で各要素を参照するため、id は元実装と一致させている。
 */
export default function ReactionKnockGame() {
  useEffect(() => {
    const dispose = initReactionKnock();
    return dispose;
  }, []);

  return (
    <div className="rsk">
      <div id="wrap">
        <div id="hud">
          <div>
            <div id="hudMode">—</div>
            <div className="big">
              <span id="hudBall">0</span>
              <span style={{ fontSize: 13, color: "var(--sub)" }}> / 20球</span>
            </div>
          </div>
          <div className="right">
            <div id="hudCombo">{" "}</div>
            <div className="big" id="hudScore">
              0
            </div>
          </div>
        </div>
        <canvas id="cv"></canvas>
        <button id="stepBtn" disabled>
          ステップ！
        </button>
        <div id="hint">ノッカーが打つ瞬間にボタン（PCはスペースキー）</div>
      </div>

      {/* メニュー */}
      <div className="overlay" id="menu">
        <div className="panel">
          <h1>
            <small>REACTION STEP KNOCK</small>リアクションステップ・ノック
          </h1>
          <p className="lead">
            ① ノッカーが打つ
            <b style={{ color: "var(--accent)" }}>瞬間</b>
            に「ステップ！」を押す（リアクションステップ）
            <br />② 球の落下点をタップして移動 → 届けば自動でリターン
            <br />
            ステップの精度が高いほど初動が速く、体勢が安定して
            <b style={{ color: "var(--accent)" }}>リターンの質</b>が上がる。
          </p>
          <div className="optgroup">
            <div className="label">メニュー</div>
            <div className="opts" id="modeOpts">
              <button data-v="short" className="sel">
                オールショート<span className="sub">前6点</span>
              </button>
              <button data-v="long">
                オールロング<span className="sub">奥6点</span>
              </button>
              <button data-v="free">
                フリー<span className="sub">全面</span>
              </button>
            </div>
          </div>
          <div className="optgroup">
            <div className="label">ノッカーのレベル</div>
            <div className="opts" id="lvOpts">
              <button data-v="1" className="sel">
                Lv.1<span className="sub">正直</span>
              </button>
              <button data-v="2">
                Lv.2<span className="sub">タメあり</span>
              </button>
              <button data-v="3">
                Lv.3<span className="sub">フェイント</span>
              </button>
            </div>
          </div>
          <button id="startBtn">ノック開始</button>
          <div id="best">自己ベスト：—</div>
        </div>
      </div>

      {/* リザルト */}
      <div className="overlay hidden" id="result">
        <div className="panel">
          <h1>
            <small>RESULT</small>
            <span id="resTitle">ノック終了</span>
          </h1>
          <div id="rankBig">A</div>
          <div id="newBest">★ NEW RECORD ★</div>
          <div id="resultScore">
            スコア <b id="resScore">0</b> 点
          </div>
          <div className="stats">
            <div className="stat">
              <div className="v" id="stPerfect">
                0
              </div>
              <div className="k">PERFECT</div>
            </div>
            <div className="stat">
              <div className="v" id="stGood">
                0
              </div>
              <div className="k">GOOD</div>
            </div>
            <div className="stat">
              <div className="v" id="stBad">
                0
              </div>
              <div className="k">体勢ブレ</div>
            </div>
            <div className="stat">
              <div className="v" id="stMiss">
                0
              </div>
              <div className="k">ミス（ノータッチ）</div>
            </div>
          </div>
          <button id="againBtn">もう一度</button>
          <button id="menuBtn">メニューに戻る</button>
        </div>
      </div>
    </div>
  );
}
