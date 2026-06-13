import GameCanvas from "@/components/GameCanvas";
import "./babylon.css";

/**
 * Babylon.js 3D デモ（将来の 3D 化に向けた土台）。
 * メインの 2D ゲームとは別ルートとして保持する。
 */
export default function BabylonDemo() {
  return (
    <main className="babylon-stage">
      <GameCanvas />
    </main>
  );
}
