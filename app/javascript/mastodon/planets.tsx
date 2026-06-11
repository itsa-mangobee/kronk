import type { IconProp } from 'mastodon/components/icon';

export type PlanetName =
  | 'Sol'
  | 'Mercury'
  | 'Venus'
  | 'Earth'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto';

export const PLANET_COLORS: Record<PlanetName, string> = {
  Sol: '#9040C8',
  Mercury: '#6628C0',
  Venus: '#6A10D0',
  Earth: '#563ACC',
  Mars: '#422CA4',
  Jupiter: '#36248C',
  Saturn: '#4844C0',
  Uranus: '#3034A0',
  Neptune: '#343070',
  Pluto: '#1C1858',
};

// Which planet each space orbits
export const SPACE_PLANET: Record<string, PlanetName> = {
  Feed: 'Mercury',
  Huddle: 'Venus',
  WatchuNeed: 'Earth',
  Kommons: 'Jupiter',
  Kalendar: 'Neptune',
  InFlow: 'Uranus',
  Questions: 'Saturn',
  Booth: 'Uranus',
  Flow: 'Mars',
};

export function spaceColor(space: string): string {
  const planet = SPACE_PLANET[space];
  return planet !== undefined ? PLANET_COLORS[planet] : PLANET_COLORS.Earth;
}

export function planetName(space: string): string {
  return SPACE_PLANET[space] ?? 'Earth';
}

function makePlanetIcon(color: string): IconProp {
  const PlanetIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox='0 0 24 24' {...props}>
      <circle cx='12' cy='12' r='10' style={{ fill: color }} />
    </svg>
  );
  return PlanetIcon as IconProp;
}

const PLANET_ICONS: Record<PlanetName, IconProp> = {
  Sol: makePlanetIcon(PLANET_COLORS.Sol),
  Mercury: makePlanetIcon(PLANET_COLORS.Mercury),
  Venus: makePlanetIcon(PLANET_COLORS.Venus),
  Earth: makePlanetIcon(PLANET_COLORS.Earth),
  Mars: makePlanetIcon(PLANET_COLORS.Mars),
  Jupiter: makePlanetIcon(PLANET_COLORS.Jupiter),
  Saturn: makePlanetIcon(PLANET_COLORS.Saturn),
  Uranus: makePlanetIcon(PLANET_COLORS.Uranus),
  Neptune: makePlanetIcon(PLANET_COLORS.Neptune),
  Pluto: makePlanetIcon(PLANET_COLORS.Pluto),
};

export function planetIcon(space: string): IconProp {
  const planet = SPACE_PLANET[space];
  return planet !== undefined ? PLANET_ICONS[planet] : PLANET_ICONS.Earth;
}
