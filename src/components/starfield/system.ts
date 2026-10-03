/** Real solar-system bodies on a compressed map so a flight can cross them. */

import { JOURNEY } from "@/components/starfield/journey";

export type BodyDef = {
  id: string;
  name: string;
  /** Mean distance from the Sun in AU. 0 for the Sun. */
  au: number;
  /** Equatorial diameter in kilometres. */
  diameterKm: number;
  color: [number, number, number];
  /** Starting ecliptic angle, radians. */
  angle: number;
  /** Orbital period in Earth days. 0 for the Sun. */
  periodDays: number;
  moons: string;
  year: string;
  blurb: string;
  /** Counts toward charting the system. */
  goal: boolean;
  /** Listed in the nav. */
  nav: boolean;
  /** Nav section label. */
  group: string;
  /** Distance line when AU would be misleading, such as a moon. */
  place?: string;
  parent?: string;
  /** Extra orbit radius around a parent, in world units. */
  localR?: number;
  /** Skip labels and survey cards. Belt rocks. */
  quiet?: boolean;
  /** Tiny on screen. Probes and belt rocks. */
  speck?: boolean;
  /** Height off the ecliptic, world units. */
  lift?: number;
  /** Short nav label, such as Probe or Comet. */
  tag?: string;
  /** Comet perihelion, AU. */
  periAu?: number;
  /** Comet eccentricity. */
  ecc?: number;
  /** Comet angular speed, radians per second. */
  meanMotion?: number;
  /** Fixed map position. Later chapters do not orbit the Sun. */
  at?: { x: number; y: number; z: number };
  /** Screen size in world units. Overrides the solar-system scale. */
  span?: number;
  /** How to draw a body that is not a planet. */
  form?: "star" | "galaxy" | "cluster" | "cloud";
  /** Journey chapter. Missing means the solar system. */
  chapter?: string;
};

