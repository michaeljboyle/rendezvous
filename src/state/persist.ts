import { validateScenario, type Scenario } from '../scenarios/schema';

const KEY = 'rendezvous:v1';

export interface Saved {
  scenario: Scenario;
  presetId: string | null;
  edited: boolean;
}

export function saveLocal(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: autosave is best-effort */
  }
}

export function loadLocal(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Saved>;
    return {
      scenario: validateScenario(o.scenario),
      presetId: typeof o.presetId === 'string' ? o.presetId : null,
      edited: o.edited === true,
    };
  } catch {
    return null;
  }
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Share link: the scenario as base64 JSON in the URL hash. */
export function encodeShareHash(s: Scenario): string {
  return `#s=${toBase64Url(JSON.stringify(s))}`;
}

/** Returns the scenario in the hash, null if none, or throws ScenarioError/SyntaxError if malformed. */
export function decodeShareHash(hash: string): Scenario | null {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m) return null;
  return validateScenario(JSON.parse(fromBase64Url(m[1])));
}

export function scenarioToJson(s: Scenario): string {
  return JSON.stringify(s, null, 2) + '\n';
}

export function parseScenarioJson(text: string): Scenario {
  return validateScenario(JSON.parse(text));
}
