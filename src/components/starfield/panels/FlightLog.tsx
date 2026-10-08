import { useGame, useKit } from "@/components/starfield/kit";
import { TASKS } from "@/components/starfield/tasks";

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The eight challenges, with the flight time each one was logged at. */
export function FlightLog() {
  const { store } = useKit();
  const logOpen = useGame((game) => game.logOpen);
  const log = useGame((game) => game.log);
  if (!logOpen) return null;

  return (
    <article className="lesson log" data-hud aria-label="Flight log">
      <div className="brief-top">
        <div>
          <p className="lesson-kicker">
            {log.length} of {TASKS.length} logged
          </p>
          <h2>Flight log</h2>
        </div>
        <button type="button" className="brief-close" onClick={() => store.setState({ logOpen: false })}>
          Close
        </button>
      </div>
      <ul className="log-list">
        {TASKS.map((task) => {
          const done = log.find((entry) => entry.id === task.id);
          return (
            <li key={task.id}>
              <div>
                <strong>{task.name}</strong>
                <span>{done ? clock(done.seconds) : "Open"}</span>
              </div>
              <p>{task.how}</p>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