export const BODIES: BodyDef[] = [
  {
    id: "sun",
    name: "Sun",
    au: 0,
    diameterKm: 1_392_700,
    color: [0.98, 0.84, 0.5],
    angle: 0,
    periodDays: 0,
    moons: "—",
    year: "—",
    blurb: "The star at the center. Its gravity holds every orbit in this system.",
    goal: false,
    nav: true,
    group: "Star",
  },
  {
    id: "mercury",
    name: "Mercury",
    au: 0.39,
    diameterKm: 4_879,
    color: [0.71, 0.68, 0.64],
    angle: 0.5,
    periodDays: 88,
    moons: "None",
    year: "88 days",
    blurb: "The smallest planet and the closest to the Sun. A year here is 88 Earth days.",
    goal: true,
    nav: true,
    group: "Inner",
  },
  {
    id: "venus",
    name: "Venus",
    au: 0.72,
    diameterKm: 12_104,
    color: [0.9, 0.76, 0.5],
    angle: 1.7,
    periodDays: 225,
    moons: "None",
    year: "225 days",
    blurb: "A rocky world under a thick carbon-dioxide sky. Its day is longer than its year.",
    goal: true,
    nav: true,
    group: "Inner",
  },
  {
    id: "earth",
    name: "Earth",
    au: 1,
    diameterKm: 12_742,
    color: [0.34, 0.56, 0.82],
    angle: 2.45,
    periodDays: 365.25,
    moons: "1",
    year: "365 days",
    blurb: "A rocky planet with liquid water, one large moon, and a 24-hour day.",
    goal: true,
    nav: true,
    group: "Inner",
  },
  {
    id: "moon",
    name: "Moon",
    au: 1,
    diameterKm: 3_474,
    color: [0.74, 0.74, 0.76],
    angle: 0.4,
    periodDays: 27.3,
    moons: "—",
    year: "27 days",
    blurb: "Earth’s only natural satellite. Airless, and locked so one face always points home.",
    goal: true,
    nav: true,
    group: "Inner",
    place: "384,400 km out",
    parent: "earth",
    localR: 36,
  },
  {
    id: "mars",
    name: "Mars",
    au: 1.52,
    diameterKm: 6_779,
    color: [0.76, 0.38, 0.26],
    angle: 3.55,
    periodDays: 687,
    moons: "2",
    year: "687 days",
    blurb: "A cold desert world. Two small moons, Phobos and Deimos, orbit close in.",
    goal: true,
    nav: true,
    group: "Inner",
  },
  {
    id: "phobos",
    name: "Phobos",
    au: 1.52,
    diameterKm: 22,
    color: [0.55, 0.46, 0.4],
    angle: 1.2,
    periodDays: 0.32,
    moons: "—",
    year: "7.7 hours",
    blurb: "The inner moon of Mars. It rises in the west and races around in under eight hours.",
    goal: true,
    nav: true,
    group: "Inner",
    place: "9,400 km out",
    parent: "mars",
    localR: 28,
  },
  {
    id: "ceres",
    name: "Ceres",
    au: 2.77,
    diameterKm: 939,
    color: [0.72, 0.7, 0.66],
    angle: 4.6,
    periodDays: 1_682,
    moons: "None",
    year: "4.6 years",
    blurb: "The largest body in the asteroid belt, between Mars and Jupiter.",
    goal: true,
    nav: true,
    group: "Belt",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    au: 5.2,
    diameterKm: 139_820,
    color: [0.84, 0.68, 0.48],
    angle: 0.95,
    periodDays: 4_333,
    moons: "95 known",
    year: "11.9 years",
    blurb: "The largest planet, a gas giant. The Great Red Spot is a storm centuries old.",
    goal: true,
    nav: true,
    group: "Jupiter",
  },
  {
    id: "io",
    name: "Io",
    au: 5.2,
    diameterKm: 3_643,
    color: [0.93, 0.78, 0.32],
    angle: 0.2,
    periodDays: 1.77,
    moons: "—",
    year: "1.8 days",
    blurb: "The most volcanic body in the system. Sulfur frost paints it yellow.",
    goal: true,
    nav: true,
    group: "Jupiter",
    place: "422,000 km out",
    parent: "jupiter",
    localR: 48,
  },
  {
    id: "europa",
    name: "Europa",
    au: 5.2,
    diameterKm: 3_122,
    color: [0.86, 0.9, 0.88],
    angle: 1.6,
    periodDays: 3.55,
    moons: "—",
    year: "3.6 days",
    blurb: "An ice shell over a global ocean. One of the best places to look for life.",
    goal: true,
    nav: true,
    group: "Jupiter",
    place: "671,000 km out",
    parent: "jupiter",
    localR: 70,
  },
  {
    id: "ganymede",
    name: "Ganymede",
    au: 5.2,
    diameterKm: 5_268,
    color: [0.62, 0.58, 0.52],
    angle: 3.1,
    periodDays: 7.15,
    moons: "—",
    year: "7.2 days",
    blurb: "The largest moon. Bigger than Mercury, and it has its own magnetic field.",
    goal: true,
    nav: true,
    group: "Jupiter",
    place: "1,070,000 km out",
    parent: "jupiter",
    localR: 96,
  },
  {
    id: "callisto",
    name: "Callisto",
    au: 5.2,
    diameterKm: 4_821,
    color: [0.42, 0.4, 0.38],
    angle: 4.7,
    periodDays: 16.7,
    moons: "—",
    year: "16.7 days",
    blurb: "An ancient, cratered moon, far enough out to sit past Jupiter’s worst radiation.",
    goal: true,
    nav: true,
    group: "Jupiter",
    place: "1,883,000 km out",
    parent: "jupiter",
    localR: 126,
  },
  {
    id: "saturn",
    name: "Saturn",
    au: 9.58,
    diameterKm: 116_460,
    color: [0.88, 0.78, 0.56],
    angle: 4.25,
    periodDays: 10_759,
    moons: "146 known",
    year: "29.4 years",
    blurb: "A gas giant wrapped in bright ice rings. Less dense than water, if you could float it.",
    goal: true,
    nav: true,
    group: "Saturn",
  },
  {
    id: "enceladus",
    name: "Enceladus",
    au: 9.58,
    diameterKm: 504,
    color: [0.9, 0.93, 0.95],
    angle: 0.8,
    periodDays: 1.37,
    moons: "—",
    year: "1.4 days",
    blurb: "A bright ice moon. Plumes from a hidden ocean vent at the south pole.",
    goal: true,
    nav: true,
    group: "Saturn",
    place: "238,000 km out",
    parent: "saturn",
    localR: 62,
  },
  {
    id: "titan",
    name: "Titan",
    au: 9.58,
    diameterKm: 5_149,
    color: [0.86, 0.58, 0.28],
    angle: 2.4,
    periodDays: 16,
    moons: "—",
    year: "16 days",
    blurb: "A moon with a thick orange sky, and lakes of liquid methane.",
    goal: true,
    nav: true,
    group: "Saturn",
    place: "1,222,000 km out",
    parent: "saturn",
    localR: 98,
  },
  {
    id: "uranus",
    name: "Uranus",
    au: 19.2,
    diameterKm: 50_724,
    color: [0.6, 0.84, 0.82],
    angle: 2.05,
    periodDays: 30_687,
    moons: "28 known",
    year: "84 years",
    blurb: "An ice giant tipped on its side, so its seasons last about 21 years each.",
    goal: true,
    nav: true,
    group: "Outer",
  },
  {
    id: "neptune",
    name: "Neptune",
    au: 30.05,
    diameterKm: 49_244,
    color: [0.28, 0.44, 0.78],
    angle: 5.35,
    periodDays: 60_190,
    moons: "16 known",
    year: "165 years",
    blurb: "An ice giant with the fastest winds measured anywhere in the system.",
    goal: true,
    nav: true,
    group: "Outer",
  },
  {
    id: "triton",
    name: "Triton",
    au: 30.05,
    diameterKm: 2_707,
    color: [0.75, 0.72, 0.78],
    angle: 2.2,
    periodDays: 5.88,
    moons: "—",
    year: "5.9 days",
    blurb: "Neptune’s largest moon, orbiting backward. Nitrogen geysers dust the surface.",
    goal: true,
    nav: true,
    group: "Outer",
    place: "355,000 km out",
    parent: "neptune",
    localR: 44,
  },
  {
    id: "pluto",
    name: "Pluto",
    au: 39.48,
    diameterKm: 2_376,
    color: [0.8, 0.7, 0.62],
    angle: 1.15,
    periodDays: 90_560,
    moons: "5",
    year: "248 years",
    blurb: "A dwarf planet in the Kuiper Belt. The heart-shaped plain is nitrogen ice.",
    goal: true,
    nav: true,
    group: "Outer",
  },
  {
    id: "charon",
    name: "Charon",
    au: 39.48,
    diameterKm: 1_212,
    color: [0.66, 0.66, 0.68],
    angle: 0.6,
    periodDays: 6.4,
    moons: "—",
    year: "6.4 days",
    blurb: "Pluto’s partner. The two orbit a point in space between them.",
    goal: true,
    nav: true,
    group: "Outer",
    place: "19,600 km out",
    parent: "pluto",
    localR: 20,
  },
  {
    id: "halley",
    name: "Halley",
    au: 0.59,
    diameterKm: 11,
    color: [0.78, 0.86, 0.92],
    angle: 2.15,
    periodDays: 27_500,
    moons: "—",
    year: "75 years",
    blurb: "A comet that swings in near the Sun, then spends most of its loop in the dark.",
    goal: true,
    nav: true,
    group: "Comet",
    tag: "Comet",
    place: "0.6 to 18 AU",
    periAu: 0.59,
    ecc: 0.82,
    meanMotion: 0.0036,
  },
  {
    id: "cassini",
    name: "Cassini",
    au: 9.58,
    diameterKm: 12,
    color: [0.82, 0.84, 0.88],
    angle: 1.1,
    periodDays: 16,
    moons: "—",
    year: "In orbit",
    blurb: "The probe that toured Saturn. This marker keeps station just outside the rings.",
    goal: true,
    nav: true,
    group: "Probes",
    tag: "Probe",
    place: "Outside the rings",
    parent: "saturn",
    localR: 78,
    speck: true,
  },
  {
    id: "voyager",
    name: "Voyager 1",
    au: 52,
    diameterKm: 4,
    color: [0.86, 0.88, 0.9],
    angle: 1.85,
    periodDays: 0,
    moons: "—",
    year: "Still going",
    blurb: "The farthest human-made object. The marker sits past the planets.",
    goal: true,
    nav: true,
    group: "Probes",
    tag: "Probe",
    place: "Past the planets",
    speck: true,
  },
  {
    id: "horizons",
    name: "New Horizons",
    au: 45,
    diameterKm: 4,
    color: [0.8, 0.86, 0.9],
    angle: 0.55,
    periodDays: 0,
    moons: "—",
    year: "Still going",
    blurb: "The probe that flew past Pluto. Its marker keeps on into the Kuiper Belt.",
    goal: true,
    nav: true,
    group: "Probes",
    tag: "Probe",
    place: "Kuiper Belt",
    speck: true,
  },
];

