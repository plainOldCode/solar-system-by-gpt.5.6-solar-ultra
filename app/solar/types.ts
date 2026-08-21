export type CelestialBodyType = "star" | "planet" | "dwarf-planet" | "moon";

export type OrbitDistanceUnit = "AU" | "km";

export type OrbitReferencePlane =
  | "ecliptic-j2000"
  | "parent-equator"
  | "parent-laplace-plane";

export type OrbitalElementsEpoch = "J2000" | "2020-01-01";

export type RotationState =
  | "prograde"
  | "retrograde"
  | "synchronous"
  | "synchronous-retrograde"
  | "chaotic";

/** Mean osculating elements used by the visualization (not a live ephemeris). */
export interface OrbitData {
  readonly semiMajorAxis: number;
  readonly semiMajorAxisUnit: OrbitDistanceUnit;
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly orbitalPeriodDays: number;
  readonly longitudeAscendingNodeDeg: number;
  readonly argumentOfPeriapsisDeg: number;
  readonly meanAnomalyAtEpochDeg: number;
  readonly epoch: OrbitalElementsEpoch;
  readonly referencePlane: OrbitReferencePlane;
}

export interface BodyDisplayPalette {
  readonly base: `#${string}`;
  readonly light: `#${string}`;
  readonly dark: `#${string}`;
  readonly orbit: `#${string}`;
}

export interface CelestialBodyData {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly type: CelestialBodyType;
  readonly parentId?: string;
  readonly radiusKm: number;
  readonly orbit: OrbitData | null;
  /** Sidereal rotation duration. Always positive; direction is separate. */
  readonly rotationPeriodHours: number;
  readonly rotationState: RotationState;
  readonly axialTiltDeg: number;
  readonly display: BodyDisplayPalette;
  readonly descriptionKo: string;
}

export type DistanceScaleMode = "log" | "linear" | "focus";

export type SizeScaleMode = "enhanced" | "relative" | "uniform";

/** Short aliases used by render and control modules. */
export type DistanceMode = DistanceScaleMode;
export type SizeMode = SizeScaleMode;
