/* The figure gallery (#/gallery): every reference scene, the visual test bench for the scene engine. */
import { useEffect, useState } from "react";
import { EXAMPLES } from "../../../shared/scene/examples.ts";
import { SceneView } from "../scene/SceneView";

/** The reference scenes, one per card: the visual test bench for the scene engine (?dev=1 adds generated ones). */
export function Gallery({ theme }: { theme: "light" | "dark" }) {
  const query = new URLSearchParams(location.hash.split("?")[1] || "");
  const only = query.get("only");
  const [specs, setSpecs] = useState<Record<string, unknown>>(query.get("dev") ? {} : EXAMPLES);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, for the query the page was opened with
  useEffect(() => {
    if (query.get("dev"))
      fetch("/api/dev/scenes")
        .then((r) => r.json())
        .then(setSpecs, () => setSpecs({}));
  }, []);
  const names = Object.keys(specs).filter((name) => !only || only.split(",").includes(name));
  return (
    <div className="gallery">
      <h1 className="page-title">Figure gallery</h1>
      <p className="lede">The reference figures every generated one follows: same frame, same finish, four kinds.</p>
      <div className="gallery-grid">
        {names.map((name, i) => (
          <section key={name} className="gallery-item" data-example={name}>
            <SceneView spec={specs[name]} theme={theme} fig={`Fig 0.${i + 1}`} predict={false} />
          </section>
        ))}
      </div>
    </div>
  );
}
