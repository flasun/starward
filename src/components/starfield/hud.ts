/** Text and minimap shapes the HUD shows each frame. */

import { EARTH_ORBIT } from "./system.ts";
import type { PlotBlip } from "./types.ts";

export function formatRange(dist: number, chapter: string): string {
  if (chapter !== "sun") {
    if (dist < 48) return "Here";
    const hop = dist / 520;
    return `${hop.toFixed(hop < 10 ? 2 : 1)}× hop`;
  }
  const km = (dist / EARTH_ORBIT) * 149_597_870;
  if (km < 800_000) {
    if (km < 1000) return `${Math.max(1, Math.round(km))} km`;
    return `${Math.round(km / 1000)}k km`;
  }
  const au = dist / EARTH_ORBIT;
  return `${au.toFixed(au < 10 ? 2 : 1)} AU`;
}

export function plotSystem(
  contacts: { id: string; name: string; wx: number; wz: number; orbit: number; target: boolean; close: boolean }[],
  shipX: number,
  shipZ: number,
  yaw: number,
  depots: { x: number; z: number }[],
): PlotBlip[] {
  let reach = 80;
  for (const item of contacts) reach = Math.max(reach, Math.hypot(item.wx, item.wz));
  for (const depot of depots) reach = Math.max(reach, Math.hypot(depot.x, depot.z));
  reach = Math.max(reach, Math.hypot(shipX, shipZ), 1);
  const place = (wx: number, wz: number) => {
    const dist = Math.hypot(wx, wz);
    if (dist < 0.001) return { x: 0, y: 0 };
    const radius = (Math.log1p(dist) / Math.log1p(reach)) * 44;
    return { x: (wx / dist) * radius, y: (wz / dist) * radius };
  };
  const rings = new Set<number>();
  for (const item of contacts) {
    if (item.orbit > 8) rings.add(Math.round(place(item.orbit, 0).x * 10) / 10);
  }
  const marks: PlotBlip[] = [...rings].map((r) => ({
    id: `ring-${r}`,
    name: "",
    x: 0,
    y: 0,
    r,
    target: false,
    close: false,
    ring: true,
  }));
  for (const item of contacts) {
    const at = place(item.wx, item.wz);
    marks.push({
      id: item.id,
      name: item.name,
      x: at.x,
      y: at.y,
      r: item.id === "sun" ? 1.8 : item.target ? 1.55 : 0.85,
      target: item.target,
      close: item.close,
    });
  }
  depots.forEach((depot, index) => {
    const at = place(depot.x, depot.z);
    marks.push({
      id: `depot-${index}`,
      name: "Station",
      x: at.x,
      y: at.y,
      r: 1.15,
      target: false,
      close: false,
      depot: true,
    });
  });
  const ship = place(shipX, shipZ);
  marks.push({
    id: "ship",
    name: "You",
    x: ship.x,
    y: ship.y,
    r: 0,
    target: false,
    close: false,
    ship: true,
    heading: yaw,
  });
  return marks;
}
