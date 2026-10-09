import { useRef } from "react";
import * as Slider from "@radix-ui/react-slider";
import { Volume2, VolumeX } from "lucide-react";
import { useActions, useGame, useKit, usePainter } from "@/components/starfield/kit";
import { OrbitLevels } from "@/components/starfield/panels/OrbitLevels";
import { type BodyDef, bodyById, goalsIn, navIn, nextInNav } from "@/components/starfield/system";
import { STATION_LIMIT, stationCost, stationsIn } from "@/components/starfield/trade";
import type { CameraView } from "@/components/starfield/types";

const VIEWS: Record<CameraView, { label: string; tip: string }> = {
  cockpit: { label: "Cockpit", tip: "Look out the nose" },
  chase: { label: "Chase", tip: "Camera behind the ship" },
  left: { label: "Left", tip: "Camera off the left wing" },
  right: { label: "Right", tip: "Camera off the right wing" },
  above: { label: "Above", tip: "Overhead. Each press steps left, center, then right." },
};

/** The controls along the bottom: the flight line, and the nav list or More panel above it. */
export function Dock() {
  const moreOpen = useGame((game) => game.moreOpen);
  const navOpen = useGame((game) => game.navOpen);
  return (
    <footer data-hud className="dock">
      <div className="dock-bar">
        {moreOpen ? <MorePanel /> : null}
        {navOpen ? <NavList /> : null}
        <FlightLine />
      </div>
    </footer>
  );
}

function FlightLine() {
  const { toggleNav, toggleAutopilot, setSpeed, cycleView, toggleMore } = useActions();
  const target = useGame((game) => bodyById(game.targetId));
  const navOpen = useGame((game) => game.navOpen);
  const moreOpen = useGame((game) => game.moreOpen);
  const autopilot = useGame((game) => game.autopilot);
  const speed = useGame((game) => game.speed);
  const view = useGame((game) => game.view);
  const aboveSide = useGame((game) => game.aboveSide);
  const rangeRef = useRef<HTMLElement>(null);

  usePainter(({ rangeText }) => {
    const range = rangeRef.current;
    if (range && range.textContent !== rangeText) range.textContent = rangeText;
  });

  const above = aboveSide < 0 ? "Above L" : aboveSide > 0 ? "Above R" : "Above";
  const viewName = view === "above" ? above : VIEWS[view].label;
  const viewTip =
    view === "above"
      ? aboveSide < 0
        ? "Overhead, from the left"
        : aboveSide > 0
          ? "Overhead, from the right"
          : "Overhead, from the center"
      : VIEWS[view].tip;

  return (
    <div className="flight-line">
      <div className="nav-row">
        <button type="button" className="nav-target" data-tip="Choose where to fly" aria-expanded={navOpen} onClick={toggleNav}>
          {target.name}
          <small ref={rangeRef}>—</small>
        </button>
        <button
          type="button"
          data-tip="Fly to the selected place"
          className="go-btn"
          aria-pressed={autopilot}
          aria-label={autopilot ? `Stop flying to ${target.name}` : `Fly to ${target.name}`}
          onClick={toggleAutopilot}
        >
          {autopilot ? "Stop" : "Go"}
        </button>
      </div>
      <div className="throttle speed-row" data-tip="Cruise speed. The warp number follows.">
        <Slider.Root
          className="slider"
          aria-label="Speed"
          min={0}
          max={1}
          step={0.005}
          value={[speed]}
          onValueChange={([value]) => setSpeed(value ?? 0)}
        >
          <Slider.Track className="slider-track">
            <Slider.Range className="slider-range" />
          </Slider.Track>
          <Slider.Thumb className="slider-thumb" aria-label="Speed">
            <span />
          </Slider.Thumb>
        </Slider.Root>
      </div>
      <button
        type="button"
        className="view-cycle"
        data-tip={viewTip}
        aria-label={`Camera is ${viewName}. Switch camera.`}
        onClick={cycleView}
      >
        {viewName}
      </button>
      <button
        type="button"
        className="more-btn"
        data-tip="Boost, orbit, horizon, stars, and full screen"
        aria-pressed={moreOpen}
        aria-expanded={moreOpen}
        aria-label={moreOpen ? "Hide extra controls" : "Show extra controls"}
        onClick={toggleMore}
      >
        {moreOpen ? "Less" : "More"}
      </button>
    </div>
  );
}

/** The nav groups places by kind: Star, Planets, Moons, and so on. */
function navSections(bodies: BodyDef[]) {
  const sections: { group: string; bodies: BodyDef[] }[] = [];
  for (const body of bodies) {
    const last = sections[sections.length - 1];
    if (!last || last.group !== body.group) sections.push({ group: body.group, bodies: [body] });
    else last.bodies.push(body);
  }
  return sections;
}

function placeNote(body: BodyDef, charted: boolean): string {
  if (charted) return "Charted";
  if (body.tag) return body.tag;
  if (body.place) return body.place;
  return body.au === 0 ? "Star" : `${body.au.toFixed(2)} AU`;
}

