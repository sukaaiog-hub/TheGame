import type { OperatorDefinition, OperatorId } from './types';

export const OPERATORS: Record<OperatorId, OperatorDefinition> = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    callsign: 'ALPHA-01',
    role: 'Tactical Striker',
    tagline: 'Balanced frontline assault operative built for hot compound drops.',
    suitColor: '#1d4ed8',
    vestColor: '#0f172a',
    visorColor: '#38bdf8',
    accentColor: '#60a5fa',
  },
  spectre: {
    id: 'spectre',
    name: 'Spectre',
    callsign: 'GHOST-07',
    role: 'Stealth Recon',
    tagline: 'Night-ops marksman thriving in treeline ambushes and flank routes.',
    suitColor: '#6d28d9',
    vestColor: '#1e1b4b',
    visorColor: '#e879f9',
    accentColor: '#c084fc',
  },
  titan: {
    id: 'titan',
    name: 'Titan',
    callsign: 'IRON-04',
    role: 'Heavy Breacher',
    tagline: 'Armored close-quarters enforcer ready to crack barricades open.',
    suitColor: '#b45309',
    vestColor: '#292524',
    visorColor: '#facc15',
    accentColor: '#fbbf24',
  },
  nomad: {
    id: 'nomad',
    name: 'Nomad',
    callsign: 'DUNE-12',
    role: 'Wasteland Scout',
    tagline: 'Veteran scavenger tuned for fast rotations ahead of the storm.',
    suitColor: '#0f766e',
    vestColor: '#1c1917',
    visorColor: '#5eead4',
    accentColor: '#2dd4bf',
  },
  viper: {
    id: 'viper',
    name: 'Viper',
    callsign: 'FANG-09',
    role: 'CQB Specialist',
    tagline: 'Hyper-aggressive SMG & shotgun rusher with neon tactical rig.',
    suitColor: '#be123c',
    vestColor: '#18181b',
    visorColor: '#fda4af',
    accentColor: '#fb7185',
  },
  valkyrie: {
    id: 'valkyrie',
    name: 'Valkyrie',
    callsign: 'FROST-03',
    role: 'Orbital Raider',
    tagline: 'High-altitude drop trooper specialized in supply crate rushes.',
    suitColor: '#0369a1',
    vestColor: '#0f172a',
    visorColor: '#bae6fd',
    accentColor: '#22d3ee',
  },
};

export const OPERATOR_LIST: OperatorDefinition[] = Object.values(OPERATORS);

export function getOperatorDefinition(id: OperatorId | string): OperatorDefinition {
  return OPERATORS[id as OperatorId] ?? OPERATORS.vanguard;
}
