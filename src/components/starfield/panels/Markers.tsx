import { useRef } from "react";
import { usePainter, useGame } from "@/components/starfield/kit";
import { bodiesIn } from "@/components/starfield/system";

/** A label on each place in view. Moved every frame, so the frame writes them directly. */
export function Markers() {
  const chapterId = useGame((game) => game.chapterId);
  const charted = useGame((game) => game.charted);
  const nodes = useRef<Record<string, HTMLSpanElement | null>>({});
  const refs = useRef<Record<string, (node: HTMLSpanElement | null) => void>>({});

  const markerRef = (id: string) => {
    let ref = refs.current[id];
    if (!ref) {
      ref = (node: HTMLSpanElement | null) => {
        nodes.current[id] = node;
        if (node) node.hidden = true;
      };
      refs.current[id] = ref;
    }
    return ref;
  };

  usePainter(({ markers }) => {
    for (const body of bodiesIn(chapterId)) {
      const el = nodes.current[body.id];
      if (!el) continue;
      const marker = markers.find((item) => item.id === body.id);
      if (!marker) {
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      const label = charted.includes(body.id) ? `${marker.name} ✓` : marker.name;
      if (el.textContent !== label) el.textContent = label;
      el.style.left = `${(marker.x * 100).toFixed(1)}%`;
      el.style.top = `${(marker.y * 100).toFixed(1)}%`;
      el.classList.toggle("is-target", marker.primary);
      el.classList.toggle("is-charted", charted.includes(body.id));
    }
  });

  return (
    <div className="markers" aria-hidden="true">
      {bodiesIn(chapterId).map((body) => (
        <span key={body.id} className="marker" data-id={body.id} ref={markerRef(body.id)} />
      ))}
    </div>
  );
}