function NavList() {
  const { pickTarget, stepTour } = useActions();
  const chapterId = useGame((game) => game.chapterId);
  const targetId = useGame((game) => game.targetId);
  const charted = useGame((game) => game.charted);
  const next = nextInNav(chapterId, targetId);

  return (
    <ul className="nav-list">
      {navSections(navIn(chapterId)).map((section) => (
        <li key={section.group} className="nav-section">
          <p className="nav-group">{section.group}</p>
          <ul>
            {section.bodies.map((body) => (
              <li key={body.id}>
                <button
                  type="button"
                  aria-current={body.id === targetId ? "true" : undefined}
                  onClick={() => pickTarget(body.id)}
                >
                  {body.name}
                  <span>{placeNote(body, charted.includes(body.id))}</span>
                </button>
              </li>
            ))}
            {section.group === "Star" ? (
              <li>
                <button
                  type="button"
                  className="nav-next"
                  data-tip="Fly to the next place"
                  aria-label={`Next, fly to ${next?.name ?? "the next place"}`}
                  onClick={stepTour}
                >
                  Next
                </button>
              </li>
            ) : null}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function MorePanel() {
  const { store, engine, stage, shipAt } = useKit();
  const { toggleBoost, deployStation, toggleMuted, setDensity, notify } = useActions();
  const boost = useGame((game) => game.boost);
  const cost = useGame((game) => stationCost(game.chapterId));
  const canDeploy = useGame(
    (game) =>
      !game.nearId &&
      game.credits >= stationCost(game.chapterId) &&
      stationsIn(game.depots, game.chapterId).length < STATION_LIMIT,
  );
  const targetId = useGame((game) => game.targetId);
  const noseLevel = useGame((game) => game.noseLevel);
  const muted = useGame((game) => game.muted);
  const gazeOn = useGame((game) => game.gazeOn);
  const full = useGame((game) => game.full);
  const density = useGame((game) => game.density);

  const toggleFull = () => {
    const node = stage.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void node.requestFullscreen().catch(() => {});
  };

  const share = () => {
    const { chapterId, charted } = store.getState();
    const goals = goalsIn(chapterId);
    const done = goals.filter((body) => charted.includes(body.id)).length;
    const url = new URL(window.location.href);
    url.searchParams.set("target", targetId);
    const text = `${done} of ${goals.length} charted in Starward.`;
    const whole = `${text} ${url.toString()}`;
    const copied = () => notify("Link copied");
    if (navigator.share) {
      void navigator.share({ title: "Starward", text, url: url.toString() }).catch(() => {
        void navigator.clipboard?.writeText(whole).then(copied).catch(() => notify(whole));
      });
      return;
    }
    void navigator.clipboard?.writeText(whole).then(copied).catch(() => notify(whole));
  };

  return (
    <div className="more-panel">
      <div className="actions">
        <button type="button" data-tip="Burn harder for a while. Leaves an orbit." aria-pressed={boost} onClick={toggleBoost}>
          Boost
        </button>
        <button
          type="button"
          data-tip="Deploy in open space, away from a world. It pays you over time."
          disabled={!canDeploy}
          onClick={() => deployStation(shipAt.current, Date.now())}
        >
          Deploy · {cost}
        </button>
        <OrbitLevels id={targetId} />
        <button
          type="button"
          data-tip="Level the nose"
          aria-pressed={noseLevel}
          aria-label="Level the nose to the horizon"
          onClick={() => engine.current?.level()}
        >
          Horizon
        </button>
        <button
          type="button"
          className="icon-btn"
          data-tip={muted ? "Turn the engine sound on" : "Turn the engine sound off"}
          aria-pressed={!muted}
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={toggleMuted}
        >
          {muted ? <VolumeX size={16} strokeWidth={1.75} /> : <Volume2 size={16} strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          data-tip="Fly hands-free with your eyes. The camera stays on this device."
          aria-pressed={gazeOn}
          onClick={() => store.setState({ gazeOn: !gazeOn })}
        >
          Gaze
        </button>
        <button type="button" data-tip={full ? "Leave full screen" : "Fill the screen"} aria-pressed={full} onClick={toggleFull}>
          {full ? "Exit" : "Full"}
        </button>
        <button type="button" data-tip="Copy a link to this place and your chart count" onClick={share}>
          Share
        </button>
      </div>
      <p className="more-note">Sizes and years are real. Distances are compressed so a flight can cross them.</p>
      <div className="slider-row density-row" data-tip="How many stars fill the sky.">
        <span id="density-label" className="slider-label">
          Stars
        </span>
        <Slider.Root
          className="slider"
          aria-labelledby="density-label"
          min={0}
          max={1}
          step={0.005}
          value={[density]}
          onValueChange={([value]) => setDensity(value ?? 0)}
        >
          <Slider.Track className="slider-track">
            <Slider.Range className="slider-range" />
          </Slider.Track>
          <Slider.Thumb className="slider-thumb" aria-label="Stars">
            <span />
          </Slider.Thumb>
        </Slider.Root>
      </div>
    </div>
  );
}
