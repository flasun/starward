import { useGame, useKit } from "@/components/starfield/kit";
import { CHAPTERS, chapterOpen } from "@/components/starfield/system";
import { TASKS } from "@/components/starfield/tasks";

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Every chapter's challenges, with the flight time each one was logged at. The chapter you are in comes first. */
export function FlightLog() {
  const { store } = useKit();
  const logOpen = useGame((game) => game.logOpen);
  const log = useGame((game) => game.log);
  const charted = useGame((game) => game.charted);
  const chapterId = useGame((game) => game.chapterId);
  if (!logOpen) return null;
  const chapters = [...CHAPTERS].sort((a, b) => Number(b.id === chapterId) - Number(a.id === chapterId));

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
        {chapters.map((chapter) => {
          const tasks = TASKS.filter((task) => task.chapter === chapter.id);
          const open = chapterOpen(chapter.id, charted);
          const done = tasks.filter((task) => log.some((entry) => entry.id === task.id)).length;
          return (
            <li key={chapter.id} className={open ? "log-group" : "log-group is-locked"}>
              <p className="log-chapter">
                {chapter.name}
                <span>{open ? `${done} of ${tasks.length}` : "Locked"}</span>
              </p>
              <ul>
                {tasks.map((task) => {
                  const entry = log.find((item) => item.id === task.id);
                  return (
                    <li key={task.id}>
                      <div>
                        <strong>{task.name}</strong>
                        <span>{entry ? clock(entry.seconds) : open ? "Open" : ""}</span>
                      </div>
                      <p>{task.how}</p>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
