"use client";

import { useEffect, useRef } from "react";
import { createGame, type GameHandles } from "@/game/createScene";

/**
 * Babylon.js のキャンバスをマウントし、シーンのライフサイクルを管理するクライアントコンポーネント。
 * StrictMode の二重マウントは next.config.ts で無効化済み（reactStrictMode: false）。
 */
export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let handles: GameHandles | null = null;
    let cancelled = false;

    createGame(canvas)
      .then((h) => {
        if (cancelled) {
          h.dispose();
          return;
        }
        handles = h;
      })
      .catch((err) => {
        console.error("[GameCanvas] シーン初期化に失敗しました:", err);
      });

    return () => {
      cancelled = true;
      handles?.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} />;
}
