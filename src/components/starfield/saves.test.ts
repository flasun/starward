import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { carryOldSaves } from "./saves.ts";

const realStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function useStorage(entries: Record<string, string>, broken = false): Map<string, string> {
  const map = new Map(Object.entries(entries));
  const fail = () => {
    throw new Error("storage blocked");
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (broken ? fail() : (map.get(key) ?? null)),
      setItem: (key: string, value: string) => (broken ? fail() : void map.set(key, value)),
    },
  });
  return map;
}

describe("carryOldSaves", () => {
  beforeEach(() => useStorage({}));
  afterEach(() => {
    if (realStorage) Object.defineProperty(globalThis, "localStorage", realStorage);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("copies each Slipstream save to its Starward key and keeps the old one", () => {
    const map = useStorage({ "slipstream-survey": '["earth"]', "slipstream-trade": '{"credits":999}' });
    carryOldSaves();
    assert.equal(map.get("starward-survey"), '["earth"]');
    assert.equal(map.get("starward-trade"), '{"credits":999}');
    assert.equal(map.get("slipstream-survey"), '["earth"]');
  });

  it("never overwrites a Starward save", () => {
    const map = useStorage({ "slipstream-survey": '["earth"]', "starward-survey": '["earth","moon"]' });
    carryOldSaves();
    assert.equal(map.get("starward-survey"), '["earth","moon"]');
  });

  it("starts fresh when storage is blocked", () => {
    useStorage({}, true);
    assert.doesNotThrow(() => carryOldSaves());
  });
});
