import { useEffect } from "react";
import { useActions, useGame, useKit } from "@/components/starfield/kit";
import { Brief } from "@/components/starfield/panels/Brief";

const TOAST_MS = 2600;
const REWARD_MS = 3400;
const COACH_MS = 7000;
const HINT_MS = 6400;

/** Over the flight: the first-flight offer or hint, coaching, status lines, toasts, and the brief. */
export function Chrome() {
  return (
    <div className="chrome">
      <Hint />
      <Status />
      <Toasts />
      <Brief />
    </div>
  );
}

function Hint() {
  const { store } = useKit();
  const { startFirstFlight } = useActions();
  // Stays up until the player takes it, waves it off, or charts a place.
  const offer = useGame((game) => game.offerOpen && game.charted.length === 0 && game.lesson === null && !game.autopilot);
  const shown = useGame((game) => game.hint && game.lesson === null && !game.coach);
  const coach = useGame((game) => game.coach);

  useEffect(() => {
    const hide = () => store.setState({ hint: false });
    const timer = window.setTimeout(hide, HINT_MS);
    window.addEventListener("pointerdown", hide, { once: true });
    window.addEventListener("keydown", hide, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", hide);
      window.removeEventListener("keydown", hide);
    };
  }, [store]);

  useEffect(() => {
    if (!coach) return;
    const timer = window.setTimeout(() => store.setState({ coach: "" }), COACH_MS);
    return () => window.clearTimeout(timer);
  }, [coach, store]);

  return (
    <>
      {offer ? (
        <p className="hint">
          <span>Earth is selected. Press Go.</span>
          <button type="button" className="hint-go" onClick={startFirstFlight}>
            First flight
          </button>
          <button type="button" className="hint-skip" onClick={() => store.setState({ offerOpen: false })}>
            Not now
          </button>
        </p>
      ) : (
        <p className={shown ? "hint" : "hint is-hidden"}>
          <span className="md:hidden">Drag to look. Go flies you there.</span>
          <span className="hidden md:inline">Drag to look. A click nudges the nose. Go flies to the place you pick.</span>
        </p>
      )}
      {coach ? <p className="hint">{coach}</p> : null}
    </>
  );
}

function Status() {
  const gazeNote = useGame((game) => game.gazeNote);
  const alert = useGame((game) => game.alert);
  return (
    <>
      {gazeNote ? <p className="status">{gazeNote}</p> : null}
      {alert ? <p className="status">{alert}</p> : null}
    </>
  );
}

/** One message at a time. Rewards hold a little longer than notes. */
function Toasts() {
  const { dropToast } = useActions();
  const toast = useGame((game) => game.toasts[0]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dropToast, toast.reward ? REWARD_MS : TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, dropToast]);

  return (
    <div className="toasts" aria-live="polite">
      {toast ? (
        <p key={toast.id} className={toast.reward ? "toast is-reward" : "toast"}>
          <strong>{toast.title}</strong>
          {toast.detail ? <span>{toast.detail}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
