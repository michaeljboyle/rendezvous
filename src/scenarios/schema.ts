/** Scenario format: shape of each preset file, of export/import and of the share link. */

export interface ScenarioBurn {
  name: string;
  /** Time of ignition, s after T+0. */
  tigS: number;
  /** Δv in the Chaser's local frame, m/s: r = radial (+ up), s = along-track (+ prograde). */
  dv: { r: number; s: number };
  enabled: boolean;
}

export interface ChaserLvlhInit {
  /** Curvilinear LVLH offset from the Target, m. */
  vbarM: number;
  rbarM: number;
  /** Optional velocity relative to the rotating LVLH frame, m/s (default 0 = at rest). */
  vVbarMps?: number;
  vRbarMps?: number;
}

export interface ChaserCircularInit {
  altitudeKm: number;
  /** Phase angle relative to the Target, degrees, negative = behind. */
  phaseDeg: number;
}

export interface Scenario {
  name: string;
  description?: string;
  target: { altitudeKm: number };
  chaser: { lvlh: ChaserLvlhInit } | { circular: ChaserCircularInit };
  /** Scenario length, s. If durationRevs is set it wins. */
  durationS: number;
  /** Scenario length in Target revolutions (optional alternative to durationS). */
  durationRevs?: number;
  burns: ScenarioBurn[];
}

export class ScenarioError extends Error {}

function num(v: unknown, path: string, opts: { min?: number; max?: number } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ScenarioError(`${path} must be a number`);
  if (opts.min !== undefined && v < opts.min) throw new ScenarioError(`${path} must be ≥ ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) throw new ScenarioError(`${path} must be ≤ ${opts.max}`);
  return v;
}

function optNum(v: unknown, path: string): number | undefined {
  return v === undefined ? undefined : num(v, path);
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ScenarioError(`${path} must be an object`);
  return v as Record<string, unknown>;
}

const MAX_DURATION_S = 30 * 86400;

/** Validate untrusted JSON and return a clean Scenario. Throws ScenarioError with a readable message. */
export function validateScenario(input: unknown): Scenario {
  const o = obj(input, 'scenario');
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 120) : 'Untitled scenario';
  const description = typeof o.description === 'string' ? o.description.slice(0, 1000) : undefined;
  const target = obj(o.target, 'target');
  const altitudeKm = num(target.altitudeKm, 'target.altitudeKm', { min: 100, max: 100000 });

  const ch = obj(o.chaser, 'chaser');
  let chaser: Scenario['chaser'];
  if (ch.lvlh !== undefined) {
    const l = obj(ch.lvlh, 'chaser.lvlh');
    const init: ChaserLvlhInit = {
      vbarM: num(l.vbarM, 'chaser.lvlh.vbarM'),
      rbarM: num(l.rbarM, 'chaser.lvlh.rbarM', { min: -(altitudeKm * 1000 - 100e3) }),
    };
    const vv = optNum(l.vVbarMps, 'chaser.lvlh.vVbarMps');
    const vr = optNum(l.vRbarMps, 'chaser.lvlh.vRbarMps');
    if (vv !== undefined) init.vVbarMps = vv;
    if (vr !== undefined) init.vRbarMps = vr;
    chaser = { lvlh: init };
  } else if (ch.circular !== undefined) {
    const c = obj(ch.circular, 'chaser.circular');
    chaser = {
      circular: {
        altitudeKm: num(c.altitudeKm, 'chaser.circular.altitudeKm', { min: 100, max: 100000 }),
        phaseDeg: num(c.phaseDeg, 'chaser.circular.phaseDeg', { min: -180, max: 180 }),
      },
    };
  } else {
    throw new ScenarioError('chaser needs either "lvlh" or "circular"');
  }

  const durationRevs = optNum(o.durationRevs, 'durationRevs');
  if (durationRevs !== undefined && (durationRevs <= 0 || durationRevs > 100))
    throw new ScenarioError('durationRevs must be between 0 and 100');
  let durationS = o.durationS === undefined && durationRevs !== undefined ? 0 : num(o.durationS, 'durationS', { min: 0, max: MAX_DURATION_S });
  if (durationRevs === undefined && durationS <= 0) throw new ScenarioError('durationS must be > 0');
  durationS = Math.min(durationS, MAX_DURATION_S);

  if (!Array.isArray(o.burns)) throw new ScenarioError('burns must be an array');
  if (o.burns.length > 200) throw new ScenarioError('too many burns (max 200)');
  const burns: ScenarioBurn[] = o.burns.map((b, i) => {
    const bo = obj(b, `burns[${i}]`);
    const dv = obj(bo.dv, `burns[${i}].dv`);
    return {
      name: typeof bo.name === 'string' ? bo.name.slice(0, 60) : `Burn ${i + 1}`,
      tigS: num(bo.tigS, `burns[${i}].tigS`),
      dv: { r: num(dv.r, `burns[${i}].dv.r`), s: num(dv.s, `burns[${i}].dv.s`) },
      enabled: bo.enabled === undefined ? true : bo.enabled === true,
    };
  });

  const out: Scenario = { name, target: { altitudeKm }, chaser, durationS, burns };
  if (description !== undefined) out.description = description;
  if (durationRevs !== undefined) out.durationRevs = durationRevs;
  return out;
}

export function cloneScenario(s: Scenario): Scenario {
  return JSON.parse(JSON.stringify(s)) as Scenario;
}
