import { i as __toESM } from "../_runtime.mjs";
import { a as require_jsx_runtime, o as require_react } from "../_libs/@radix-ui/react-collection+[...].mjs";
import { n as Volume2, t as VolumeX } from "../_libs/lucide-react.mjs";
import { i as SliderTrack, n as SliderRange, r as SliderThumb, t as Slider } from "../_libs/@radix-ui/react-slider+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-_vX0WmUx.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function audioCtor() {
	if (typeof window === "undefined") return null;
	const w = window;
	return window.AudioContext ?? w.webkitAudioContext ?? null;
}
var DriftAudio = class {
	ctx = null;
	master = null;
	filter = null;
	noiseGain = null;
	noiseFilter = null;
	oscA = null;
	dead = false;
	/** Call synchronously from pointerdown / keydown. */
	unlock() {
		if (this.dead) return;
		const Ctor = audioCtor();
		if (!Ctor) return;
		try {
			if (!this.ctx) {
				this.ctx = new Ctor({ latencyHint: "interactive" });
				this.build(this.ctx);
			}
			if (this.ctx.state === "suspended") this.ctx.resume();
		} catch {
			this.dead = true;
		}
	}
	resume() {
		if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
	}
	update(speed, boost, muted) {
		if (!this.ctx || !this.master || !this.filter || !this.oscA || !this.noiseGain || !this.noiseFilter) return;
		const t = this.ctx.currentTime;
		const vol = muted ? 0 : Math.min(.2, .035 + speed / 90 * .07) * (.8 + boost * .35);
		this.master.gain.setTargetAtTime(vol * vol > 0 ? vol : 0, t, .06);
		this.oscA.frequency.setTargetAtTime(42 + speed * .28 + boost * 10, t, .08);
		this.filter.frequency.setTargetAtTime(220 + speed * 5 + boost * 780, t, .1);
		this.noiseGain.gain.setTargetAtTime(muted ? 0 : boost * boost * .05, t, .08);
		this.noiseFilter.frequency.setTargetAtTime(280 + boost * 640, t, .1);
	}
	dispose() {
		const ctx = this.ctx;
		this.ctx = null;
		this.master = null;
		this.oscA = null;
		if (ctx) ctx.close();
	}
	build(ctx) {
		const master = ctx.createGain();
		master.gain.value = 0;
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 260;
		filter.Q.value = .65;
		const a = ctx.createOscillator();
		a.type = "sine";
		a.frequency.value = 52;
		const b = ctx.createOscillator();
		b.type = "triangle";
		b.frequency.value = 104;
		const quiet = ctx.createGain();
		quiet.gain.value = .12;
		a.connect(filter);
		b.connect(quiet);
		quiet.connect(filter);
		filter.connect(master);
		master.connect(ctx.destination);
		a.start();
		b.start();
		const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
		const channel = buffer.getChannelData(0);
		for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		noise.loop = true;
		const bp = ctx.createBiquadFilter();
		bp.type = "bandpass";
		bp.frequency.value = 360;
		bp.Q.value = .55;
		const noiseGain = ctx.createGain();
		noiseGain.gain.value = 0;
		noise.connect(bp);
		bp.connect(noiseGain);
		noiseGain.connect(master);
		noise.start();
		this.master = master;
		this.filter = filter;
		this.oscA = a;
		this.noiseGain = noiseGain;
		this.noiseFilter = bp;
	}
};
var NEAR = .62;
var MAX_STARS = 9e3;
function clamp(v, min, max) {
	return Math.max(min, Math.min(max, v));
}
function clamp01(v) {
	return clamp(v, 0, 1);
}
/** Slider 0–1 → world units per second along the flight axis. */
function cruiseSpeed(slider, reduced) {
	const s = clamp01(slider);
	return reduced ? 8 + s * 26 : 16 + s * 52;
}
/** World speed → the number shown as “warp”. */
function warpFactor(worldSpeed) {
	return worldSpeed / 24;
}
function starBudget(density, mobile) {
	const min = mobile ? 700 : 1400;
	return Math.round(min + ((mobile ? 4600 : MAX_STARS) - min) * clamp01(density));
}
var BODIES = [
	{
		id: "sun",
		name: "Sun",
		au: 0,
		diameterKm: 1392700,
		color: [
			.98,
			.84,
			.5
		],
		angle: 0,
		periodDays: 0,
		moons: "—",
		year: "—",
		blurb: "The star at the center. Its gravity holds every orbit in this system.",
		goal: false,
		nav: true,
		group: "Star"
	},
	{
		id: "mercury",
		name: "Mercury",
		au: .39,
		diameterKm: 4879,
		color: [
			.71,
			.68,
			.64
		],
		angle: .5,
		periodDays: 88,
		moons: "None",
		year: "88 days",
		blurb: "The smallest planet and the closest to the Sun. A year here is 88 Earth days.",
		goal: true,
		nav: true,
		group: "Inner"
	},
	{
		id: "venus",
		name: "Venus",
		au: .72,
		diameterKm: 12104,
		color: [
			.9,
			.76,
			.5
		],
		angle: 1.7,
		periodDays: 225,
		moons: "None",
		year: "225 days",
		blurb: "A rocky world under a thick carbon-dioxide sky. Its day is longer than its year.",
		goal: true,
		nav: true,
		group: "Inner"
	},
	{
		id: "earth",
		name: "Earth",
		au: 1,
		diameterKm: 12742,
		color: [
			.34,
			.56,
			.82
		],
		angle: 2.45,
		periodDays: 365.25,
		moons: "1",
		year: "365 days",
		blurb: "A rocky planet with liquid water, one large moon, and a 24-hour day.",
		goal: true,
		nav: true,
		group: "Inner"
	},
	{
		id: "moon",
		name: "Moon",
		au: 1,
		diameterKm: 3474,
		color: [
			.74,
			.74,
			.76
		],
		angle: .4,
		periodDays: 27.3,
		moons: "—",
		year: "27 days",
		blurb: "Earth’s only natural satellite. Airless, and locked so one face always points home.",
		goal: true,
		nav: true,
		group: "Inner",
		place: "384,400 km out",
		parent: "earth",
		localR: 36
	},
	{
		id: "mars",
		name: "Mars",
		au: 1.52,
		diameterKm: 6779,
		color: [
			.76,
			.38,
			.26
		],
		angle: 3.55,
		periodDays: 687,
		moons: "2",
		year: "687 days",
		blurb: "A cold desert world. Two small moons, Phobos and Deimos, orbit close in.",
		goal: true,
		nav: true,
		group: "Inner"
	},
	{
		id: "phobos",
		name: "Phobos",
		au: 1.52,
		diameterKm: 22,
		color: [
			.55,
			.46,
			.4
		],
		angle: 1.2,
		periodDays: .32,
		moons: "—",
		year: "7.7 hours",
		blurb: "The inner moon of Mars. It rises in the west and races around in under eight hours.",
		goal: true,
		nav: true,
		group: "Inner",
		place: "9,400 km out",
		parent: "mars",
		localR: 28
	},
	{
		id: "ceres",
		name: "Ceres",
		au: 2.77,
		diameterKm: 939,
		color: [
			.72,
			.7,
			.66
		],
		angle: 4.6,
		periodDays: 1682,
		moons: "None",
		year: "4.6 years",
		blurb: "The largest body in the asteroid belt, between Mars and Jupiter.",
		goal: true,
		nav: true,
		group: "Belt"
	},
	{
		id: "jupiter",
		name: "Jupiter",
		au: 5.2,
		diameterKm: 139820,
		color: [
			.84,
			.68,
			.48
		],
		angle: .95,
		periodDays: 4333,
		moons: "95 known",
		year: "11.9 years",
		blurb: "The largest planet, a gas giant. The Great Red Spot is a storm centuries old.",
		goal: true,
		nav: true,
		group: "Jupiter"
	},
	{
		id: "io",
		name: "Io",
		au: 5.2,
		diameterKm: 3643,
		color: [
			.93,
			.78,
			.32
		],
		angle: .2,
		periodDays: 1.77,
		moons: "—",
		year: "1.8 days",
		blurb: "The most volcanic body in the system. Sulfur frost paints it yellow.",
		goal: true,
		nav: true,
		group: "Jupiter",
		place: "422,000 km out",
		parent: "jupiter",
		localR: 48
	},
	{
		id: "europa",
		name: "Europa",
		au: 5.2,
		diameterKm: 3122,
		color: [
			.86,
			.9,
			.88
		],
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
		localR: 70
	},
	{
		id: "ganymede",
		name: "Ganymede",
		au: 5.2,
		diameterKm: 5268,
		color: [
			.62,
			.58,
			.52
		],
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
		localR: 96
	},
	{
		id: "callisto",
		name: "Callisto",
		au: 5.2,
		diameterKm: 4821,
		color: [
			.42,
			.4,
			.38
		],
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
		localR: 126
	},
	{
		id: "saturn",
		name: "Saturn",
		au: 9.58,
		diameterKm: 116460,
		color: [
			.88,
			.78,
			.56
		],
		angle: 4.25,
		periodDays: 10759,
		moons: "146 known",
		year: "29.4 years",
		blurb: "A gas giant wrapped in bright ice rings. Less dense than water, if you could float it.",
		goal: true,
		nav: true,
		group: "Saturn"
	},
	{
		id: "enceladus",
		name: "Enceladus",
		au: 9.58,
		diameterKm: 504,
		color: [
			.9,
			.93,
			.95
		],
		angle: .8,
		periodDays: 1.37,
		moons: "—",
		year: "1.4 days",
		blurb: "A bright ice moon. Plumes from a hidden ocean vent at the south pole.",
		goal: true,
		nav: true,
		group: "Saturn",
		place: "238,000 km out",
		parent: "saturn",
		localR: 62
	},
	{
		id: "titan",
		name: "Titan",
		au: 9.58,
		diameterKm: 5149,
		color: [
			.86,
			.58,
			.28
		],
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
		localR: 98
	},
	{
		id: "uranus",
		name: "Uranus",
		au: 19.2,
		diameterKm: 50724,
		color: [
			.6,
			.84,
			.82
		],
		angle: 2.05,
		periodDays: 30687,
		moons: "28 known",
		year: "84 years",
		blurb: "An ice giant tipped on its side, so its seasons last about 21 years each.",
		goal: true,
		nav: true,
		group: "Outer"
	},
	{
		id: "neptune",
		name: "Neptune",
		au: 30.05,
		diameterKm: 49244,
		color: [
			.28,
			.44,
			.78
		],
		angle: 5.35,
		periodDays: 60190,
		moons: "16 known",
		year: "165 years",
		blurb: "An ice giant with the fastest winds measured anywhere in the system.",
		goal: true,
		nav: true,
		group: "Outer"
	},
	{
		id: "triton",
		name: "Triton",
		au: 30.05,
		diameterKm: 2707,
		color: [
			.75,
			.72,
			.78
		],
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
		localR: 44
	},
	{
		id: "pluto",
		name: "Pluto",
		au: 39.48,
		diameterKm: 2376,
		color: [
			.8,
			.7,
			.62
		],
		angle: 1.15,
		periodDays: 90560,
		moons: "5",
		year: "248 years",
		blurb: "A dwarf planet in the Kuiper Belt. The heart-shaped plain is nitrogen ice.",
		goal: true,
		nav: true,
		group: "Outer"
	},
	{
		id: "charon",
		name: "Charon",
		au: 39.48,
		diameterKm: 1212,
		color: [
			.66,
			.66,
			.68
		],
		angle: .6,
		periodDays: 6.4,
		moons: "—",
		year: "6.4 days",
		blurb: "Pluto’s partner. The two orbit a point in space between them.",
		goal: true,
		nav: true,
		group: "Outer",
		place: "19,600 km out",
		parent: "pluto",
		localR: 20
	},
	{
		id: "halley",
		name: "Halley",
		au: .59,
		diameterKm: 11,
		color: [
			.78,
			.86,
			.92
		],
		angle: 2.15,
		periodDays: 27500,
		moons: "—",
		year: "75 years",
		blurb: "A comet that swings in near the Sun, then spends most of its loop in the dark.",
		goal: true,
		nav: true,
		group: "Comet",
		tag: "Comet",
		place: "0.6 to 18 AU",
		periAu: .59,
		ecc: .82,
		meanMotion: .0036
	},
	{
		id: "cassini",
		name: "Cassini",
		au: 9.58,
		diameterKm: 12,
		color: [
			.82,
			.84,
			.88
		],
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
		speck: true
	},
	{
		id: "voyager",
		name: "Voyager 1",
		au: 52,
		diameterKm: 4,
		color: [
			.86,
			.88,
			.9
		],
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
		speck: true
	},
	{
		id: "horizons",
		name: "New Horizons",
		au: 45,
		diameterKm: 4,
		color: [
			.8,
			.86,
			.9
		],
		angle: .55,
		periodDays: 0,
		moons: "—",
		year: "Still going",
		blurb: "The probe that flew past Pluto. Its marker keeps on into the Kuiper Belt.",
		goal: true,
		nav: true,
		group: "Probes",
		tag: "Probe",
		place: "Kuiper Belt",
		speck: true
	}
];
for (let i = 0; i < 26; i++) BODIES.push({
	id: `rock-${i}`,
	name: "Asteroid",
	au: 2.2 + i % 8 * .14,
	diameterKm: 140,
	color: [
		.55,
		.53,
		.48
	],
	angle: i * .74 + i % 3 * .15,
	periodDays: 1500,
	moons: "—",
	year: "—",
	blurb: "One rock in the belt between Mars and Jupiter.",
	goal: false,
	nav: false,
	group: "Belt",
	quiet: true,
	speck: true,
	lift: Math.sin(i * 1.7) * 16
});
var GOAL_COUNT = BODIES.filter((body) => body.goal).length;
function bodyById(id) {
	return BODIES.find((body) => body.id === id) ?? BODIES[3];
}
/** Compressed orbit so Neptune is a flight, not a day. */
function orbitRadius(au) {
	if (au <= 0) return 0;
	return 200 + Math.pow(au, .62) * 460;
}
var EARTH_ORBIT = orbitRadius(1);
function visualRadius(body) {
	if (body.id === "sun") return 64;
	if (body.speck) return 1.15;
	const scaled = 8.2 * Math.pow(body.diameterKm / 12742, .42);
	const floor = body.parent ? 1.8 : 4.2;
	return Math.max(floor, scaled);
}
function surveyRadius(body) {
	if (body.speck) return 18;
	if (body.id === "sun") return visualRadius(body) * 2.2 + 28;
	if (body.parent) return visualRadius(body) * 3 + 12;
	return visualRadius(body) * 4.2 + 28;
}
function bodyPosition(body, time) {
	if (body.parent) {
		const origin = bodyPosition(bodyById(body.parent), time);
		const spin = time * .45 + body.angle;
		const local = body.localR ?? 30;
		return {
			x: origin.x + Math.cos(spin) * local,
			y: origin.y,
			z: origin.z + Math.sin(spin) * local
		};
	}
	if (body.au <= 0) return {
		x: 0,
		y: 0,
		z: 0
	};
	if (body.periAu && body.ecc && body.meanMotion) {
		const apAu = body.periAu * (1 + body.ecc) / (1 - body.ecc);
		const rp = orbitRadius(body.periAu);
		const ra = orbitRadius(apAu);
		const a = (rp + ra) / 2;
		const e = (ra - rp) / (ra + rp);
		const theta = body.angle + time * body.meanMotion;
		const radius = a * (1 - e * e) / (1 + e * Math.cos(theta));
		return {
			x: Math.cos(theta) * radius,
			y: body.lift ?? 0,
			z: Math.sin(theta) * radius
		};
	}
	const spin = body.periodDays === 0 ? 0 : .006 / Math.pow(body.au, 1.5);
	const angle = body.angle + time * spin;
	const radius = orbitRadius(body.au);
	return {
		x: Math.cos(angle) * radius,
		y: body.lift ?? 0,
		z: Math.sin(angle) * radius
	};
}
/** Camera looks along +Z in camera space. +yaw looks left. */
function cameraForward(yaw, pitch) {
	const cp = Math.cos(pitch);
	const sp = Math.sin(pitch);
	const cy = Math.cos(yaw);
	return {
		x: -Math.sin(yaw) * cp,
		y: sp,
		z: cy * cp
	};
}
function worldToCamera(dx, dy, dz, yaw, pitch) {
	const cy = Math.cos(yaw);
	const sy = Math.sin(yaw);
	const cp = Math.cos(pitch);
	const sp = Math.sin(pitch);
	const x1 = dx * cy + dz * sy;
	const z1 = -dx * sy + dz * cy;
	return {
		x: x1,
		y: dy * cp - z1 * sp,
		z: dy * sp + z1 * cp
	};
}
var TASKS = [
	{
		id: "soft",
		name: "Soft arrival",
		how: "Reach a world yourself, slower than warp 0.9. Go does not count."
	},
	{
		id: "sling",
		name: "Slingshot",
		how: "Graze a giant, miss the planet, and leave faster than you arrived."
	},
	{
		id: "ring",
		name: "Ring cut",
		how: "Drop onto Saturn’s ring plane and cross it clear of the planet."
	},
	{
		id: "wing",
		name: "Hold the wing",
		how: "Keep a moon centered in the wing camera for four seconds."
	},
	{
		id: "shadow",
		name: "Shadow pass",
		how: "Come in on a planet from beyond it, so you face the night side."
	},
	{
		id: "eclipse",
		name: "Eclipse",
		how: "Line a moon up so it crosses the Sun."
	}
];
var GIANTS = [
	"jupiter",
	"saturn",
	"uranus",
	"neptune"
];
var SOFT_SPEED = 22;
function createTaskState() {
	return {
		done: {},
		inside: {},
		sling: null,
		wing: 0,
		eclipse: 0
	};
}
function hypot(x, y, z = 0) {
	return Math.hypot(x, y, z);
}
function stepTasks(memory, ctx) {
	let hit = null;
	const mark = (id) => {
		if (memory.done[id] || hit) return;
		memory.done[id] = true;
		hit = id;
	};
	const ship = {
		x: ctx.shipX,
		y: ctx.shipY,
		z: ctx.shipZ
	};
	const shipR = hypot(ship.x, ship.y, ship.z) || 1;
	for (const body of BODIES) {
		if (!body.goal || body.quiet) continue;
		const pos = bodyPosition(body, ctx.time);
		const dist = hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z);
		const bubble = surveyRadius(body);
		const was = memory.inside[body.id] ?? false;
		const inside = dist < bubble;
		memory.inside[body.id] = inside;
		if (!memory.done.soft && inside && !was && !ctx.autopilot && ctx.speed < SOFT_SPEED) mark("soft");
	}
	for (const id of GIANTS) {
		const body = BODIES.find((item) => item.id === id);
		if (!body) continue;
		const pos = bodyPosition(body, ctx.time);
		const dx = pos.x - ship.x;
		const dy = pos.y - ship.y;
		const dz = pos.z - ship.z;
		const dist = hypot(dx, dy, dz);
		const vis = visualRadius(body);
		const shell = surveyRadius(body) * 3.2;
		const active = memory.sling;
		if (dist < vis * 1.2 && active?.id === id) active.hit = true;
		if (dist < shell) {
			const nx = dx / (dist || 1);
			const ny = dy / (dist || 1);
			const nz = dz / (dist || 1);
			const forward = cameraForward(ctx.yaw, ctx.pitch);
			const facing = Math.abs(forward.x * nx + forward.y * ny + forward.z * nz);
			if (!active || active.id !== id) memory.sling = {
				id,
				entry: ctx.speed,
				min: dist,
				tangent: facing < .5,
				hit: dist < vis * 1.2
			};
			else if (dist < active.min) {
				active.min = dist;
				active.tangent = facing < .5;
			}
		} else if (active?.id === id && dist > shell * 1.12) {
			const survey = surveyRadius(body);
			if (!memory.done.sling && !active.hit && active.tangent && active.min > vis * 1.35 && active.min < survey * 2.4 && ctx.speed > active.entry * 1.12) mark("sling");
			memory.sling = null;
		}
	}
	if (!memory.done.ring) {
		const saturn = BODIES.find((item) => item.id === "saturn");
		if (saturn) {
			const pos = bodyPosition(saturn, ctx.time);
			const flat = Math.hypot(ship.x - pos.x, ship.z - pos.z);
			const vis = visualRadius(saturn);
			if (Math.abs(ship.y - pos.y) < 1.7 && flat > vis * 1.5 && flat < vis * 2.8) mark("ring");
		}
	}
	if (!memory.done.wing) {
		if (ctx.view !== "wing") memory.wing = 0;
		else {
			let held = false;
			for (const body of BODIES) {
				if (!body.parent) continue;
				const pos = bodyPosition(body, ctx.time);
				const cam0 = worldToCamera(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z, ctx.yaw, ctx.pitch);
				const camZ = cam0.z - ctx.eyeZ;
				if (camZ < 1) continue;
				const nx = (cam0.x - ctx.eyeX) / camZ / Math.max(.2, ctx.tan) / Math.max(.2, ctx.aspect);
				const ny = (cam0.y - ctx.eyeY) / camZ / Math.max(.2, ctx.tan);
				if (nx * nx + ny * ny < .2 * .2) held = true;
			}
			memory.wing = held ? memory.wing + ctx.dt : Math.max(0, memory.wing - ctx.dt * 1.5);
			if (memory.wing > 4) mark("wing");
		}
	}
	if (!memory.done.shadow) for (const body of BODIES) {
		if (!body.goal || body.parent || body.au <= 0 || body.quiet) continue;
		const pos = bodyPosition(body, ctx.time);
		const dist = hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z);
		const vis = visualRadius(body);
		const pr = hypot(pos.x, pos.y, pos.z) || 1;
		const align = (ship.x * pos.x + ship.y * pos.y + ship.z * pos.z) / (shipR * pr);
		if (dist < surveyRadius(body) && dist > vis * 1.4 && shipR > pr + vis && align > .94) mark("shadow");
	}
	if (!memory.done.eclipse) {
		const toSunX = -ship.x;
		const toSunY = -ship.y;
		const toSunZ = -ship.z;
		const sunD = shipR;
		let aligned = false;
		for (const body of BODIES) {
			if (!body.parent) continue;
			const pos = bodyPosition(body, ctx.time);
			const mx = pos.x - ship.x;
			const my = pos.y - ship.y;
			const mz = pos.z - ship.z;
			const md = hypot(mx, my, mz);
			if (md < 6 || md > sunD) continue;
			if ((mx * toSunX + my * toSunY + mz * toSunZ) / (md * sunD) > .997) aligned = true;
		}
		memory.eclipse = aligned ? memory.eclipse + ctx.dt : 0;
		if (memory.eclipse > .45) mark("eclipse");
	}
	return hit;
}
var BG_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;
var BG_FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uBg;
uniform float uRoll;
uniform float uBoost;
uniform float uAspect;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float dust(vec2 uv, vec2 shift, vec2 scale, float cutoff) {
  vec2 grid = uv * scale + shift;
  vec2 cell = floor(grid);
  vec2 f = fract(grid);
  float h = hash21(cell);
  vec2 star = vec2(hash21(cell + vec2(1.7)), hash21(cell + vec2(8.2)));
  float d = length(f - star);
  float core = smoothstep(0.045, 0.0, d);
  return step(cutoff, h) * core * (0.35 + 0.65 * h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  uv.x *= uAspect;
  float cs = cos(uRoll);
  float sn = sin(uRoll);
  uv = vec2(cs * uv.x - sn * uv.y, sn * uv.x + cs * uv.y);

  vec2 sampleUv = uv + vec2(uBg.x * 6.0, uBg.y * 6.0);
  vec3 col = vec3(0.027, 0.031, 0.043);
  float laneY = sampleUv.y * 0.55;
  float lane = exp(-(laneY * laneY) * 0.72);
  col += vec3(0.055, 0.066, 0.09) * lane;
  col += vec3(0.02, 0.025, 0.038) * exp(-dot(uv, uv) * 0.35);

  col += vec3(0.62, 0.72, 0.9) * dust(sampleUv, vec2(0.0, 0.0), vec2(70.0, 52.0), 0.985) * 0.55;
  col += vec3(0.78, 0.82, 0.9) * dust(sampleUv, uBg * 2.0, vec2(130.0, 100.0), 0.992) * 0.4;

  float r = length(uv);
  col *= mix(0.62, 1.0, smoothstep(1.35, 0.25, r));
  col += vec3(0.16, 0.2, 0.26) * uBoost * smoothstep(0.55, 1.45, r) * 0.22;

  float n = hash21(gl_FragCoord.xy + fract(uBg.x * 50.0));
  col += (n - 0.5) * 0.01;
  fragColor = vec4(col, 1.0);
}
`;
var STAR_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aStar;
uniform float uFovTan;
uniform float uAspect;
uniform float uStretch;
uniform float uYawLag;
uniform float uPitchLag;
uniform float uRoll;
uniform float uPixel;
uniform float uWidth;
uniform float uNear;
uniform float uFar;
uniform float uBoost;
out float vAlong;
out float vSide;
out float vBright;
out float vColor;
out float vStreak;
out float vPhase;
out float vFade;

void main() {
  float packed = aStar.w;
  float colorId = floor(packed / 4.0 + 0.001);
  float bright = packed - colorId * 4.0;
  vec3 pos = aStar.xyz;
  vAlong = 0.0;
  vSide = 0.0;
  vBright = bright;
  vColor = colorId;
  vStreak = 0.0;
  vPhase = packed;
  vFade = 0.0;

  if (pos.z < uNear * 0.45) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  vec3 prev = vec3(
    pos.x - pos.z * uYawLag,
    pos.y + pos.z * uPitchLag,
    pos.z + uStretch * (0.62 + bright * 0.7)
  );
  float z0 = max(pos.z, 0.08);
  float z1 = max(prev.z, 0.08);
  float s0 = 1.0 / (z0 * uFovTan);
  float s1 = 1.0 / (z1 * uFovTan);
  vec2 head = vec2(pos.x * s0 / uAspect, pos.y * s0);
  vec2 tail = vec2(prev.x * s1 / uAspect, prev.y * s1);

  int id = gl_VertexID;
  float along = (id == 1 || id == 3 || id == 4) ? 1.0 : 0.0;
  float side = (id == 2 || id == 4 || id == 5) ? 1.0 : -1.0;

  vec2 dir = head - tail;
  float len = length(dir);
  vec2 nrm = vec2(1.0, 0.0);
  if (len > 0.0008) nrm = dir / len;
  vec2 perp = vec2(-nrm.y, nrm.x);

  float width = uPixel * uWidth * (1.05 + bright * 2.15);
  width *= clamp(3.4 / max(pos.z, 0.7), 0.5, 2.6);
  float maxLen = 0.5 + uBoost * 0.4;
  if (len > maxLen) {
    tail = head - nrm * maxLen;
    len = maxLen;
    dir = head - tail;
  }
  float minLen = width * 2.0;
  float streak = clamp(len / max(width * 3.0, 0.0001), 0.0, 1.0);
  if (len < minLen) {
    nrm = vec2(1.0, 0.0);
    perp = vec2(0.0, 1.0);
    tail = head - nrm * minLen;
  }

  vec2 p = mix(tail, head, along) + perp * side * width;
  float cs = cos(uRoll);
  float sn = sin(uRoll);
  p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  gl_Position = vec4(p, 0.0, 1.0);

  float nearFade = smoothstep(uNear * 0.55, uNear * 2.4, pos.z);
  float farFade = smoothstep(uFar, uFar * 0.62, pos.z);
  vAlong = along;
  vSide = side;
  vStreak = streak;
  vFade = nearFade * mix(0.22, 1.0, clamp(1.0 - pos.z / uFar, 0.0, 1.0)) * farFade;
}
`;
var STAR_FS = `#version 300 es
precision highp float;
uniform float uGain;
uniform float uBoost;
uniform float uTwinkle;
uniform float uTime;
in float vAlong;
in float vSide;
in float vBright;
in float vColor;
in float vStreak;
in float vPhase;
in float vFade;
out vec4 fragColor;

void main() {
  float across = exp(-vSide * vSide * 2.35);
  float streakShade = smoothstep(0.0, 0.48, vAlong);
  float dAlong = (vAlong - 0.5) * 2.15;
  float pointShade = exp(-(dAlong * dAlong));
  float axial = mix(pointShade, streakShade, vStreak);
  float tw = 0.8 + 0.2 * sin(uTime * 1.6 + vPhase * 12.0);
  float alpha = across * axial * vBright * vFade * uGain;
  alpha *= mix(1.0, tw, uTwinkle);
  if (alpha < 0.004) discard;

  vec3 cool = vec3(0.66, 0.78, 1.0);
  vec3 white = vec3(0.94, 0.96, 1.0);
  vec3 warm = vec3(1.0, 0.93, 0.84);
  vec3 base = vColor < 0.5 ? cool : (vColor < 1.5 ? white : warm);
  base = mix(base, vec3(1.0), 0.42 + vAlong * 0.28);
  float split = uBoost * vSide * 0.16 * vStreak;
  base.r *= 1.0 + split;
  base.b *= 1.0 - split;
  vec3 tail = vec3(0.45, 0.68, 1.0);
  base = mix(mix(tail, base, vAlong), base, 1.0 - uBoost * 0.75);
  fragColor = vec4(base * alpha, alpha);
}
`;
var PLANET_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aDisc;
layout(location = 1) in vec4 aTint;
layout(location = 2) in vec4 aLight;
uniform float uRoll;
out vec2 vUv;
out vec3 vTint;
out float vKind;
out vec3 vLight;
out float vStyle;
void main() {
  int id = gl_VertexID;
  float ux = -1.0;
  float uy = -1.0;
  if (id == 1 || id == 3 || id == 4) ux = 1.0;
  if (id == 2 || id == 4 || id == 5) uy = 1.0;
  vec2 p = vec2(aDisc.x + ux * aDisc.z, aDisc.y + uy * aDisc.w);
  float cs = cos(uRoll);
  float sn = sin(uRoll);
  p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = vec2(ux, uy);
  vTint = aTint.rgb;
  vKind = aTint.a;
  vLight = aLight.xyz;
  vStyle = aLight.w;
}
`;
var PLANET_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vTint;
in float vKind;
in vec3 vLight;
in float vStyle;
out vec4 fragColor;
void main() {
  float r2 = dot(vUv, vUv);
  float r = sqrt(r2);
  vec3 L = normalize(vLight);
  vec4 color = vec4(0.0);
  if (vKind < 0.12) {
    if (r > 1.0) discard;
    float glow = exp(-r2 * 1.05);
    color = vec4(vTint * (0.65 + glow), glow);
  } else if (vKind < 0.5) {
    float shell = exp(-pow((r - 0.78) * 4.4, 2.0));
    float day = 0.12 + 0.88 * clamp(dot(normalize(vec3(vUv, 0.15)), L), 0.0, 1.0);
    float a = shell * day;
    color = vec4(vTint * (0.55 + 0.45 * day), a * 0.85);
  } else if (vKind > 1.5) {
    float outer = 1.0 - smoothstep(0.9, 1.0, r);
    float inner = smoothstep(0.46, 0.56, r);
    float gapIn = smoothstep(0.64, 0.68, r);
    float gapOut = 1.0 - smoothstep(0.72, 0.76, r);
    float gap = gapIn * gapOut;
    float a = outer * inner * (1.0 - gap * 0.72);
    float day = 0.28 + 0.72 * clamp(dot(normalize(vUv + vec2(0.001)), normalize(L.xy + vec2(0.001))), 0.0, 1.0);
    color = vec4(vTint * day, a * 0.82);
  } else {
    if (r2 > 1.0) discard;
    float nz = sqrt(max(0.0, 1.0 - r2));
    vec3 n = vec3(vUv.x, vUv.y, nz);
    float ndl = dot(n, L);
    float shade = 0.035 + 0.965 * smoothstep(-0.12, 0.42, ndl);
    float bands = 0.0;
    vec3 tint = vTint;
    if (vStyle > 0.5 && vStyle < 1.5) {
      float belt = sin((vUv.y + 0.12 * sin(vUv.x * 5.0)) * 16.0);
      bands = belt * 0.11 * shade;
      tint *= 1.0 + belt * 0.06;
    } else if (vStyle > 1.5 && vStyle < 2.5) {
      float land = smoothstep(0.08, 0.55, abs(vUv.y + 0.08 * sin(vUv.x * 4.0)));
      tint = mix(tint * vec3(0.72, 0.86, 0.7), tint, land);
    } else if (vStyle > 2.5) {
      float belt = sin(vUv.y * 10.0) * 0.04 * shade;
      bands = belt;
    }
    float rim = pow(1.0 - nz, 1.7);
    float limb = rim * (0.2 + 0.8 * clamp(ndl, 0.0, 1.0));
    vec3 lit = tint * shade + vec3(bands);
    lit += mix(vTint, vec3(0.75, 0.86, 1.0), 0.35) * limb * 0.55;
    color = vec4(lit, 1.0);
  }
  if (color.a < 0.02) discard;
  fragColor = color;
}
`;
var SHIP_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aGlow;
uniform vec3 uEye;
uniform float uFovTan;
uniform float uAspect;
uniform float uRoll;
out vec3 vColor;
out float vGlow;
void main() {
  vec3 c = aPos - uEye;
  float z = max(c.z, 0.05);
  vec2 p = vec2(c.x / z / uFovTan / uAspect, c.y / z / uFovTan);
  float cs = cos(uRoll);
  float sn = sin(uRoll);
  p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  float depth = c.z < 0.4 ? 2.0 : clamp(c.z / 48.0, 0.0, 0.98);
  gl_Position = vec4(p, depth, 1.0);
  vColor = aColor;
  vGlow = aGlow;
}
`;
var SHIP_FS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vGlow;
uniform float uBoost;
out vec4 fragColor;
void main() {
  vec3 col = vColor + vec3(0.40, 0.58, 0.95) * vGlow * (0.4 + uBoost);
  fragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`;
var TRAIL_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
out float vAlpha;
void main() {
  vAlpha = aPos.z;
  gl_Position = vec4(aPos.xy, 0.0, 1.0);
}
`;
var TRAIL_FS = `#version 300 es
precision highp float;
in float vAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.74, 0.82, 0.94, vAlpha);
}
`;
function shipMesh() {
	const v = [];
	const push = (a, b, c, color, glow = 0) => {
		for (const p of [
			a,
			b,
			c
		]) v.push(p[0], p[1], p[2], color[0], color[1], color[2], glow);
	};
	const nose = [
		0,
		.04,
		2.55
	];
	const spine = [
		0,
		.34,
		.25
	];
	const keel = [
		0,
		-.2,
		.15
	];
	const right = [
		1.85,
		.02,
		-.45
	];
	const left = [
		-1.85,
		.02,
		-.45
	];
	const tailTop = [
		0,
		.18,
		-1.55
	];
	const tailBot = [
		0,
		-.14,
		-1.55
	];
	const top = [
		.86,
		.89,
		.94
	];
	const hull = [
		.62,
		.66,
		.74
	];
	const shade = [
		.4,
		.44,
		.52
	];
	const belly = [
		.22,
		.24,
		.3
	];
	const glass = [
		.78,
		.86,
		.96
	];
	push(nose, right, spine, top);
	push(nose, spine, left, top);
	push(spine, right, tailTop, hull);
	push(spine, tailTop, left, hull);
	push(nose, keel, right, shade);
	push(nose, left, keel, shade);
	push(keel, tailBot, right, belly);
	push(keel, left, tailBot, belly);
	push(tailTop, [
		.42,
		-.02,
		-1.55
	], tailBot, belly);
	push(tailTop, tailBot, [
		-.42,
		-.02,
		-1.55
	], belly);
	const peak = [
		0,
		.58,
		.22
	];
	const brow = [
		0,
		.14,
		1.15
	];
	push(brow, [
		.26,
		.16,
		.18
	], peak, glass);
	push(brow, peak, [
		-.26,
		.16,
		.18
	], glass);
	const lamp = (x) => {
		const z = -1.72;
		push([
			x - .2,
			.12000000000000001,
			z
		], [
			x + .2,
			.12000000000000001,
			z
		], [
			x,
			-.09999999999999999,
			z
		], [
			.55,
			.7,
			.95
		], 1);
	};
	lamp(-.48);
	lamp(.48);
	return new Float32Array(v);
}
var SHIP_DATA = shipMesh();
var SHIP_STRIDE = 7;
var SHIP_VERTS = SHIP_DATA.length / SHIP_STRIDE;
function holdRadius(body) {
	const vis = visualRadius(body);
	if (body.id === "sun") return 210;
	if (body.speck) return 24;
	if (body.parent) return Math.max(16, vis * 3.2 + 8);
	return Math.max(30, vis * 3.6 + 12);
}
function orbitTangent(rx, ry, rz) {
	let x = -rz;
	let y = 0;
	let z = rx;
	let len = Math.hypot(x, y, z);
	if (len < 1) {
		x = ry;
		y = -rx;
		z = 0;
		len = Math.hypot(x, y, z) || 1;
	}
	return {
		x: x / len,
		y: y / len,
		z: z / len
	};
}
function shape(v) {
	const dz = .07;
	const a = Math.abs(v);
	if (a < dz) return 0;
	const s = (a - dz) / .9299999999999999;
	return Math.sign(v) * Math.pow(s, 1.2);
}
function wrap01(v) {
	const x = v % 1;
	return x < 0 ? x + 1 : x;
}
function compile(gl, type, source) {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("Could not create a shader.");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader) ?? "shader compile failed";
		gl.deleteShader(shader);
		throw new Error(log);
	}
	return shader;
}
function link(gl, vs, fs) {
	const program = gl.createProgram();
	if (!program) throw new Error("Could not create a program.");
	const v = compile(gl, gl.VERTEX_SHADER, vs);
	const f = compile(gl, gl.FRAGMENT_SHADER, fs);
	gl.attachShader(program, v);
	gl.attachShader(program, f);
	gl.linkProgram(program);
	gl.deleteShader(v);
	gl.deleteShader(f);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program) ?? "program link failed";
		gl.deleteProgram(program);
		throw new Error(log);
	}
	return program;
}
var StarfieldEngine = class {
	canvas;
	hooks;
	audio = new DriftAudio();
	data = new Float32Array(MAX_STARS * 4);
	keys = /* @__PURE__ */ new Set();
	abort = new AbortController();
	gl = null;
	ctx2d = null;
	bg = null;
	stars = null;
	vao = null;
	buf = null;
	bgLocs = {};
	starLocs = {};
	raf = 0;
	running = false;
	destroyed = false;
	mode = "none";
	reported = false;
	yaw = 0;
	pitch = 0;
	orbitSign = 1;
	orbitId = "";
	lapFor = "";
	lapSkip = "";
	lapSwept = 0;
	lapTheta = 0;
	lapArmed = false;
	lapConfirmed = false;
	lapRelease = false;
	lapIgnoreBoost = false;
	passId = "";
	passDist = Infinity;
	speed = 28;
	boost = 0;
	rush = 0;
	fov = 70 * Math.PI / 180;
	tanFov = Math.tan(70 * Math.PI / 180 / 2);
	aspect = 1;
	bank = 0;
	bgX = 0;
	bgY = 0;
	time = 0;
	live = 0;
	frames = 0;
	fps = 60;
	stress = 0;
	quality = 1;
	steerOverride = 0;
	smoothPX = 0;
	smoothPY = 0;
	stickX = 0;
	stickY = 0;
	pointerX = 0;
	pointerY = 0;
	hasPointer = false;
	hudPointer = -1;
	leveling = false;
	audioAcc = 0;
	lastWarp = "";
	yawLagRate = 0;
	pitchLagRate = 0;
	mobile = false;
	sized = false;
	shipX = 0;
	shipY = 6;
	shipZ = 0;
	placed = false;
	nearId = "";
	alert = "";
	planets = null;
	planetVao = null;
	planetBuf = null;
	planetLocs = {};
	planetData = /* @__PURE__ */ new Float32Array(960);
	planetCount = 0;
	shipProg = null;
	shipVao = null;
	shipBuf = null;
	shipLocs = {};
	eyeX = 0;
	eyeY = 0;
	eyeZ = 0;
	taskMem = createTaskState();
	trail = [];
	trailProg = null;
	trailVao = null;
	trailBuf = null;
	trailDraw = /* @__PURE__ */ new Float32Array(288);
	markers = [];
	probe = {
		getYaw: () => this.yaw,
		getSpeed: () => this.speed,
		getPitch: () => this.pitch,
		getFps: () => this.fps,
		setSteer: (v) => {
			this.steerOverride = clamp(v, -1, 1);
		},
		setKeys: (codes) => {
			this.keys.clear();
			for (const code of codes) this.keys.add(code);
		}
	};
	constructor(canvas, hooks) {
		this.canvas = canvas;
		this.hooks = hooks;
	}
	start() {
		if (this.running) return;
		this.running = true;
		this.mobile = window.matchMedia("(pointer: coarse)").matches;
		this.placeShip();
		this.initRenderer();
		this.resize();
		this.spawnAll();
		this.bindInput();
		window.__controlsTest = this.probe;
		this.raf = requestAnimationFrame(this.frame);
	}
	level() {
		this.leveling = true;
	}
	destroy() {
		this.destroyed = true;
		this.running = false;
		cancelAnimationFrame(this.raf);
		this.abort.abort();
		this.audio.dispose();
		if (window.__controlsTest === this.probe) delete window.__controlsTest;
		const gl = this.gl;
		if (gl) {
			if (this.bg) gl.deleteProgram(this.bg);
			if (this.stars) gl.deleteProgram(this.stars);
			if (this.buf) gl.deleteBuffer(this.buf);
			if (this.vao) gl.deleteVertexArray(this.vao);
			if (this.planets) gl.deleteProgram(this.planets);
			if (this.planetBuf) gl.deleteBuffer(this.planetBuf);
			if (this.planetVao) gl.deleteVertexArray(this.planetVao);
			if (this.shipProg) gl.deleteProgram(this.shipProg);
			if (this.shipBuf) gl.deleteBuffer(this.shipBuf);
			if (this.shipVao) gl.deleteVertexArray(this.shipVao);
			if (this.trailProg) gl.deleteProgram(this.trailProg);
			if (this.trailBuf) gl.deleteBuffer(this.trailBuf);
			if (this.trailVao) gl.deleteVertexArray(this.trailVao);
		}
		this.gl = null;
	}
	initRenderer() {
		const gl = this.canvas.getContext("webgl2", {
			alpha: false,
			antialias: false,
			depth: true,
			stencil: false,
			powerPreference: "high-performance",
			failIfMajorPerformanceCaveat: false
		});
		if (gl) try {
			this.gl = gl;
			this.bg = link(gl, BG_VS, BG_FS);
			this.stars = link(gl, STAR_VS, STAR_FS);
			for (const name of [
				"uRes",
				"uBg",
				"uRoll",
				"uBoost",
				"uAspect"
			]) this.bgLocs[name] = gl.getUniformLocation(this.bg, name);
			for (const name of [
				"uFovTan",
				"uAspect",
				"uStretch",
				"uYawLag",
				"uPitchLag",
				"uRoll",
				"uPixel",
				"uWidth",
				"uNear",
				"uFar",
				"uBoost",
				"uGain",
				"uTwinkle",
				"uTime"
			]) this.starLocs[name] = gl.getUniformLocation(this.stars, name);
			this.vao = gl.createVertexArray();
			this.buf = gl.createBuffer();
			gl.bindVertexArray(this.vao);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
			gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
			gl.vertexAttribDivisor(0, 1);
			gl.bindVertexArray(null);
			this.initPlanets(gl);
			this.initShip(gl);
			this.initTrail(gl);
			gl.disable(gl.DEPTH_TEST);
			gl.disable(gl.CULL_FACE);
			const dbg = gl.getExtension("WEBGL_debug_renderer_info");
			if (dbg) {
				const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "");
				if (/swiftshader|llvmpipe|software/i.test(renderer)) this.quality = .45;
			}
			this.mode = "webgl";
			return;
		} catch (err) {
			this.fail(err instanceof Error ? err.message : "WebGL failed to start.");
		}
		const ctx = this.canvas.getContext("2d", { alpha: false });
		if (ctx) {
			this.ctx2d = ctx;
			this.mode = "2d";
			this.quality = .55;
			return;
		}
		this.fail("This browser cannot draw the starfield.");
	}
	initPlanets(gl) {
		try {
			this.planets = link(gl, PLANET_VS, PLANET_FS);
			this.planetLocs.uRoll = gl.getUniformLocation(this.planets, "uRoll");
			this.planetVao = gl.createVertexArray();
			this.planetBuf = gl.createBuffer();
			gl.bindVertexArray(this.planetVao);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.planetBuf);
			gl.bufferData(gl.ARRAY_BUFFER, this.planetData.byteLength, gl.DYNAMIC_DRAW);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 48, 0);
			gl.vertexAttribDivisor(0, 1);
			gl.enableVertexAttribArray(1);
			gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 48, 16);
			gl.vertexAttribDivisor(1, 1);
			gl.enableVertexAttribArray(2);
			gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 48, 32);
			gl.vertexAttribDivisor(2, 1);
			gl.bindVertexArray(null);
		} catch (err) {
			this.planets = null;
			console.error(err instanceof Error ? err.message : "planet shader failed");
		}
	}
	initShip(gl) {
		try {
			this.shipProg = link(gl, SHIP_VS, SHIP_FS);
			for (const name of [
				"uEye",
				"uFovTan",
				"uAspect",
				"uRoll",
				"uBoost"
			]) this.shipLocs[name] = gl.getUniformLocation(this.shipProg, name);
			this.shipVao = gl.createVertexArray();
			this.shipBuf = gl.createBuffer();
			gl.bindVertexArray(this.shipVao);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.shipBuf);
			gl.bufferData(gl.ARRAY_BUFFER, SHIP_DATA, gl.STATIC_DRAW);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
			gl.enableVertexAttribArray(1);
			gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
			gl.enableVertexAttribArray(2);
			gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
			gl.bindVertexArray(null);
		} catch (err) {
			this.shipProg = null;
			console.error(err instanceof Error ? err.message : "ship shader failed");
		}
	}
	initTrail(gl) {
		try {
			this.trailProg = link(gl, TRAIL_VS, TRAIL_FS);
			this.trailVao = gl.createVertexArray();
			this.trailBuf = gl.createBuffer();
			gl.bindVertexArray(this.trailVao);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
			gl.bufferData(gl.ARRAY_BUFFER, this.trailDraw.byteLength, gl.DYNAMIC_DRAW);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
			gl.bindVertexArray(null);
		} catch (err) {
			this.trailProg = null;
			console.error(err instanceof Error ? err.message : "trail shader failed");
		}
	}
	placeShip() {
		if (this.placed) return;
		this.placed = true;
		const earth = bodyPosition(bodyById("earth"), 0);
		const len = Math.hypot(earth.x, earth.z) || 1;
		const ox = earth.x / len;
		const oz = earth.z / len;
		const tx = -oz;
		const tz = ox;
		this.shipX = earth.x + ox * 78 + tx * 96;
		this.shipY = 4;
		this.shipZ = earth.z + oz * 78 + tz * 96;
		const dx = earth.x - this.shipX;
		const dz = earth.z - this.shipZ;
		const fl = Math.hypot(dx, dz) || 1;
		this.yaw = Math.atan2(-dx / fl, dz / fl);
		this.pitch = -.04;
	}
	fail(message) {
		if (this.reported) return;
		this.reported = true;
		this.mode = "none";
		this.hooks.current.onError(message);
	}
	bindInput() {
		const { signal } = this.abort;
		window.addEventListener("pointermove", this.onPointerMove, { signal });
		window.addEventListener("pointerdown", this.onPointerDown, { signal });
		window.addEventListener("pointerup", this.onPointerUp, { signal });
		window.addEventListener("pointercancel", this.onPointerUp, { signal });
		document.documentElement.addEventListener("pointerleave", this.onPointerLeave, { signal });
		window.addEventListener("keydown", this.onKeyDown, { signal });
		window.addEventListener("keyup", this.onKeyUp, { signal });
		window.addEventListener("blur", this.clearKeys, { signal });
		window.addEventListener("wheel", this.onWheel, {
			passive: false,
			signal
		});
		document.addEventListener("visibilitychange", this.onVis, { signal });
		const ro = new ResizeObserver(() => this.resize());
		ro.observe(this.canvas);
		signal.addEventListener("abort", () => ro.disconnect());
	}
	isHud(target) {
		return target instanceof Element && Boolean(target.closest("[data-hud]"));
	}
	onPointerMove = (e) => {
		if (e.pointerId === this.hudPointer) return;
		if (e.pointerType === "touch" && e.buttons === 0) return;
		if (this.isHud(e.target)) {
			this.hasPointer = false;
			this.pointerX = 0;
			this.pointerY = 0;
			return;
		}
		this.hasPointer = true;
		this.readPointer(e);
	};
	onPointerDown = (e) => {
		this.audio.unlock();
		if (this.isHud(e.target)) {
			this.hudPointer = e.pointerId;
			this.hasPointer = false;
			this.pointerX = 0;
			this.pointerY = 0;
			return;
		}
		if (e.pointerType === "touch") {
			this.hasPointer = true;
			this.readPointer(e);
		}
	};
	onPointerUp = (e) => {
		if (e.pointerId === this.hudPointer) this.hudPointer = -1;
		if (e.pointerType !== "touch") return;
		this.hasPointer = false;
		this.pointerX = 0;
		this.pointerY = 0;
	};
	onPointerLeave = (e) => {
		if (e.pointerType === "touch") return;
		this.hasPointer = false;
		this.pointerX = 0;
		this.pointerY = 0;
	};
	readPointer(e) {
		const rect = this.canvas.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return;
		this.pointerX = clamp((e.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
		this.pointerY = clamp((e.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
	}
	onKeyDown = (e) => {
		this.audio.unlock();
		const hud = this.isHud(e.target);
		if (!hud && (e.code === "Space" || e.code.startsWith("Arrow"))) e.preventDefault();
		if (e.code === "Space" && !e.repeat && !hud) this.hooks.current.onToggleBoost();
		if (e.code === "KeyO" && !e.repeat && !hud) this.hooks.current.onToggleOrbit();
		if (!hud) this.keys.add(e.code);
	};
	onKeyUp = (e) => {
		this.keys.delete(e.code);
	};
	clearKeys = () => {
		this.keys.clear();
	};
	onWheel = (e) => {
		if (this.isHud(e.target)) return;
		e.preventDefault();
		const params = this.hooks.current.getParams();
		const step = clamp(e.deltaY / 1400, -.06, .06);
		this.hooks.current.onSpeed(clamp(params.speed - step, 0, 1));
	};
	onVis = () => {
		if (document.hidden) this.keys.clear();
		else this.audio.resume();
	};
	resize() {
		const dprCap = this.mode === "2d" ? 1 : this.mobile ? 1.25 : 1.5;
		const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
		const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
		const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w;
			this.canvas.height = h;
		}
		this.aspect = w / Math.max(1, h);
		if (!this.sized && this.canvas.clientWidth > 2) {
			this.sized = true;
			this.mobile = this.mobile || this.canvas.clientWidth < 700;
			this.live = 0;
		}
	}
	spawnAll() {
		for (let i = 0; i < MAX_STARS; i++) this.respawn(i, false, true);
	}
	respawn(i, farSlab, fresh = false) {
		const o = i * 4;
		const z = farSlab ? 96 * (.88 + Math.random() * .12) : NEAR + Math.random() * (96 - NEAR);
		const hy = z * this.tanFov * 1.35;
		const hx = hy * this.aspect * 1.35;
		let packed = this.data[o + 3] ?? 0;
		if (fresh || packed <= 0) {
			const bright = .32 + Math.pow(Math.random(), 1.55) * .68;
			const roll = Math.random();
			packed = bright + (roll < .16 ? 2 : roll < .52 ? 0 : 1) * 4;
		}
		this.data[o] = (Math.random() * 2 - 1) * hx;
		this.data[o + 1] = (Math.random() * 2 - 1) * hy;
		this.data[o + 2] = z;
		this.data[o + 3] = packed;
	}
	frame = (now) => {
		if (!this.running || this.destroyed) return;
		const dt = Math.min(.05, Math.max(.001, (now - (this.prevNow || now)) / 1e3));
		this.prevNow = now;
		this.step(dt);
		this.draw();
		this.raf = requestAnimationFrame(this.frame);
	};
	prevNow = 0;
	step(dt) {
		const params = this.hooks.current.getParams();
		const stick = this.readStick(dt);
		let sx = stick.x;
		let sy = stick.y;
		const manual = Math.abs(this.smoothPX) + Math.abs(this.smoothPY) > .42 || this.keys.has("KeyA") || this.keys.has("KeyD") || this.keys.has("ArrowLeft") || this.keys.has("ArrowRight") || this.keys.has("KeyW") || this.keys.has("KeyS") || this.keys.has("ArrowUp") || this.keys.has("ArrowDown");
		if (!params.boost) this.lapIgnoreBoost = false;
		if (params.boost && !this.lapIgnoreBoost && (this.orbitId || this.lapFor)) {
			this.lapSkip = this.lapFor || this.orbitId;
			this.clearLap(false);
			this.orbitId = "";
			this.lapRelease = false;
			if (params.orbit) this.hooks.current.onCancelOrbit();
		}
		if (params.orbit && this.lapFor && this.lapFor !== params.targetId) {
			this.clearLap(false);
			this.orbitId = "";
		}
		if (this.lapSkip) {
			const skipped = bodyById(this.lapSkip);
			if (this.rangeTo(skipped.id) > holdRadius(skipped) * 3.2) this.lapSkip = "";
		}
		if (this.lapFor && params.orbit && params.targetId === this.lapFor) this.lapConfirmed = true;
		if (!params.orbit) this.lapRelease = false;
		if (this.lapFor !== "" && this.lapConfirmed && !params.orbit) this.clearLap(true);
		if (!manual && !params.orbit && !this.lapFor && params.boost) {
			const pass = this.nearestPass(4);
			if (pass) {
				const dist = this.rangeTo(pass.id);
				const gate = holdRadius(pass) * 2.2;
				if (this.passId === pass.id && this.passDist > gate && dist <= gate && pass.id !== this.lapSkip) {
					this.lapFor = pass.id;
					this.lapSwept = 0;
					this.lapArmed = false;
					this.lapConfirmed = false;
					this.lapTheta = 0;
					this.lapIgnoreBoost = true;
					this.hooks.current.onBeginLap(pass.id);
				}
				this.passId = pass.id;
				this.passDist = dist;
			}
		} else if (!this.lapFor) {
			const pass = this.nearestPass(4);
			if (pass) {
				this.passId = pass.id;
				this.passDist = this.rangeTo(pass.id);
			}
		}
		const orbitBody = params.orbit ? params.targetId : this.lapFor || params.targetId;
		const burningOut = params.boost && !this.lapIgnoreBoost;
		const orbitOn = (params.orbit || this.lapFor !== "") && !manual && !this.lapRelease && !burningOut;
		if ((params.orbit || this.lapFor) && manual) {
			this.clearLap(true);
			this.hooks.current.onCancelOrbit();
		} else if (params.autopilot && manual) this.hooks.current.onCancelAutopilot();
		else if (orbitOn || params.autopilot) {
			const aim = this.aimStick(orbitBody);
			if (aim) {
				sx = clamp(aim.x, -1, 1);
				sy = clamp(aim.y, -1, 1);
			}
		}
		this.stickX = sx;
		this.stickY = sy;
		const yawSpeed = params.reducedMotion ? .55 : 1.25;
		const pitchSpeed = params.reducedMotion ? .4 : .85;
		const yawRate = -sx * yawSpeed;
		const pitchRate = -sy * pitchSpeed;
		const prevYaw = this.yaw;
		const prevPitch = this.pitch;
		this.yaw += yawRate * dt;
		if (this.leveling && Math.abs(stick.y) > .4) this.leveling = false;
		if (this.leveling) {
			this.pitch += (0 - this.pitch) * (1 - Math.exp(-8 * dt));
			if (Math.abs(this.pitch) < .004) {
				this.pitch = 0;
				this.leveling = false;
			}
		} else this.pitch = clamp(this.pitch + pitchRate * dt, -1.05, 1.05);
		const dYaw = this.yaw - prevYaw;
		const dPitch = this.pitch - prevPitch;
		const approach = this.rangeTo(params.targetId);
		const bubble = surveyRadius(bodyById(params.targetId));
		const autoBoost = params.autopilot && !orbitOn && approach > bubble * 3.2;
		const boostTarget = orbitOn ? 0 : params.boost || autoBoost ? 1 : 0;
		const bk = boostTarget > this.boost ? 5 : 2.5;
		this.boost += (boostTarget - this.boost) * (1 - Math.exp(-bk * dt));
		let targetSpeed = cruiseSpeed(params.speed, params.reducedMotion) * (1 + this.boost * 3.8);
		let orbitDir = null;
		if (orbitOn) {
			const body = bodyById(orbitBody);
			const pos = bodyPosition(body, this.time);
			const rx = this.shipX - pos.x;
			const ry = this.shipY - pos.y;
			const rz = this.shipZ - pos.z;
			const dist = Math.hypot(rx, ry, rz) || 1;
			const nx = rx / dist;
			const ny = ry / dist;
			const nz = rz / dist;
			const want = holdRadius(body);
			if (this.orbitId !== body.id) {
				this.orbitId = body.id;
				const seeded = orbitTangent(rx, ry, rz);
				const facing = cameraForward(this.yaw, this.pitch);
				const along = facing.x * seeded.x + facing.y * seeded.y + facing.z * seeded.z;
				this.orbitSign = along >= 0 ? 1 : -1;
			}
			const tangent = orbitTangent(rx, ry, rz);
			const vTan = clamp(want * (params.reducedMotion ? .16 : .28), params.reducedMotion ? 6 : 8, params.reducedMotion ? 12 : 16);
			const vRad = clamp((dist - want) * .9, -14, params.reducedMotion ? 16 : 26);
			const vx = tangent.x * this.orbitSign * vTan - nx * vRad;
			const vy = tangent.y * this.orbitSign * vTan - ny * vRad;
			const vz = tangent.z * this.orbitSign * vTan - nz * vRad;
			const mag = Math.hypot(vx, vy, vz) || 1;
			orbitDir = {
				x: vx / mag,
				y: vy / mag,
				z: vz / mag
			};
			targetSpeed = mag;
			if (this.lapFor === body.id) {
				const theta = Math.atan2(rz, rx);
				if (!this.lapArmed) {
					this.lapTheta = theta;
					if (dist < want * 1.25) this.lapArmed = true;
				} else {
					let turn = theta - this.lapTheta;
					if (turn > Math.PI) turn -= Math.PI * 2;
					if (turn < -Math.PI) turn += Math.PI * 2;
					this.lapTheta = theta;
					this.lapSwept += turn * this.orbitSign;
					if (this.lapSwept >= Math.PI * 2) {
						const tx = tangent.x * this.orbitSign;
						const ty = tangent.y * this.orbitSign;
						const tz = tangent.z * this.orbitSign;
						this.pitch = Math.asin(clamp(ty, -1, 1));
						const cp = Math.cos(this.pitch) || 1;
						this.yaw = Math.atan2(-tx / cp, tz / cp);
						this.lapRelease = true;
						this.clearLap(true);
						this.hooks.current.onEndLap();
					}
				}
			}
		} else {
			this.orbitId = "";
			if (params.autopilot && approach < bubble * 3) targetSpeed *= clamp(approach / (bubble * 3), .45, 1);
		}
		const respond = targetSpeed > this.speed ? 9 : 5.5;
		this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-respond * dt));
		if (!orbitOn && params.autopilot && approach < bubble * 1.2) this.hooks.current.onCancelAutopilot();
		const forward = orbitDir ?? cameraForward(this.yaw, this.pitch);
		this.shipX += forward.x * this.speed * dt;
		this.shipY = clamp(this.shipY + forward.y * this.speed * dt, -90, 90);
		this.shipZ += forward.z * this.speed * dt;
		const sunDist = Math.hypot(this.shipX, this.shipY, this.shipZ);
		if (sunDist < 128) {
			const push = (128 - sunDist) / 128 * this.speed * dt * 1.8;
			const inv = 1 / Math.max(sunDist, 1);
			this.shipX += this.shipX * inv * push;
			this.shipZ += this.shipZ * inv * push;
			this.alert = "Too close to the Sun";
		} else if (this.lapFor) this.alert = `One loop around ${bodyById(this.lapFor).name}`;
		else this.alert = "";
		const baseFov = params.view === "chase" ? 62 : params.view === "wing" ? 66 : 70;
		const pace = clamp((this.speed - 16) / 110, 0, 1);
		const fovTarget = ((params.reducedMotion ? baseFov - 6 : baseFov) + this.boost * 12 + pace * 11) * Math.PI / 180;
		this.fov += (fovTarget - this.fov) * (1 - Math.exp(-4 * dt));
		this.tanFov = Math.tan(this.fov * .5);
		this.rush = clamp(this.boost * .72 + pace * .85, 0, 1);
		const eye = params.view === "chase" ? [
			0,
			1.7,
			-11
		] : params.view === "wing" ? [
			5.4,
			1.5,
			-11
		] : [
			0,
			.15,
			.15
		];
		const ease = 1 - Math.exp(-3.4 * dt);
		this.eyeX += ((eye[0] ?? 0) - this.eyeX) * ease;
		this.eyeY += ((eye[1] ?? 0) - this.eyeY) * ease;
		this.eyeZ += ((eye[2] ?? 0) - this.eyeZ) * ease;
		const bankTarget = orbitOn ? -this.orbitSign * (params.reducedMotion ? .06 : .16) : clamp(-stick.x, -1, 1) * (params.reducedMotion ? .05 : .14);
		this.bank += (bankTarget - this.bank) * (1 - Math.exp(-6 * dt));
		this.bgX = wrap01(this.bgX - dYaw * .12);
		this.bgY = wrap01(this.bgY + dPitch * .12);
		this.time += dt;
		const lagK = 1 - Math.exp(-12 * dt);
		this.yawLagRate += (dYaw / dt - this.yawLagRate) * lagK;
		this.pitchLagRate += (dPitch / dt - this.pitchLagRate) * lagK;
		let budget = starBudget(params.density, this.mobile);
		if (this.mode === "2d") budget = Math.min(budget, 2e3);
		const active = Math.max(180, Math.round(budget * this.quality));
		if (active > this.live) for (let i = this.live; i < active; i++) this.respawn(i, false);
		this.live = active;
		this.integrateStars(dt, dYaw, dPitch);
		const rangeText = this.projectSystem(params.targetId);
		this.rememberTrail();
		const taskId = stepTasks(this.taskMem, {
			dt,
			speed: this.speed,
			autopilot: params.autopilot,
			view: params.view,
			yaw: this.yaw,
			pitch: this.pitch,
			eyeX: this.eyeX,
			eyeY: this.eyeY,
			eyeZ: this.eyeZ,
			tan: this.tanFov,
			aspect: this.aspect,
			shipX: this.shipX,
			shipY: this.shipY,
			shipZ: this.shipZ,
			time: this.time
		});
		if (taskId) this.hooks.current.onTask(taskId, this.time);
		this.frames += 1;
		this.fps += (1 / dt - this.fps) * .08;
		if (this.frames > 40 && this.mode === "webgl") {
			if (dt > .022 && dt < .08) this.stress += dt > .03 ? 2 : 1;
			else this.stress = Math.max(0, this.stress - 1);
			if (this.stress > 36 && this.quality > .42) {
				this.quality = Math.max(.42, this.quality - .08);
				this.stress = 0;
			}
		}
		this.audioAcc += dt;
		if (this.audioAcc > .12) {
			this.audioAcc = 0;
			this.audio.update(this.speed, this.boost, params.muted);
		}
		const warpText = warpFactor(this.speed).toFixed(2);
		const aimNow = this.aimStick(params.targetId);
		const locked = !!aimNow && Math.hypot(aimNow.x, aimNow.y) < .16;
		if (warpText !== this.lastWarp || this.frames % 2 === 0) {
			this.lastWarp = warpText;
			this.hooks.current.onFrame({
				warpText,
				stickX: this.stickX,
				stickY: this.stickY,
				pitch: this.pitch,
				leveling: this.leveling,
				boosting: this.boost > .35 || autoBoost,
				rangeText,
				targetId: params.targetId,
				nearId: this.nearId,
				alert: this.alert,
				markers: this.markers,
				locked,
				orbiting: orbitOn
			});
		}
	}
	clearLap(skip) {
		if (skip && this.lapFor) this.lapSkip = this.lapFor;
		this.lapFor = "";
		this.lapSwept = 0;
		this.lapArmed = false;
		this.lapConfirmed = false;
	}
	nearestPass(maxFactor) {
		let best = null;
		let bestScore = maxFactor;
		for (const body of BODIES) {
			if (body.id === "sun" || body.quiet || body.speck || !body.goal && !body.parent) continue;
			const score = this.rangeTo(body.id) / holdRadius(body);
			if (score < bestScore) {
				bestScore = score;
				best = body;
			}
		}
		return best;
	}
	aimStick(id) {
		const pos = bodyPosition(bodyById(id), this.time);
		const cam = worldToCamera(pos.x - this.shipX, pos.y - this.shipY, pos.z - this.shipZ, this.yaw, this.pitch);
		if (cam.z < 1) return {
			x: cam.x >= 0 ? .85 : -.85,
			y: clamp(-cam.y / 48, -.55, .55)
		};
		return {
			x: clamp(cam.x / cam.z * 1.7, -1, 1),
			y: clamp(-cam.y / cam.z * 1.7, -1, 1)
		};
	}
	rangeTo(id) {
		const pos = bodyPosition(bodyById(id), this.time);
		return Math.hypot(pos.x - this.shipX, pos.y - this.shipY, pos.z - this.shipZ);
	}
	projectSystem(targetId) {
		const aspect = this.aspect || 1;
		const tan = this.tanFov || .7;
		const cs = Math.cos(-this.bank);
		const sn = Math.sin(-this.bank);
		const rows = [];
		let near = "";
		let nearDist = Infinity;
		let rangeText = "—";
		for (const body of BODIES) {
			const pos = bodyPosition(body, this.time);
			const dx = pos.x - this.shipX;
			const dy = pos.y - this.shipY;
			const dz = pos.z - this.shipZ;
			const dist = Math.hypot(dx, dy, dz);
			if (body.id === targetId) {
				const ratio = dist / EARTH_ORBIT;
				rangeText = ratio < .08 ? "Here" : `${ratio.toFixed(ratio < 10 ? 2 : 1)}× orbit`;
			}
			if (!body.quiet && dist < surveyRadius(body) && dist < nearDist) {
				near = body.id;
				nearDist = dist;
			}
			const toSun = worldToCamera(-pos.x, -pos.y, -pos.z, this.yaw, this.pitch);
			let lx = toSun.x;
			let ly = toSun.y;
			let lz = -toSun.z;
			const lm = Math.hypot(lx, ly, lz) || 1;
			lx /= lm;
			ly /= lm;
			lz /= lm;
			const style = body.id === "jupiter" || body.id === "saturn" ? 1 : body.id === "earth" ? 2 : body.id === "uranus" || body.id === "neptune" ? 3 : 0;
			const cam0 = worldToCamera(dx, dy, dz, this.yaw, this.pitch);
			const cam = {
				x: cam0.x - this.eyeX,
				y: cam0.y - this.eyeY,
				z: cam0.z - this.eyeZ
			};
			if (cam.z < .5) {
				rows.push({
					body,
					dist,
					camX: cam.x,
					camZ: cam.z,
					ndcX: 0,
					ndcY: 0,
					radX: 0,
					radY: 0,
					lx,
					ly,
					lz,
					style
				});
				continue;
			}
			const floor = body.speck ? .0035 : body.id === "sun" ? .02 : .011;
			const radY = clamp(visualRadius(body) / cam.z / tan, floor, 1.35);
			rows.push({
				body,
				dist,
				camX: cam.x,
				camZ: cam.z,
				ndcX: cam.x / cam.z / tan / aspect,
				ndcY: cam.y / cam.z / tan,
				radX: radY / aspect,
				radY,
				lx,
				ly,
				lz,
				style
			});
		}
		if (near) this.nearId = near;
		else if (this.nearId) {
			const held = bodyById(this.nearId);
			if (this.rangeTo(held.id) > surveyRadius(held) * 2.8) this.nearId = "";
		}
		rows.sort((a, b) => b.camZ - a.camZ);
		let count = 0;
		const push = (row, scaleX, scaleY, kind) => {
			if (count >= 80 || row.camZ < .5) return;
			const o = count * 12;
			this.planetData[o] = row.ndcX;
			this.planetData[o + 1] = row.ndcY;
			this.planetData[o + 2] = row.radX * scaleX;
			this.planetData[o + 3] = row.radY * scaleY;
			this.planetData[o + 4] = row.body.color[0];
			this.planetData[o + 5] = row.body.color[1];
			this.planetData[o + 6] = row.body.color[2];
			this.planetData[o + 7] = kind;
			this.planetData[o + 8] = row.lx;
			this.planetData[o + 9] = row.ly;
			this.planetData[o + 10] = row.lz;
			this.planetData[o + 11] = row.style;
			count += 1;
		};
		const dimLast = (scale) => {
			if (count < 1) return;
			const o = (count - 1) * 12;
			this.planetData[o + 4] = (this.planetData[o + 4] ?? 1) * scale;
			this.planetData[o + 5] = (this.planetData[o + 5] ?? 1) * scale;
			this.planetData[o + 6] = (this.planetData[o + 6] ?? 1) * scale;
		};
		const air = {
			venus: [
				.95,
				.74,
				.42
			],
			earth: [
				.42,
				.68,
				.95
			],
			mars: [
				.86,
				.42,
				.3
			],
			titan: [
				.92,
				.52,
				.26
			],
			jupiter: [
				.9,
				.72,
				.5
			],
			saturn: [
				.92,
				.82,
				.62
			],
			uranus: [
				.62,
				.86,
				.9
			],
			neptune: [
				.35,
				.52,
				.9
			]
		};
		for (const row of rows) {
			if (row.radY <= 0) continue;
			if (row.body.id === "sun") {
				push(row, 3.5, 3.5, 0);
				push(row, 1.15, 1.15, 0);
			}
			if (row.body.id === "halley") push(row, 2.6, 2.6, 0);
			if (row.body.id === "saturn") push(row, 2.35, .46, 2);
			if (row.body.id === "jupiter") {
				push(row, 1.62, .2, 2);
				dimLast(.55);
			}
			if (row.body.id === "uranus") {
				push(row, 1.48, .16, 2);
				dimLast(.45);
			}
			const tint = air[row.body.id];
			if (tint) {
				push(row, 1.2, 1.2, .28);
				const o = (count - 1) * 12;
				this.planetData[o + 4] = tint[0];
				this.planetData[o + 5] = tint[1];
				this.planetData[o + 6] = tint[2];
			}
			if (row.body.id !== "sun") push(row, 1, 1, 1);
		}
		this.planetCount = count;
		this.markers.length = 0;
		const labeled = rows.filter((row) => !row.body.quiet && (row.body.id === targetId || row.camZ > .5 && (row.radY > .02 || row.dist < 540)));
		for (const row of labeled) {
			if (this.markers.length > 5 && row.body.id !== targetId) continue;
			const x1 = row.ndcX * cs - row.ndcY * sn;
			const y1 = row.ndcX * sn + row.ndcY * cs;
			const behind = row.camZ < .5;
			let x = behind ? .5 + Math.sign(row.camX || 1) * .4 : x1 * .5 + .5;
			let y = behind ? .46 : 1 - (y1 * .5 + .5);
			const primary = row.body.id === targetId;
			if (!primary && (behind || x < 0 || x > 1 || y < .02 || y > .92)) continue;
			this.markers.push({
				id: row.body.id,
				name: behind ? `${row.body.name} · behind` : row.body.name,
				x: clamp(x, .06, .94),
				y: clamp(y, .08, .74),
				primary
			});
		}
		const kept = [];
		const ordered = [...this.markers].sort((a, b) => Number(b.primary) - Number(a.primary));
		for (const marker of ordered) {
			if (!marker.primary && kept.some((other) => Math.hypot(other.x - marker.x, other.y - marker.y) < .035)) continue;
			kept.push(marker);
		}
		this.markers.length = 0;
		this.markers.push(...kept);
		return rangeText;
	}
	readStick(dt) {
		const tx = this.hasPointer ? shape(this.pointerX) : 0;
		const ty = this.hasPointer ? shape(this.pointerY) : 0;
		const k = 1 - Math.exp(-12 * dt);
		this.smoothPX += (tx - this.smoothPX) * k;
		this.smoothPY += (ty - this.smoothPY) * k;
		let x = this.smoothPX;
		let y = this.smoothPY;
		if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
		if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
		if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y -= 1;
		if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y += 1;
		x -= this.steerOverride;
		return {
			x: clamp(x, -1, 1),
			y: clamp(y, -1, 1)
		};
	}
	integrateStars(dt, dYaw, dPitch) {
		const cy = Math.cos(dYaw);
		const sy = Math.sin(dYaw);
		const cp = Math.cos(dPitch);
		const sp = Math.sin(dPitch);
		const advance = this.speed * dt;
		const data = this.data;
		const tan = this.tanFov;
		const aspect = this.aspect;
		const n = this.live;
		for (let i = 0; i < n; i++) {
			const o = i * 4;
			const x = data[o] ?? 0;
			const y = data[o + 1] ?? 0;
			const z = data[o + 2] ?? 1;
			const x1 = x * cy + z * sy;
			const z1 = -x * sy + z * cy;
			const y2 = y * cp - z1 * sp;
			const z2 = y * sp + z1 * cp - advance;
			const lim = z2 * tan * 4.2 + 12;
			if (z2 < .62 || z2 > 96 || Math.abs(x1) > lim * aspect || Math.abs(y2) > lim) this.respawn(i, true);
			else {
				data[o] = x1;
				data[o + 1] = y2;
				data[o + 2] = z2;
			}
		}
	}
	draw() {
		if (this.mode === "webgl") this.drawGL();
		else if (this.mode === "2d") this.draw2D();
	}
	drawGL() {
		const gl = this.gl;
		const bg = this.bg;
		const stars = this.stars;
		if (!gl || !bg || !stars || !this.vao || !this.buf) return;
		const w = this.canvas.width;
		const h = this.canvas.height;
		gl.viewport(0, 0, w, h);
		gl.bindVertexArray(null);
		gl.disable(gl.BLEND);
		gl.useProgram(bg);
		gl.uniform2f(this.bgLocs.uRes ?? null, w, h);
		gl.uniform2f(this.bgLocs.uBg ?? null, this.bgX, this.bgY);
		gl.uniform1f(this.bgLocs.uRoll ?? null, -this.bank);
		gl.uniform1f(this.bgLocs.uBoost ?? null, this.rush);
		gl.uniform1f(this.bgLocs.uAspect ?? null, this.aspect);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data);
		gl.bindVertexArray(this.vao);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.useProgram(stars);
		const reduced = this.hooks.current.getParams().reducedMotion;
		const streakTime = (.058 + this.boost * .09) * (reduced ? .35 : 1);
		const stretch = Math.min(this.speed * streakTime, 26);
		const twinkle = Math.max(0, 1 - this.speed / 34) * (reduced ? 0 : 1);
		const pixel = 2 / Math.max(1, h);
		const setCommon = () => {
			gl.uniform1f(this.starLocs.uFovTan ?? null, this.tanFov);
			gl.uniform1f(this.starLocs.uAspect ?? null, this.aspect);
			gl.uniform1f(this.starLocs.uYawLag ?? null, this.yawLagRate * streakTime);
			gl.uniform1f(this.starLocs.uPitchLag ?? null, this.pitchLagRate * streakTime);
			gl.uniform1f(this.starLocs.uRoll ?? null, -this.bank);
			gl.uniform1f(this.starLocs.uPixel ?? null, pixel);
			gl.uniform1f(this.starLocs.uNear ?? null, NEAR);
			gl.uniform1f(this.starLocs.uFar ?? null, 96);
			gl.uniform1f(this.starLocs.uBoost ?? null, this.rush);
			gl.uniform1f(this.starLocs.uTwinkle ?? null, twinkle);
			gl.uniform1f(this.starLocs.uTime ?? null, this.time);
		};
		setCommon();
		gl.uniform1f(this.starLocs.uStretch ?? null, stretch * 1.85);
		gl.uniform1f(this.starLocs.uWidth ?? null, 2.15);
		gl.uniform1f(this.starLocs.uGain ?? null, .26);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.live);
		gl.uniform1f(this.starLocs.uStretch ?? null, stretch);
		gl.uniform1f(this.starLocs.uWidth ?? null, 1);
		gl.uniform1f(this.starLocs.uGain ?? null, .95);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.live);
		this.drawPlanets(gl);
		this.drawTrail(gl);
		this.drawShip(gl);
	}
	rememberTrail() {
		const last = this.trail[this.trail.length - 1];
		if ((last ? Math.hypot(this.shipX - last.x, this.shipY - last.y, this.shipZ - last.z) : 99) < 7) return;
		this.trail.push({
			x: this.shipX,
			y: this.shipY,
			z: this.shipZ
		});
		if (this.trail.length > 90) this.trail.shift();
	}
	drawTrail(gl) {
		if (!this.trailProg || !this.trailVao || !this.trailBuf || this.trail.length < 2) return;
		const tan = this.tanFov || .7;
		const aspect = this.aspect || 1;
		const cs = Math.cos(-this.bank);
		const sn = Math.sin(-this.bank);
		let count = 0;
		const flush = () => {
			if (count < 2 || !this.trailProg || !this.trailVao || !this.trailBuf) {
				count = 0;
				return;
			}
			gl.useProgram(this.trailProg);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.bindVertexArray(this.trailVao);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.trailDraw.subarray(0, count * 3));
			gl.drawArrays(gl.LINE_STRIP, 0, count);
			count = 0;
		};
		const n = this.trail.length;
		for (let i = 0; i < n; i++) {
			const point = this.trail[i];
			if (!point) continue;
			const cam0 = worldToCamera(point.x - this.shipX, point.y - this.shipY, point.z - this.shipZ, this.yaw, this.pitch);
			const z = cam0.z - this.eyeZ;
			if (z < .8) {
				flush();
				continue;
			}
			const ndcX = (cam0.x - this.eyeX) / z / tan / aspect;
			const ndcY = (cam0.y - this.eyeY) / z / tan;
			const x = ndcX * cs - ndcY * sn;
			const y = ndcX * sn + ndcY * cs;
			if (count > 0) {
				const px = this.trailDraw[(count - 1) * 3] ?? 0;
				const py = this.trailDraw[(count - 1) * 3 + 1] ?? 0;
				if (Math.hypot(x - px, y - py) > .85) flush();
			}
			if (count >= 90) flush();
			const o = count * 3;
			this.trailDraw[o] = x;
			this.trailDraw[o + 1] = y;
			this.trailDraw[o + 2] = (i + 1) / n * .55;
			count += 1;
		}
		flush();
		gl.bindVertexArray(null);
	}
	drawShip(gl) {
		if (!this.shipProg || !this.shipVao || this.eyeZ > -3) return;
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.useProgram(this.shipProg);
		gl.uniform3f(this.shipLocs.uEye ?? null, this.eyeX, this.eyeY, this.eyeZ);
		gl.uniform1f(this.shipLocs.uFovTan ?? null, this.tanFov);
		gl.uniform1f(this.shipLocs.uAspect ?? null, this.aspect);
		gl.uniform1f(this.shipLocs.uRoll ?? null, -this.bank);
		gl.uniform1f(this.shipLocs.uBoost ?? null, this.boost);
		gl.enable(gl.DEPTH_TEST);
		gl.clear(gl.DEPTH_BUFFER_BIT);
		gl.bindVertexArray(this.shipVao);
		gl.drawArrays(gl.TRIANGLES, 0, SHIP_VERTS);
		gl.disable(gl.DEPTH_TEST);
		gl.bindVertexArray(null);
	}
	drawPlanets(gl) {
		if (!this.planets || !this.planetVao || !this.planetBuf || this.planetCount < 1) return;
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.useProgram(this.planets);
		gl.uniform1f(this.planetLocs.uRoll ?? null, -this.bank);
		gl.bindVertexArray(this.planetVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.planetBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.planetData.subarray(0, this.planetCount * 12));
		gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.planetCount);
		gl.bindVertexArray(null);
	}
	draw2D() {
		const ctx = this.ctx2d;
		if (!ctx) return;
		const w = this.canvas.width;
		const h = this.canvas.height;
		ctx.fillStyle = "#07080b";
		ctx.fillRect(0, 0, w, h);
		const cx = w * .5;
		const cy = h * .5;
		const f = h * .5 / this.tanFov;
		const roll = -this.bank;
		const cs = Math.cos(roll);
		const sn = Math.sin(roll);
		const reduced = this.hooks.current.getParams().reducedMotion;
		const streakTime = (.058 + this.boost * .09) * (reduced ? .35 : 1);
		const stretch = Math.min(this.speed * streakTime, 26);
		const yawLag = this.yawLagRate * streakTime;
		const pitchLag = this.pitchLagRate * streakTime;
		const rot = (px, py) => {
			const dx = px - cx;
			const dy = py - cy;
			return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
		};
		ctx.lineCap = "round";
		const data = this.data;
		for (let i = 0; i < this.live; i++) {
			const o = i * 4;
			const x = data[o] ?? 0;
			const y = data[o + 1] ?? 0;
			const z = data[o + 2] ?? 1;
			if (z < .62) continue;
			const packed = data[o + 3] ?? .5;
			const colorId = Math.floor(packed / 4 + .001);
			const bright = packed - colorId * 4;
			const hx = cx + x / z * f;
			const hy = cy - y / z * f;
			const pz = z + stretch * (.62 + bright * .7);
			const [x0, y0] = rot(cx + (x - z * yawLag) / pz * f, cy - (y + z * pitchLag) / pz * f);
			const [x1, y1] = rot(hx, hy);
			const alpha = Math.min(.9, .15 + bright * .65);
			ctx.strokeStyle = colorId < .5 ? `rgba(186, 206, 242, ${alpha})` : colorId > 1.5 ? `rgba(242, 228, 210, ${alpha})` : `rgba(236, 240, 248, ${alpha})`;
			ctx.lineWidth = 1 + bright * 1.4;
			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1, y1);
			ctx.stroke();
		}
		for (let i = 0; i < this.planetCount; i++) {
			const o = i * 12;
			const ndcX = this.planetData[o] ?? 0;
			const ndcY = this.planetData[o + 1] ?? 0;
			const rx = this.planetData[o + 2] ?? 0;
			const ry = this.planetData[o + 3] ?? 0;
			const red = Math.round((this.planetData[o + 4] ?? 1) * 255);
			const green = Math.round((this.planetData[o + 5] ?? 1) * 255);
			const blue = Math.round((this.planetData[o + 6] ?? 1) * 255);
			const kind = this.planetData[o + 7] ?? 1;
			const px = (ndcX * cs - ndcY * sn) * .5 + .5;
			const py = 1 - ((ndcX * sn + ndcY * cs) * .5 + .5);
			const radius = Math.max(2, ry * h * .5);
			ctx.beginPath();
			ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${kind < .5 ? .55 : .95})`;
			ctx.ellipse(px * w, py * h, Math.max(2, rx * w * .5), radius, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		if (this.eyeZ < -3) this.drawShip2D(ctx, w, h, cs, sn, f);
	}
	drawShip2D(ctx, w, h, cs, sn, f) {
		const project = (x, y, z) => {
			const cz = z - this.eyeZ;
			if (cz < .4) return null;
			const cx = (x - this.eyeX) / cz;
			const cy = (y - this.eyeY) / cz;
			const px = w * .5 + cx * f;
			const py = h * .5 - cy * f;
			const dx = px - w * .5;
			const dy = py - h * .5;
			return [
				w * .5 + dx * cs - dy * sn,
				h * .5 + dx * sn + dy * cs,
				cz
			];
		};
		const faces = [];
		for (let i = 0; i < SHIP_VERTS; i += 3) {
			const at = (n) => {
				const o = (i + n) * SHIP_STRIDE;
				return project(SHIP_DATA[o] ?? 0, SHIP_DATA[o + 1] ?? 0, SHIP_DATA[o + 2] ?? 0);
			};
			const a = at(0);
			const b = at(1);
			const c = at(2);
			if (!a || !b || !c) continue;
			const o = i * SHIP_STRIDE;
			const lift = (SHIP_DATA[o + 6] ?? 0) * (.4 + this.boost);
			const red = Math.min(255, Math.round(((SHIP_DATA[o + 3] ?? 1) + .4 * lift) * 255));
			const green = Math.min(255, Math.round(((SHIP_DATA[o + 4] ?? 1) + .58 * lift) * 255));
			const blue = Math.min(255, Math.round(((SHIP_DATA[o + 5] ?? 1) + .95 * lift) * 255));
			faces.push({
				z: (a[2] + b[2] + c[2]) / 3,
				pts: [
					a,
					b,
					c
				],
				color: `rgb(${red}, ${green}, ${blue})`
			});
		}
		faces.sort((p, q) => q.z - p.z);
		for (const face of faces) {
			ctx.fillStyle = face.color;
			ctx.beginPath();
			ctx.moveTo(face.pts[0][0], face.pts[0][1]);
			ctx.lineTo(face.pts[1][0], face.pts[1][1]);
			ctx.lineTo(face.pts[2][0], face.pts[2][1]);
			ctx.closePath();
			ctx.fill();
		}
	}
};
var STORAGE = "slipstream-settings";
var SURVEY = "slipstream-survey";
var HELP = "slipstream-help";
var LOG = "slipstream-log";
var NAV = BODIES.filter((body) => body.nav);
var VIEWS = [
	{
		id: "cockpit",
		label: "Cockpit",
		tip: "Look out the nose"
	},
	{
		id: "chase",
		label: "Chase",
		tip: "Camera behind the ship"
	},
	{
		id: "wing",
		label: "Wing",
		tip: "Camera off the left side"
	}
];
var LESSONS = [
	{
		title: "Look around",
		body: "Drag the sky to steer. A and D turn. W and S pitch the nose."
	},
	{
		title: "Set your speed",
		body: "Speed is your cruise. Boost burns harder, and a close pass flies one loop around that world, then boosts on. Orbit on the place card, or under More, holds the circle. O toggles it."
	},
	{
		title: "Chart a place",
		body: "Pick a world, then Go. On its card, Next flies you to the following place. Orbit holds you there until you leave, boost, or choose another."
	},
	{
		title: "Change the camera",
		body: "Cockpit is the nose. Chase sits behind the ship. Wing looks from the side. Full fills the screen."
	},
	{
		title: "Fly a task",
		body: "Open Log. Soft arrivals, slingshots, the ring cut, and the rest are saved with your time. A faint trail marks where you have flown."
	}
];
function navSections(bodies) {
	const sections = [];
	for (const body of bodies) {
		const last = sections[sections.length - 1];
		if (!last || last.group !== body.group) sections.push({
			group: body.group,
			bodies: [body]
		});
		else last.bodies.push(body);
	}
	return sections;
}
function Slipstream() {
	const canvasRef = (0, import_react.useRef)(null);
	const stageRef = (0, import_react.useRef)(null);
	const warpRef = (0, import_react.useRef)(null);
	const rangeRef = (0, import_react.useRef)(null);
	const markerRefs = (0, import_react.useRef)({});
	const nearSeen = (0, import_react.useRef)("");
	const alertSeen = (0, import_react.useRef)("");
	const levelSeen = (0, import_react.useRef)(false);
	const engineRef = (0, import_react.useRef)(null);
	const hooksRef = (0, import_react.useRef)({
		getParams: () => paramsRef.current,
		onSpeed: () => {},
		onToggleBoost: () => {},
		onFrame: () => {},
		onError: () => {},
		onCancelAutopilot: () => {},
		onCancelOrbit: () => {},
		onToggleOrbit: () => {},
		onBeginLap: () => {},
		onEndLap: () => {},
		onTask: () => {}
	});
	const paramsRef = (0, import_react.useRef)({
		speed: .42,
		density: .52,
		boost: false,
		muted: false,
		reducedMotion: false,
		targetId: "earth",
		autopilot: false,
		orbit: false,
		view: "cockpit"
	});
	const [speed, setSpeed] = (0, import_react.useState)(.42);
	const [density, setDensity] = (0, import_react.useState)(.52);
	const [boost, setBoost] = (0, import_react.useState)(false);
	const [muted, setMuted] = (0, import_react.useState)(false);
	const [reduced, setReduced] = (0, import_react.useState)(false);
	const [hint, setHint] = (0, import_react.useState)(true);
	const [error, setError] = (0, import_react.useState)("");
	const [targetId, setTargetId] = (0, import_react.useState)("earth");
	const [autopilot, setAutopilot] = (0, import_react.useState)(false);
	const [orbit, setOrbit] = (0, import_react.useState)(false);
	const [navOpen, setNavOpen] = (0, import_react.useState)(false);
	const [moreOpen, setMoreOpen] = (0, import_react.useState)(false);
	const [noseLevel, setNoseLevel] = (0, import_react.useState)(false);
	const [nearId, setNearId] = (0, import_react.useState)("");
	const [dismissed, setDismissed] = (0, import_react.useState)("");
	const [alert, setAlert] = (0, import_react.useState)("");
	const [charted, setCharted] = (0, import_react.useState)([]);
	const [view, setView] = (0, import_react.useState)("cockpit");
	const [full, setFull] = (0, import_react.useState)(false);
	const [lesson, setLesson] = (0, import_react.useState)(null);
	const [logOpen, setLogOpen] = (0, import_react.useState)(false);
	const [log, setLog] = (0, import_react.useState)([]);
	const [banner, setBanner] = (0, import_react.useState)("");
	paramsRef.current = {
		speed,
		density,
		boost,
		muted,
		reducedMotion: reduced,
		targetId,
		autopilot,
		orbit,
		view
	};
	hooksRef.current.getParams = () => paramsRef.current;
	hooksRef.current.onSpeed = (next) => setSpeed(clamp01(next));
	hooksRef.current.onToggleBoost = () => {
		setOrbit(false);
		setBoost((value) => !value);
	};
	hooksRef.current.onCancelAutopilot = () => setAutopilot(false);
	hooksRef.current.onCancelOrbit = () => setOrbit(false);
	hooksRef.current.onBeginLap = (id) => {
		setTargetId(id);
		setOrbit(true);
		setBoost(false);
		setAutopilot(false);
	};
	hooksRef.current.onEndLap = () => {
		setOrbit(false);
		setBoost(true);
		setAutopilot(false);
	};
	hooksRef.current.onToggleOrbit = () => {
		setOrbit((value) => {
			const next = !value;
			if (next) {
				setBoost(false);
				setAutopilot(false);
			}
			return next;
		});
	};
	hooksRef.current.onError = (message) => setError(message);
	hooksRef.current.onTask = (id, seconds) => {
		setLog((prev) => prev.some((entry) => entry.id === id) ? prev : [...prev, {
			id,
			seconds
		}]);
		const name = TASKS.find((task) => task.id === id)?.name ?? "Task";
		setBanner(`${name} logged`);
	};
	hooksRef.current.onFrame = (snap) => {
		const warp = warpRef.current;
		if (warp && warp.textContent !== snap.warpText) warp.textContent = snap.warpText;
		const range = rangeRef.current;
		if (range && range.textContent !== snap.rangeText) range.textContent = snap.rangeText;
		const stage = stageRef.current;
		if (stage) {
			stage.style.setProperty("--stick-x", snap.stickX.toFixed(3));
			stage.style.setProperty("--stick-y", snap.stickY.toFixed(3));
			stage.style.setProperty("--pitch", snap.pitch.toFixed(3));
			const flag = snap.boosting ? "true" : "false";
			if (stage.dataset.boosting !== flag) stage.dataset.boosting = flag;
			const locked = snap.locked ? "true" : "false";
			if (stage.dataset.locked !== locked) stage.dataset.locked = locked;
			const orbiting = snap.orbiting ? "true" : "false";
			if (stage.dataset.orbiting !== orbiting) stage.dataset.orbiting = orbiting;
		}
		if (snap.leveling !== levelSeen.current) {
			levelSeen.current = snap.leveling;
			setNoseLevel(snap.leveling);
		}
		paintMarkers(snap.markers);
		if (snap.nearId !== nearSeen.current) {
			nearSeen.current = snap.nearId;
			setNearId(snap.nearId);
			if (!snap.nearId) setDismissed("");
			if (snap.nearId && bodyById(snap.nearId).goal) setCharted((prev) => prev.includes(snap.nearId) ? prev : [...prev, snap.nearId]);
		}
		if (snap.alert !== alertSeen.current) {
			alertSeen.current = snap.alert;
			setAlert(snap.alert);
		}
	};
	(0, import_react.useEffect)(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		const apply = () => setReduced(mq.matches);
		apply();
		mq.addEventListener("change", apply);
		return () => mq.removeEventListener("change", apply);
	}, []);
	(0, import_react.useEffect)(() => {
		try {
			const raw = localStorage.getItem(STORAGE);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (typeof parsed.speed === "number") setSpeed(clamp01(parsed.speed));
			if (typeof parsed.density === "number") setDensity(clamp01(parsed.density));
			if (typeof parsed.muted === "boolean") setMuted(parsed.muted);
			if (parsed.view === "cockpit" || parsed.view === "chase" || parsed.view === "wing") setView(parsed.view);
		} catch {}
	}, []);
	const skipSave = (0, import_react.useRef)(true);
	(0, import_react.useEffect)(() => {
		if (skipSave.current) {
			skipSave.current = false;
			return;
		}
		localStorage.setItem(STORAGE, JSON.stringify({
			speed,
			density,
			muted,
			view
		}));
	}, [
		speed,
		density,
		muted,
		view
	]);
	(0, import_react.useEffect)(() => {
		try {
			const raw = localStorage.getItem(SURVEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return;
			setCharted(parsed.filter((id) => typeof id === "string" && BODIES.some((body) => body.id === id && body.goal)));
		} catch {}
	}, []);
	const skipSurvey = (0, import_react.useRef)(true);
	(0, import_react.useEffect)(() => {
		if (skipSurvey.current) {
			skipSurvey.current = false;
			return;
		}
		localStorage.setItem(SURVEY, JSON.stringify(charted));
	}, [charted]);
	(0, import_react.useEffect)(() => {
		try {
			const raw = localStorage.getItem(LOG);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return;
			setLog(parsed.filter((entry) => !!entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.seconds === "number" && TASKS.some((task) => task.id === entry.id)));
		} catch {}
	}, []);
	const skipLog = (0, import_react.useRef)(true);
	(0, import_react.useEffect)(() => {
		if (skipLog.current) {
			skipLog.current = false;
			return;
		}
		localStorage.setItem(LOG, JSON.stringify(log));
	}, [log]);
	(0, import_react.useEffect)(() => {
		if (!banner) return;
		const timer = window.setTimeout(() => setBanner(""), 3400);
		return () => window.clearTimeout(timer);
	}, [banner]);
	(0, import_react.useEffect)(() => {
		try {
			if (localStorage.getItem(HELP) === "seen") return;
		} catch {}
		setLesson(0);
	}, []);
	const closeLesson = () => {
		setLesson(null);
		try {
			localStorage.setItem(HELP, "seen");
		} catch {}
	};
	(0, import_react.useEffect)(() => {
		if (lesson === null) return;
		const onKey = (event) => {
			if (event.key !== "Escape") return;
			setLesson(null);
			try {
				localStorage.setItem(HELP, "seen");
			} catch {}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [lesson]);
	(0, import_react.useEffect)(() => {
		const onChange = () => setFull(Boolean(document.fullscreenElement));
		document.addEventListener("fullscreenchange", onChange);
		return () => document.removeEventListener("fullscreenchange", onChange);
	}, []);
	const toggleFull = () => {
		const node = stageRef.current;
		if (!node) return;
		if (document.fullscreenElement) {
			document.exitFullscreen();
			return;
		}
		node.requestFullscreen().catch(() => {});
	};
	(0, import_react.useEffect)(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const engine = new StarfieldEngine(canvas, hooksRef);
		engineRef.current = engine;
		engine.start();
		return () => {
			engine.destroy();
			engineRef.current = null;
		};
	}, []);
	(0, import_react.useEffect)(() => {
		const hide = () => setHint(false);
		const timer = window.setTimeout(hide, 6400);
		window.addEventListener("pointerdown", hide, { once: true });
		window.addEventListener("keydown", hide, { once: true });
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("pointerdown", hide);
		};
	}, []);
	const markerRefCbs = (0, import_react.useRef)({});
	const markerRef = (id) => {
		let cb = markerRefCbs.current[id];
		if (!cb) {
			cb = (node) => {
				markerRefs.current[id] = node;
				if (node) node.hidden = true;
			};
			markerRefCbs.current[id] = cb;
		}
		return cb;
	};
	function paintMarkers(markers) {
		for (const body of BODIES) {
			const el = markerRefs.current[body.id];
			if (!el) continue;
			const marker = markers.find((item) => item.id === body.id);
			if (!marker) {
				el.hidden = true;
				continue;
			}
			el.hidden = false;
			if (el.textContent !== marker.name) el.textContent = marker.name;
			el.style.left = `${(marker.x * 100).toFixed(1)}%`;
			el.style.top = `${(marker.y * 100).toFixed(1)}%`;
			el.classList.toggle("is-target", marker.primary);
		}
	}
	const target = bodyById(targetId);
	const nearBody = nearId ? bodyById(nearId) : null;
	const showBrief = Boolean(nearBody) && dismissed !== nearId;
	const nextStop = NAV[((nearBody ? NAV.findIndex((body) => body.id === nearBody.id) : -1) + 1 + NAV.length) % NAV.length];
	const engageOrbit = (id) => {
		setTargetId(id);
		setOrbit(true);
		setBoost(false);
		setAutopilot(false);
	};
	const flyNext = () => {
		if (!nearBody || !nextStop) return;
		setTargetId(nextStop.id);
		setOrbit(false);
		setBoost(false);
		setAutopilot(true);
		setDismissed(nearBody.id);
	};
	const cycleView = () => {
		const index = VIEWS.findIndex((item) => item.id === view);
		setView(VIEWS[(index + 1) % VIEWS.length].id);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		ref: stageRef,
		className: "stage",
		"data-lesson": lesson === null ? void 0 : lesson,
		"aria-label": "Slipstream",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "viewport",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
					ref: canvasRef,
					className: "field",
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "sr-only",
					children: "Fly the solar system. Drag the view to look. Horizon levels the nose. Go flies to the place you pick. Switch between cockpit, chase, and wing. Full screen fills the display. A and D steer. W and S pitch."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "markers",
					"aria-hidden": "true",
					children: BODIES.map((body) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "marker",
						ref: markerRef(body.id)
					}, body.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "topbar",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "wordmark",
							children: "Slipstream"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "kicker",
							children: charted.length >= GOAL_COUNT ? "System charted" : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "chart",
									children: [
										charted.length,
										" of ",
										GOAL_COUNT
									]
								}),
								" ",
								"places charted"
							] })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "top-actions",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "help-btn",
								"data-hud": true,
								onClick: () => {
									setLesson(0);
									setLogOpen(false);
								},
								children: "Help"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "help-btn",
								"data-hud": true,
								"aria-pressed": logOpen,
								onClick: () => {
									setLogOpen((open) => !open);
									setLesson(null);
								},
								children: "Log"
							})]
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "readout",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							ref: warpRef,
							className: "warp",
							children: "1.58"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "warp-unit",
							children: [
								"warp ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "boost-flag",
									children: "· boost"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "orbit-flag",
									children: "· orbit"
								})
							]
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "reticle",
					"aria-hidden": "true",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "horizon" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
							viewBox: "0 0 36 36",
							width: "36",
							height: "36",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
								d: "M18 5v7M18 24v7M5 18h7M24 18h7",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.25",
								strokeLinecap: "round"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "lock-note",
							children: "On target"
						})
					]
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "field-error",
					children: error
				}) : null,
				lesson !== null && LESSONS[lesson] ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "lesson",
					"data-hud": true,
					role: "dialog",
					"aria-labelledby": "lesson-title",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "lesson-kicker",
							children: [
								lesson + 1,
								" of ",
								LESSONS.length
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							id: "lesson-title",
							children: LESSONS[lesson].title
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: LESSONS[lesson].body }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "lesson-actions",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: closeLesson,
									children: "Skip"
								}),
								lesson > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setLesson(lesson - 1),
									children: "Back"
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => lesson + 1 >= LESSONS.length ? closeLesson() : setLesson(lesson + 1),
									children: lesson + 1 >= LESSONS.length ? "Fly" : "Next"
								})
							]
						})
					]
				}) : null,
				logOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "lesson log",
					"data-hud": true,
					"aria-label": "Flight log",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "brief-top",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "lesson-kicker",
							children: [
								log.length,
								" of ",
								TASKS.length,
								" logged"
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Flight log" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "brief-close",
							onClick: () => setLogOpen(false),
							children: "Close"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "log-list",
						children: TASKS.map((task) => {
							const done = log.find((entry) => entry.id === task.id);
							const seconds = Math.max(0, Math.floor(done?.seconds ?? 0));
							const stamp = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: task.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: done ? stamp : "Open" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: task.how })] }, task.id);
						})
					})]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "chrome",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: hint && lesson === null ? "hint" : "hint is-hidden",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "md:hidden",
								children: "Drag to look. Go flies you there."
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "hidden md:inline",
								children: "Move to look. Horizon levels the nose. Go flies to the place you pick."
							})]
						}),
						alert ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "status",
							children: alert
						}) : null,
						banner ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "status",
							children: banner
						}) : null,
						showBrief && nearBody ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
							className: "brief",
							"data-hud": true,
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "brief-top",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: nearBody.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "brief-close",
										onClick: () => setDismissed(nearBody.id),
										children: "Close"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: nearBody.blurb }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
									className: "facts",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "Distance" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: nearBody.place ?? (nearBody.au === 0 ? "Center" : `${nearBody.au.toFixed(2)} AU`) })] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: nearBody.parent ? "Orbit" : "Year" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: nearBody.year })] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: nearBody.parent ? "Orbits" : "Moons" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: nearBody.parent ? bodyById(nearBody.parent).name : nearBody.moons })] })
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "brief-actions",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "brief-orbit",
										"aria-pressed": orbit && targetId === nearBody.id,
										onClick: () => {
											if (orbit && targetId === nearBody.id) setOrbit(false);
											else engageOrbit(nearBody.id);
										},
										children: orbit && targetId === nearBody.id ? "Leave orbit" : "Orbit"
									}), nextStop && nextStop.id !== nearBody.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "brief-next",
										onClick: flyNext,
										children: ["Next · ", nextStop.name]
									}) : null]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "brief-note",
									children: "Orbits keep their real order. Travel distances are compressed so you can cross the system."
								})
							]
						}) : null
					]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
			"data-hud": true,
			className: "dock",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "dock-bar",
				children: [
					moreOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "more-panel",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "actions",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"data-tip": "Burn harder for a while. Leaves an orbit.",
									"aria-pressed": boost,
									onClick: () => {
										setBoost((value) => !value);
										setOrbit(false);
									},
									children: "Boost"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"data-tip": "Circle the place you picked. Replaces the previous orbit.",
									"aria-pressed": orbit,
									onClick: () => {
										if (orbit) setOrbit(false);
										else engageOrbit(targetId);
									},
									children: "Orbit"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"data-tip": "Level the nose",
									"aria-pressed": noseLevel,
									"aria-label": "Level the nose to the horizon",
									onClick: () => engineRef.current?.level(),
									children: "Horizon"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "icon-btn",
									"data-tip": muted ? "Turn the engine sound on" : "Turn the engine sound off",
									"aria-pressed": !muted,
									"aria-label": muted ? "Unmute" : "Mute",
									onClick: () => setMuted((value) => !value),
									children: muted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, {
										size: 16,
										strokeWidth: 1.75
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, {
										size: 16,
										strokeWidth: 1.75
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"data-tip": full ? "Leave full screen" : "Fill the screen",
									"aria-pressed": full,
									onClick: toggleFull,
									children: full ? "Exit" : "Full"
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "slider-row density-row",
							"data-tip": "How many stars fill the sky.",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								id: "density-label",
								className: "slider-label",
								children: "Stars"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Slider, {
								className: "slider",
								"aria-labelledby": "density-label",
								min: 0,
								max: 1,
								step: .005,
								value: [density],
								onValueChange: ([value]) => setDensity(clamp01(value ?? 0)),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderTrack, {
									className: "slider-track",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRange, { className: "slider-range" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderThumb, {
									className: "slider-thumb",
									"aria-label": "Stars",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
								})]
							})]
						})]
					}) : null,
					navOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "nav-list",
						children: navSections(NAV).map((section) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "nav-section",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "nav-group",
								children: section.group
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: section.bodies.map((body) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								"aria-current": body.id === targetId ? "true" : void 0,
								onClick: () => {
									setTargetId(body.id);
									setOrbit(false);
									setAutopilot(false);
									setNavOpen(false);
								},
								children: [body.name, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: charted.includes(body.id) ? "Charted" : body.tag ? body.tag : body.place ? "Moon" : body.au === 0 ? "Star" : `${body.au.toFixed(2)} AU` })]
							}) }, body.id)) })]
						}, section.group))
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flight-line",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "nav-row",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "nav-target",
									"data-tip": "Choose where to fly",
									"aria-expanded": navOpen,
									onClick: () => {
										setNavOpen((open) => !open);
										setMoreOpen(false);
									},
									children: [target.name, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", {
										ref: rangeRef,
										children: "—"
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"data-tip": "Fly to the selected place",
									className: "go-btn",
									"aria-pressed": autopilot,
									"aria-label": autopilot ? `Stop flying to ${target.name}` : `Fly to ${target.name}`,
									onClick: () => {
										setAutopilot((value) => !value);
										setOrbit(false);
									},
									children: autopilot ? "Stop" : "Go"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "throttle speed-row",
								"data-tip": "Cruise speed. The warp number follows.",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Slider, {
									className: "slider",
									"aria-label": "Speed",
									min: 0,
									max: 1,
									step: .005,
									value: [speed],
									onValueChange: ([value]) => setSpeed(clamp01(value ?? 0)),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderTrack, {
										className: "slider-track",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRange, { className: "slider-range" })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderThumb, {
										className: "slider-thumb",
										"aria-label": "Speed",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
									})]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "view-cycle",
								"data-tip": VIEWS.find((item) => item.id === view)?.tip,
								"aria-label": `Camera is ${VIEWS.find((item) => item.id === view)?.label}. Switch camera.`,
								onClick: cycleView,
								children: VIEWS.find((item) => item.id === view)?.label
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "more-btn",
								"data-tip": "Boost, orbit, horizon, stars, and full screen",
								"aria-pressed": moreOpen,
								"aria-expanded": moreOpen,
								"aria-label": moreOpen ? "Hide extra controls" : "Show extra controls",
								onClick: () => {
									setMoreOpen((open) => !open);
									setNavOpen(false);
								},
								children: moreOpen ? "Less" : "More"
							})
						]
					})
				]
			})
		})]
	});
}
var SplitComponent = Slipstream;
//#endregion
export { SplitComponent as component };
