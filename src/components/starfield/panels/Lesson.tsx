import { useActions, useGame, useKit } from "@/components/starfield/kit";
import { LESSONS } from "@/components/starfield/lessons";

/** Help: five short cards, opened from the top bar. */
export function Lesson() {
  const { store } = useKit();
  const { closeLesson } = useActions();
  const lesson = useGame((game) => game.lesson);
  const card = lesson === null ? undefined : LESSONS[lesson];
  if (lesson === null || !card) return null;
  const last = lesson + 1 >= LESSONS.length;

  return (
    <article className="lesson" data-hud role="dialog" aria-labelledby="lesson-title">
      <p className="lesson-kicker">
        {lesson + 1} of {LESSONS.length}
      </p>
      <h2 id="lesson-title">{card.title}</h2>
      <p>{card.body}</p>
      <div className="lesson-actions">
        <button type="button" onClick={closeLesson}>
          Skip
        </button>
        {lesson > 0 ? (
          <button type="button" onClick={() => store.setState({ lesson: lesson - 1 })}>
            Back
          </button>
        ) : null}
        <button type="button" onClick={() => (last ? closeLesson() : store.setState({ lesson: lesson + 1 }))}>
          {last ? "Fly" : "Next"}
        </button>
      </div>
    </article>
  );
}
