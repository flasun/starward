import { useRef } from "react";
import { useGame, useKit, usePainter } from "@/components/starfield/kit";
import type { PlotBlip } from "@/components/starfield/types";

/** SVG for the plot: orbit rings, a blip per place, stations, and the ship. Names only on the large map. */
function drawPlot(blips: PlotBlip[], named: boolean): string {
  const labels: { x: number; y: number }[] = [];
  return blips
    .map((blip) => {
      const cx = 50 + blip.x;
      const cy = 50 - blip.y;
      if (blip.ring) {
        return `<circle cx="50" cy="50" r="${blip.r.toFixed(2)}" class="orbit-line" />`;
      }
      if (blip.ship) {
        const deg = ((-(blip.heading ?? 0) * 180) / Math.PI).toFixed(1);
        return `<path class="plot-ship" transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${deg})" d="M0 -3.1 L1.6 2.5 L0 1.15 L-1.6 2.5 Z" />`;
      }
      const cls = blip.target ? "blip is-target" : blip.close ? "blip is-close" : "blip";
      const mark = blip.depot
        ? `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(blip.r + 1.3).toFixed(2)}" class="blip is-station" />`
        : "";
      let text = "";
      if (named && blip.name) {
        let ly = cy - blip.r - 1.5;
        const crowded = labels.some((other) => Math.hypot(other.x - cx, other.y - ly) < 3.2);
        if (crowded) ly -= 2.6;
        labels.push({ x: cx, y: ly });
        text = `<text x="${cx.toFixed(2)}" y="${ly.toFixed(2)}" class="atlas-name">${blip.name}</text>`;
      }
      return `${mark}<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${blip.r.toFixed(2)}" class="${cls}" />${text}`;
    })
    .join("");
}

function paint(node: SVGGElement | null, svg: string) {
  if (node && node.dataset.draw !== svg) {
    node.dataset.draw = svg;
    node.innerHTML = svg;
  }
}

/** The minimap in the corner, and the system map it opens. */
export function Plot() {
  const { store } = useKit();
  const atlasOpen = useGame((game) => game.atlasOpen);
  const plotRef = useRef<SVGGElement>(null);
  const atlasRef = useRef<SVGGElement>(null);

  usePainter(({ plot }) => {
    paint(plotRef.current, drawPlot(plot, false));
    if (atlasRef.current) paint(atlasRef.current, drawPlot(plot, true));
  });

  const close = () => store.setState({ atlasOpen: false });

  return (
    <>
      <button
        type="button"
        className="plot-btn"
        data-hud
        aria-expanded={atlasOpen}
        aria-label="Open the system map"
        onClick={() => store.setState({ atlasOpen: true })}
      >
        <svg className="plot" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="plot-ring" cx="50" cy="50" r="46" />
          <g ref={plotRef} />
        </svg>
      </button>
      {atlasOpen ? (
        <div className="atlas" data-hud role="presentation" onClick={close}>
          <div className="atlas-card" role="dialog" aria-label="System map" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="brief-close" onClick={close}>
              Close
            </button>
            <svg className="atlas-map" viewBox="0 0 100 100">
              <circle className="plot-ring" cx="50" cy="50" r="46" />
              <g ref={atlasRef} />
            </svg>
          </div>
        </div>
      ) : null}
    </>
  );
}
