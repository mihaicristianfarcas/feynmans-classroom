import { useEffect, useRef } from "react";
import { normalize, type Scene } from "../../../shared/scene/index.ts";
import { type PlayerOptions, ScenePlayer } from "./player";
import "./scene.css";

interface Props {
  spec: unknown;
  theme: "light" | "dark";
  fig?: string;
  predict?: boolean;
  compact?: boolean;
  autoplay?: boolean;
  onEvent?: PlayerOptions["onEvent"];
  className?: string;
}

/** A scene in the universal frame. Rebuilt when the spec changes; the theme switches in place. */
export function SceneView({ spec, theme, fig, predict = true, compact, autoplay, onEvent, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const player = useRef<ScenePlayer | null>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const key = JSON.stringify(spec);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the player is rebuilt only when the spec's content (key) changes; the theme reaches it below, and autoplay applies to a new player only
  useEffect(() => {
    if (!ref.current) return;
    let scene: Scene;
    try {
      scene = normalize(spec);
    } catch (error) {
      ref.current.textContent = `This figure could not be read: ${(error as Error).message}`;
      return;
    }
    const p = new ScenePlayer(ref.current, scene, {
      theme,
      fig,
      predict,
      compact,
      autoplay,
      onEvent: (e) => handler.current?.(e),
    });
    player.current = p;
    if (import.meta.env.DEV) {
      // expose players to browser tests and the console in development
      const w = window as unknown as { __players?: ScenePlayer[] };
      w.__players ??= [];
      w.__players.push(p);
    }
    return () => {
      p.destroy();
      player.current = null;
    };
  }, [key, fig, predict, compact]);
  useEffect(() => {
    player.current?.setTheme(theme);
  }, [theme]);
  return <div ref={ref} className={className} />;
}