for (let i = 0; i < 26; i++) {
  BODIES.push({
    id: `rock-${i}`,
    name: "Asteroid",
    au: 2.2 + (i % 8) * 0.14,
    diameterKm: 140,
    color: [0.55, 0.53, 0.48],
    angle: i * 0.74 + (i % 3) * 0.15,
    periodDays: 1_500,
    moons: "—",
    year: "—",
    blurb: "One rock in the belt between Mars and Jupiter.",
    goal: false,
    nav: false,
    group: "Belt",
    quiet: true,
    speck: true,
    lift: Math.sin(i * 1.7) * 16,
  });
}

export const GOAL_COUNT = BODIES.filter((body) => body.goal).length;

export const CHAPTERS = [
  { id: "sun", name: "Round the Sun", next: "stars", first: "earth" },
  { id: "stars", name: "The Near Stars", next: "galaxy", first: "proxima" },
  { id: "galaxy", name: "The Milky Way", next: "local", first: "orion-arm" },
  { id: "local", name: "Out of the Galaxy", next: "web", first: "lmc" },
  { id: "web", name: "The Web", next: null, first: "virgo" },
] as const;

export type ChapterId = (typeof CHAPTERS)[number]["id"];

export function chapterById(id: string) {
  return CHAPTERS.find((chapter) => chapter.id === id) ?? CHAPTERS[0];
}

