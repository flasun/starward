import { useRef } from "react";
import { useActions, useGame, useKit, usePainter } from "@/components/starfield/kit";
import { CHAPTERS, chapterById, chapterDone, chapterOpen, goalsIn } from "@/components/starfield/system";
import { HOLD_MAX, holdUnits } from "@/components/starfield/trade";

/** The wordmark, the chapter and its progress, Help and Log, and the flight readout. */
export function TopBar() {
  return (
    <header className="topbar">
      <div>
        <h1 className="wordmark">Starward</h1>
        <ChapterLine />
        <TopActions />
      </div>
      <Readout />
    </header>
  );
}

function ChapterLine() {
  const { store } = useKit();
  const chapterId = useGame((game) => game.chapterId);
  const charted = useGame((game) => game.charted);
  const stations = useGame((game) => game.depots.length);
  const mapOpen = useGame((game) => game.mapOpen);
  const chapter = chapterById(chapterId);
  const goals = goalsIn(chapterId);
  const done = goals.filter((body) => charted.includes(body.id)).length;
  const ready = chapterDone(chapterId, charted);

  return (
    <>
      <p className="kicker">
        <button
          type="button"
          className="chapter-name"
          aria-expanded={mapOpen}
          onClick={() => store.setState({ mapOpen: !mapOpen })}
        >
          {chapter.name}
        </button>
        {" · "}
        {ready && !chapter.next ? (
          "Journey charted"
        ) : ready ? (
          "Charted"
        ) : (
          <>
            <span key={done} className="chart is-count">
              {done} of {goals.length}
            </span>{" "}
            places charted
            {chapterId === "sun" ? (
              <>
                {" · "}
                <span className="chart">{stations}</span> {stations === 1 ? "station" : "stations"}
              </>
            ) : null}
          </>
        )}
      </p>
      {mapOpen ? (
        <ul className="chapter-menu">
          {CHAPTERS.map((item) => {
            const open = chapterOpen(item.id, charted);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!open}
                  aria-current={item.id === chapterId ? "true" : undefined}
                  onClick={() =>
                    store.setState(open && item.id !== chapterId ? { mapOpen: false, chapterId: item.id } : { mapOpen: false })
                  }
                >
                  {item.name}
                  <span>{!open ? "Locked" : chapterDone(item.id, charted) ? "Charted" : "Open"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

function TopActions() {
  const { store } = useKit();
  const { openHelp, toggleLog } = useActions();
  const chapterId = useGame((game) => game.chapterId);
  const ready = useGame((game) => chapterDone(game.chapterId, game.charted));
  const logOpen = useGame((game) => game.logOpen);
  const next = chapterById(chapterId).next;

  return (
    <div className="top-actions">
      {next && ready ? (
        <button type="button" className="onward" onClick={() => store.setState({ chapterId: next })}>
          Onward
        </button>
      ) : null}
      <button type="button" className="help-btn" data-hud onClick={openHelp}>
        Help
      </button>
      <button type="button" className="help-btn" data-hud aria-pressed={logOpen} onClick={toggleLog}>
        Log
      </button>
    </div>
  );
}

/** Warp, range, speed, and nose change every frame, so the frame writes them directly. */
function Readout() {
  const credits = useGame((game) => game.credits);
  const held = useGame((game) => holdUnits(game.hold));
  const warpRef = useRef<HTMLSpanElement>(null);
  const captureRef = useRef<HTMLParagraphElement>(null);
  const distRef = useRef<HTMLElement>(null);
  const spdRef = useRef<HTMLElement>(null);
  const noseRef = useRef<HTMLElement>(null);

  usePainter((snap) => {
    const noseText = `${Math.round((snap.pitch * 180) / Math.PI)}°`;
    for (const [node, text] of [
      [warpRef.current, snap.warpText],
      [distRef.current, snap.rangeText],
      [spdRef.current, snap.speedText],
      [noseRef.current, noseText],
      [captureRef.current, snap.captureText],
    ] as const) {
      if (node && node.textContent !== text) node.textContent = text;
    }
  });

  return (
    <div className="readout">
      <span ref={warpRef} className="warp">
        1.58
      </span>
      <p className="warp-unit">
        warp <span className="boost-flag">· boost</span>
        <span className="orbit-flag">· orbit</span>
      </p>
      <p ref={captureRef} className="capture-read" />
      <div className="dash">
        <p>
          <span>Dist</span>
          <b ref={distRef}>—</b>
        </p>
        <p>
          <span>Spd</span>
          <b ref={spdRef}>0</b>
        </p>
        <p>
          <span>Cr</span>
          <b>{credits}</b>
        </p>
        <p>
          <span>Hold</span>
          <b>
            {held}/{HOLD_MAX}
          </b>
        </p>
        <p>
          <span>Nose</span>
          <b ref={noseRef}>0°</b>
        </p>
      </div>
    </div>
  );
}
