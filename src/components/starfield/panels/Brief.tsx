import { useActions, useGame, useKit } from "@/components/starfield/kit";
import { racing } from "@/components/starfield/store";
import { OrbitLevels } from "@/components/starfield/panels/OrbitLevels";
import { bodyById, nextInNav } from "@/components/starfield/system";
import { GOODS, HOLD_MAX, canDock, holdUnits, priceOf } from "@/components/starfield/trade";

/** The card for the place you are at: facts, orbit heights, the next stop, and the market. */
export function Brief() {
  const { store } = useKit();
  const { flyNext, buy, sell } = useActions();
  const nearId = useGame((game) => game.nearId);
  const dismissed = useGame((game) => game.dismissed);
  const chapterId = useGame((game) => game.chapterId);
  const orbiting = useGame((game) => game.orbit && game.targetId === game.nearId);
  const credits = useGame((game) => game.credits);
  const hold = useGame((game) => game.hold);
  // The trial has the screen: no market mid-race, and nothing over the result.
  const trialing = useGame((game) => game.trialOpen || racing(game));
  if (!nearId || dismissed === nearId || trialing) return null;
  const body = bodyById(nearId);
  const next = nextInNav(chapterId, body.id);
  const full = holdUnits(hold) >= HOLD_MAX;

  return (
    <article className="brief" data-hud>
      <div className="brief-top">
        <h2>{body.name}</h2>
        <button type="button" className="brief-close" onClick={() => store.setState({ dismissed: body.id })}>
          Close
        </button>
      </div>
      <p>{body.blurb}</p>
      <dl className="facts">
        <div>
          <dt>Distance</dt>
          <dd>{body.place ?? (body.au === 0 ? "Center" : `${body.au.toFixed(2)} AU`)}</dd>
        </div>
        <div>
          <dt>{body.form ? "Kind" : body.parent ? "Orbit" : "Year"}</dt>
          <dd>{body.year}</dd>
        </div>
        <div>
          <dt>{body.form ? "Note" : body.parent ? "Orbits" : "Moons"}</dt>
          <dd>{body.form ? body.moons : body.parent ? bodyById(body.parent).name : body.moons}</dd>
        </div>
      </dl>
      <div className="brief-actions">
        <OrbitLevels id={body.id} />
        {orbiting ? (
          <button type="button" className="brief-orbit" aria-pressed onClick={() => store.setState({ orbit: false })}>
            Leave
          </button>
        ) : null}
        {next && next.id !== body.id ? (
          <button type="button" className="brief-next" onClick={flyNext}>
            Next · {next.name}
          </button>
        ) : null}
      </div>
      {canDock(body) ? (
        <div className="market">
          {GOODS.map((good) => {
            const cost = priceOf(body.id, good.id);
            return (
              <div key={good.id} className="market-row">
                <span>{good.name}</span>
                <b>{cost}</b>
                <button type="button" disabled={credits < cost || full} onClick={() => buy(good.id)}>
                  Buy
                </button>
                <button type="button" disabled={hold[good.id] < 1} onClick={() => sell(good.id)}>
                  Sell
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <p className="brief-note">
        {canDock(body)
          ? "Buy where a good is cheap, sell where the price is higher. Stations deploy from More, out in open space."
          : "Orbits keep their real order. Travel distances are compressed so you can cross the system."}
      </p>
    </article>
  );
}
