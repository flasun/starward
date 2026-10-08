import { useActions, useGame } from "@/components/starfield/kit";

/** Low, Mid, High round a place. The active height again leaves the orbit. */
export function OrbitLevels({ id }: { id: string }) {
  const { pickOrbit } = useActions();
  const level = useGame((game) => (game.orbit && game.targetId === id ? game.orbitLevel : -1));

  return (
    <div className="orbit-levels" role="group" aria-label="Orbit height">
      {(["Low", "Mid", "High"] as const).map((name, index) => (
        <button
          key={name}
          type="button"
          data-tip={`${name} orbit. Click the active height to leave.`}
          aria-pressed={level === index}
          onClick={() => pickOrbit(id, index)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
