import type { ErrorComponentProps } from "@tanstack/react-router";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

/** In the game's own look (styles.css `.lost`), with the error's message kept visible. */
export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="lost" role="alert">
      <div>
        <p className="lesson-kicker">Something went wrong</p>
        <h1>The ship stalled</h1>
        <p className="lost-detail">{errorMessage(error)}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </main>
  );
}
