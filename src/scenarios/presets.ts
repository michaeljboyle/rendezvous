import { validateScenario, type Scenario } from './schema';
import p1 from './presets/1-phasing.json';
import p2 from './presets/2-undock.json';
import p3 from './presets/3-vbar.json';
import p4 from './presets/4-rbar.json';
import p5 from './presets/5-multiphase.json';
import p6 from './presets/6-sandbox.json';

export interface PresetEntry {
  id: string;
  number: number;
  /** Short label for narrow layouts. */
  short: string;
  scenario: Scenario;
}

/** Every preset is validated against the schema on load. */
export const PRESETS: PresetEntry[] = [
  { id: 'phasing', number: 1, short: 'Phasing', scenario: validateScenario(p1) },
  { id: 'undock', number: 2, short: 'Undock', scenario: validateScenario(p2) },
  { id: 'vbar', number: 3, short: 'V-bar', scenario: validateScenario(p3) },
  { id: 'rbar', number: 4, short: 'R-bar', scenario: validateScenario(p4) },
  { id: 'multiphase', number: 5, short: 'Multi-stage', scenario: validateScenario(p5) },
  { id: 'sandbox', number: 6, short: 'Sandbox', scenario: validateScenario(p6) },
];

export function presetById(id: string): PresetEntry | undefined {
  return PRESETS.find((p) => p.id === id);
}
