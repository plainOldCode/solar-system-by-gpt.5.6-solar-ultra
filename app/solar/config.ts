export const ASTRONOMICAL_UNIT_KM = 149_597_870.7;
export const EARTH_RADIUS_KM = 6_371;

export const HELIOCENTRIC_SCALE = {
  maxDistanceAU: 39.5,
  minRenderDistance: 16,
  maxRenderDistance: 190,
} as const;

export const BODY_SIZE_SCALE = {
  sunRenderRadius: 8,
  planetBaseRadius: 0.55,
  planetRatioMultiplier: 0.65,
  planetPower: 0.5,
  planetMinRadius: 0.55,
  planetMaxRadius: 4,
  moonBaseRadius: 0.16,
  moonRatioMultiplier: 0.4,
  moonPower: 0.5,
  moonMinRadius: 0.16,
  moonMaxRadius: 0.75,
  uniformPlanetRadius: 1.15,
  uniformMoonRadius: 0.32,
} as const;

export const SATELLITE_SCALE = {
  minParentRadiusFactor: 2.5,
  maxParentRadiusFactor: 9,
  focusedMinParentRadiusFactor: 3,
  focusedMaxParentRadiusFactor: 13,
} as const;

export const SIMULATION_DEFAULTS = {
  daysPerSecond: 100,
  availableDaysPerSecond: [1, 10, 100, 365.256] as const,
  startDateIso: "2000-01-01T12:00:00.000Z",
  maxFrameDeltaSeconds: 0.1,
} as const;

export const SCENE_DEFAULTS = {
  maxPixelRatio: 2,
  desktopStarCount: 1_800,
  mobileStarCount: 900,
  orbitSegments: 192,
  moonOrbitSegments: 96,
} as const;

export const SOLAR_RENDER_CONFIG = {
  astronomicalUnitKm: ASTRONOMICAL_UNIT_KM,
  earthRadiusKm: EARTH_RADIUS_KM,
  heliocentric: HELIOCENTRIC_SCALE,
  bodySize: BODY_SIZE_SCALE,
  satellite: SATELLITE_SCALE,
  simulation: SIMULATION_DEFAULTS,
  scene: SCENE_DEFAULTS,
} as const;
