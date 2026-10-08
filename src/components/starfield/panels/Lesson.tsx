import { useActions, useGame, useKit } from "@/components/starfield/kit";

const LESSONS = [
  {
    title: "Look around",
    body: "Drag the sky to steer, or turn on Gaze in More and look. A click nudges the nose. Double-tap a world to fly there and orbit it. A and D steer, W and S pitch, Space is warp, and Escape pauses.",
  },
  {
    title: "Set your speed",
    body: "Speed is your cruise. Orbit has three heights. Low skims the surface, Mid is the usual circle, and High sits farther out.",
  },
  {
    title: "Chart a place",
    body: "Pick a world, then Go. Finish the places in a chapter and Onward opens the next scale, from the near stars out to the galaxy clusters.",
  },
  {
    title: "Change the camera",
    body: "Cockpit is the nose. Chase sits behind the ship. Left and Right are the wings. Above steps from the left, to the center, then to the right. Full fills the screen.",
  },
  {
    title: "Fly a task",
    body: "Open Log. Every chapter has its own challenges, from a soft arrival to the edge of the map, and each is saved with your time. A faint trail marks where you have flown.",
  },
];

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