export function bodiesIn(chapter: string): BodyDef[] {
  if (chapter === "sun") return BODIES;
  return JOURNEY.filter((body) => body.chapter === chapter);
}

export function goalsIn(chapter: string): BodyDef[] {
  return bodiesIn(chapter).filter((body) => body.goal);
}

export function chapterDone(chapter: string, charted: readonly string[]): boolean {
  const goals = goalsIn(chapter);
  return goals.length > 0 && goals.every((body) => charted.includes(body.id));
}

export function chapterOpen(chapter: string, charted: readonly string[]): boolean {
  const index = CHAPTERS.findIndex((item) => item.id === chapter);
  if (index <= 0) return true;
  const previous = CHAPTERS[index - 1];
  return previous ? chapterDone(previous.id, charted) : false;
}

export function bodyById(id: string): BodyDef {
  return BODIES.find((body) => body.id === id) ?? JOURNEY.find((body) => body.id === id) ?? BODIES[3]!;
}

/** Compressed orbit so Neptune is a flight, not a day. */
export function orbitRadius(au: number): number {
  if (au <= 0) return 0;
  return 200 + Math.pow(au, 0.62) * 460;
}

export const EARTH_ORBIT = orbitRadius(1);

export function visualRadius(body: BodyDef): number {
  if (body.span) return body.span;
  if (body.id === "sun") return 64;
  if (body.speck) return 1.15;
  const earth = 12_742;
  const scaled = 8.2 * Math.pow(body.diameterKm / earth, 0.42);
  const floor = body.parent ? 1.8 : 4.2;
  return Math.max(floor, scaled);
}

export function surveyRadius(body: BodyDef): number {
  if (body.form === "star" && body.span) return body.span * 2.4 + 24;
  if (body.span && body.span > 24) return body.span * 1.35 + 36;
  if (body.speck) return 18;
  if (body.id === "sun") return visualRadius(body) * 2.2 + 28;
  if (body.parent) return visualRadius(body) * 3 + 12;
  return visualRadius(body) * 4.2 + 28;
}

export function bodyPosition(body: BodyDef, time: number): { x: number; y: number; z: number } {
  if (body.at) return body.at;
  if (body.parent) {
    const parent = bodyById(body.parent);
    const origin = bodyPosition(parent, time);
    const spin = time * 0.45 + body.angle;
    const local = body.localR ?? 30;
    return {
      x: origin.x + Math.cos(spin) * local,
      y: origin.y,
      z: origin.z + Math.sin(spin) * local,
    };
  }
  if (body.au <= 0) return { x: 0, y: 0, z: 0 };
  if (body.periAu && body.ecc && body.meanMotion) {
    const apAu = body.periAu * (1 + body.ecc) / (1 - body.ecc);
    const rp = orbitRadius(body.periAu);
    const ra = orbitRadius(apAu);
    const a = (rp + ra) / 2;
    const e = (ra - rp) / (ra + rp);
    const theta = body.angle + time * body.meanMotion;
    const radius = (a * (1 - e * e)) / (1 + e * Math.cos(theta));
    return {
      x: Math.cos(theta) * radius,
      y: body.lift ?? 0,
      z: Math.sin(theta) * radius,
    };
  }
  const spin = body.periodDays === 0 ? 0 : 0.006 / Math.pow(body.au, 1.5);
  const angle = body.angle + time * spin;
  const radius = orbitRadius(body.au);
  return { x: Math.cos(angle) * radius, y: body.lift ?? 0, z: Math.sin(angle) * radius };
}

/** Camera looks along +Z in camera space. +yaw looks left. */
export function cameraForward(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return { x: -sy * cp, y: sp, z: cy * cp };
}

export function worldToCamera(
  dx: number,
  dy: number,
  dz: number,
  yaw: number,
  pitch: number,
): { x: number; y: number; z: number } {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = dx * cy + dz * sy;
  const z1 = -dx * sy + dz * cy;
  const y = dy * cp - z1 * sp;
  const z = dy * sp + z1 * cp;
  return { x: x1, y, z };
}
