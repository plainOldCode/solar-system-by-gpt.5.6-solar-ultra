/** Mathematical constants shared by the orbit renderer. */
export const TWO_PI = Math.PI * 2;
export const DEG_TO_RAD = Math.PI / 180;

const DEFAULT_TOLERANCE = 1e-10;
const DEFAULT_MAX_ITERATIONS = 12;
const BISECTION_ITERATIONS = 48;

/**
 * The structural subset of THREE.Vector3 used by this module.
 *
 * Callers should pass a persistent Vector3 (or a plain reusable object). Writing
 * into it avoids allocating one temporary vector for every body on every frame.
 */
export interface MutableVector3Like {
  x: number;
  y: number;
  z: number;
}

/** Classical elliptical-orbit elements, expressed in render units and radians. */
export interface OrbitElementsRadians {
  /** Semi-major axis in any consistent unit (usually rendered scene units). */
  semiMajorAxis: number;
  /** Elliptical eccentricity, in the range [0, 1). */
  eccentricity?: number;
  /** Tilt of the orbital plane from the ecliptic. */
  inclinationRad?: number;
  /** Rotation of the ascending-node line around the scene's Y axis. */
  longitudeAscendingNodeRad?: number;
  /** Rotation from the ascending node to periapsis inside the orbital plane. */
  argumentOfPeriapsisRad?: number;
}

/** Orbit elements with the timing data needed to derive a mean anomaly. */
export interface TimedOrbitElementsRadians extends OrbitElementsRadians {
  orbitalPeriodDays: number;
  meanAnomalyAtEpochRad?: number;
}

/** Structural subset of the degree-based OrbitData stored in the data module. */
export interface OrbitDataLike {
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly orbitalPeriodDays: number;
  readonly longitudeAscendingNodeDeg?: number;
  readonly argumentOfPeriapsisDeg?: number;
  readonly meanAnomalyAtEpochDeg?: number;
}

/** Return an angle in the half-open range [0, 2π). */
export function normalizeRadians(angleRad: number): number {
  const remainder = angleRad % TWO_PI;
  return remainder < 0 ? remainder + TWO_PI : remainder;
}

/**
 * Compute mean anomaly from elapsed simulation time.
 *
 * M(t) = M₀ + n t, where mean motion n = 2π / orbitalPeriod.
 */
export function meanAnomalyAtTime(
  elapsedDays: number,
  orbitalPeriodDays: number,
  meanAnomalyAtEpochRad = 0,
): number {
  if (!Number.isFinite(orbitalPeriodDays) || orbitalPeriodDays <= 0) {
    throw new RangeError("orbitalPeriodDays must be a finite number greater than zero");
  }

  if (!Number.isFinite(elapsedDays) || !Number.isFinite(meanAnomalyAtEpochRad)) {
    throw new RangeError("elapsedDays and meanAnomalyAtEpochRad must be finite");
  }

  return normalizeRadians(
    meanAnomalyAtEpochRad + (elapsedDays / orbitalPeriodDays) * TWO_PI,
  );
}

/**
 * Solve Kepler's equation for an elliptical orbit.
 *
 * Kepler's equation is M = E - e sin(E), where M is mean anomaly, E is
 * eccentric anomaly, and e is eccentricity. Newton-Raphson is fast for normal
 * Solar System eccentricities; a monotonic bisection fallback keeps the result
 * robust for unusually eccentric, near-parabolic inputs.
 */
export function solveKeplerEquation(
  meanAnomalyRad: number,
  eccentricity: number,
  tolerance = DEFAULT_TOLERANCE,
  maxIterations = DEFAULT_MAX_ITERATIONS,
): number {
  if (!Number.isFinite(meanAnomalyRad)) {
    throw new RangeError("meanAnomalyRad must be finite");
  }

  if (
    !Number.isFinite(eccentricity) ||
    eccentricity < 0 ||
    eccentricity >= 1
  ) {
    throw new RangeError("eccentricity must be in the range [0, 1)");
  }

  const meanAnomaly = normalizeRadians(meanAnomalyRad);
  if (eccentricity === 0) return meanAnomaly;

  const safeTolerance =
    Number.isFinite(tolerance) && tolerance > 0
      ? tolerance
      : DEFAULT_TOLERANCE;
  const safeIterations =
    Number.isFinite(maxIterations) && maxIterations > 0
      ? Math.floor(maxIterations)
      : DEFAULT_MAX_ITERATIONS;

  // M is a good initial estimate for low e. Starting at π avoids the very
  // small derivative around periapsis that can destabilize high-e iterations.
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomaly : Math.PI;

  for (let index = 0; index < safeIterations; index += 1) {
    const residual =
      eccentricAnomaly -
      eccentricity * Math.sin(eccentricAnomaly) -
      meanAnomaly;
    const derivative = 1 - eccentricity * Math.cos(eccentricAnomaly);

    if (Math.abs(derivative) < Number.EPSILON) break;

    const correction = residual / derivative;
    eccentricAnomaly -= correction;

    if (Math.abs(correction) <= safeTolerance) {
      return normalizeRadians(eccentricAnomaly);
    }
  }

  // E - e sin(E) is strictly increasing for 0 <= e < 1, so bisection over a
  // complete revolution is guaranteed to converge.
  let lower = 0;
  let upper = TWO_PI;
  let midpoint = meanAnomaly;

  for (let index = 0; index < BISECTION_ITERATIONS; index += 1) {
    midpoint = (lower + upper) * 0.5;
    const residual = midpoint - eccentricity * Math.sin(midpoint) - meanAnomaly;

    if (Math.abs(residual) <= safeTolerance) break;
    if (residual > 0) upper = midpoint;
    else lower = midpoint;
  }

  return normalizeRadians(midpoint);
}

/** More explicit alias for consumers that name the solved quantity. */
export const solveEccentricAnomaly = solveKeplerEquation;

/**
 * Convert eccentric anomaly to true anomaly.
 *
 * tan(ν/2) = sqrt((1 + e) / (1 - e)) tan(E/2). The atan2 form
 * below is numerically stable at the quadrant boundaries.
 */
export function eccentricToTrueAnomaly(
  eccentricAnomalyRad: number,
  eccentricity: number,
): number {
  if (eccentricity < 0 || eccentricity >= 1) {
    throw new RangeError("eccentricity must be in the range [0, 1)");
  }

  const sine = Math.sqrt(1 - eccentricity * eccentricity) *
    Math.sin(eccentricAnomalyRad);
  const cosine = Math.cos(eccentricAnomalyRad) - eccentricity;
  return normalizeRadians(Math.atan2(sine, cosine));
}

/** r = a(1 - e cos(E)), the focus-to-body distance on an ellipse. */
export function orbitalRadiusAtEccentricAnomaly(
  semiMajorAxis: number,
  eccentricity: number,
  eccentricAnomalyRad: number,
): number {
  return semiMajorAxis *
    (1 - eccentricity * Math.cos(eccentricAnomalyRad));
}

/**
 * Write a 3D position from an eccentric anomaly without allocating a vector.
 *
 * In the unrotated orbital plane:
 *   p = a(cos(E) - e)
 *   q = a sqrt(1 - e²) sin(E)
 * This places the attracting body at the ellipse's focus rather than its
 * geometric center. Argument of periapsis rotates (p, q) in-plane, inclination
 * tilts q out of the XZ ecliptic, and the ascending node rotates around Y.
 */
export function writeOrbitPositionFromEccentricAnomaly(
  out: MutableVector3Like,
  semiMajorAxis: number,
  eccentricity: number,
  eccentricAnomalyRad: number,
  inclinationRad = 0,
  longitudeAscendingNodeRad = 0,
  argumentOfPeriapsisRad = 0,
): MutableVector3Like {
  const cosineE = Math.cos(eccentricAnomalyRad);
  const sineE = Math.sin(eccentricAnomalyRad);
  const semiMinorAxis =
    semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);

  const periapsisAxis = semiMajorAxis * (cosineE - eccentricity);
  const conjugateAxis = semiMinorAxis * sineE;

  const cosinePeriapsis = Math.cos(argumentOfPeriapsisRad);
  const sinePeriapsis = Math.sin(argumentOfPeriapsisRad);
  const inPlaneX =
    periapsisAxis * cosinePeriapsis - conjugateAxis * sinePeriapsis;
  const inPlaneZ =
    periapsisAxis * sinePeriapsis + conjugateAxis * cosinePeriapsis;

  const cosineInclination = Math.cos(inclinationRad);
  const sineInclination = Math.sin(inclinationRad);
  const cosineNode = Math.cos(longitudeAscendingNodeRad);
  const sineNode = Math.sin(longitudeAscendingNodeRad);

  out.x =
    inPlaneX * cosineNode +
    inPlaneZ * cosineInclination * sineNode;
  out.y = inPlaneZ * sineInclination;
  out.z =
    -inPlaneX * sineNode +
    inPlaneZ * cosineInclination * cosineNode;

  return out;
}

/** Solve Kepler's equation and write the position for a supplied mean anomaly. */
export function writeOrbitPosition(
  out: MutableVector3Like,
  elements: OrbitElementsRadians,
  meanAnomalyRad: number,
): MutableVector3Like {
  const eccentricity = elements.eccentricity ?? 0;
  const eccentricAnomaly = solveKeplerEquation(
    meanAnomalyRad,
    eccentricity,
  );

  return writeOrbitPositionFromEccentricAnomaly(
    out,
    elements.semiMajorAxis,
    eccentricity,
    eccentricAnomaly,
    elements.inclinationRad ?? 0,
    elements.longitudeAscendingNodeRad ?? 0,
    elements.argumentOfPeriapsisRad ?? 0,
  );
}

/**
 * Write an orbital position derived from accumulated simulation days.
 * Passing the same `out` vector each frame keeps this hot path allocation-free.
 */
export function writeOrbitPositionAtTime(
  out: MutableVector3Like,
  elements: TimedOrbitElementsRadians,
  elapsedDays: number,
): MutableVector3Like {
  const meanAnomaly = meanAnomalyAtTime(
    elapsedDays,
    elements.orbitalPeriodDays,
    elements.meanAnomalyAtEpochRad ?? 0,
  );

  return writeOrbitPosition(out, elements, meanAnomaly);
}

/**
 * Degree-based convenience for astronomical datasets while retaining a
 * primitive-only, allocation-free hot path.
 */
export function writeOrbitPositionAtTimeDegrees(
  out: MutableVector3Like,
  semiMajorAxis: number,
  eccentricity: number,
  inclinationDeg: number,
  orbitalPeriodDays: number,
  elapsedDays: number,
  meanAnomalyAtEpochDeg = 0,
  longitudeAscendingNodeDeg = 0,
  argumentOfPeriapsisDeg = 0,
): MutableVector3Like {
  const meanAnomaly = meanAnomalyAtTime(
    elapsedDays,
    orbitalPeriodDays,
    meanAnomalyAtEpochDeg * DEG_TO_RAD,
  );
  const eccentricAnomaly = solveKeplerEquation(meanAnomaly, eccentricity);

  return writeOrbitPositionFromEccentricAnomaly(
    out,
    semiMajorAxis,
    eccentricity,
    eccentricAnomaly,
    inclinationDeg * DEG_TO_RAD,
    longitudeAscendingNodeDeg * DEG_TO_RAD,
    argumentOfPeriapsisDeg * DEG_TO_RAD,
  );
}

/**
 * Renderer-facing degree-data adapter.
 *
 * `renderSemiMajorAxis` is deliberately supplied separately from OrbitData's
 * real AU/km value, keeping astronomical truth and display compression apart.
 */
export function writeOrbitalPosition(
  target: MutableVector3Like,
  orbit: OrbitDataLike,
  renderSemiMajorAxis: number,
  elapsedDays: number,
): MutableVector3Like {
  return writeOrbitPositionAtTimeDegrees(
    target,
    renderSemiMajorAxis,
    orbit.eccentricity,
    orbit.inclinationDeg,
    orbit.orbitalPeriodDays,
    elapsedDays,
    orbit.meanAnomalyAtEpochDeg ?? 0,
    orbit.longitudeAscendingNodeDeg ?? 0,
    orbit.argumentOfPeriapsisDeg ?? 0,
  );
}

/**
 * Build a closed, focus-centered unit orbit for BufferGeometry initialization.
 *
 * The returned packed xyz array has `segments + 1` vertices; the final vertex
 * repeats the first so a line strip closes cleanly. This is initialization work,
 * not a per-frame path. Multiplying these unit coordinates by the currently
 * rendered semi-major axis gives an orbit matching `writeOrbitalPosition`.
 */
export function createUnitOrbitPoints(
  orbit: OrbitDataLike,
  segments: number,
): Float32Array {
  const safeSegments = Number.isFinite(segments)
    ? Math.max(8, Math.floor(segments))
    : 128;
  const positions = new Float32Array((safeSegments + 1) * 3);
  const point: MutableVector3Like = { x: 0, y: 0, z: 0 };
  const inclinationRad = orbit.inclinationDeg * DEG_TO_RAD;
  const longitudeAscendingNodeRad =
    (orbit.longitudeAscendingNodeDeg ?? 0) * DEG_TO_RAD;
  const argumentOfPeriapsisRad =
    (orbit.argumentOfPeriapsisDeg ?? 0) * DEG_TO_RAD;

  for (let index = 0; index <= safeSegments; index += 1) {
    const eccentricAnomaly = (index / safeSegments) * TWO_PI;
    writeOrbitPositionFromEccentricAnomaly(
      point,
      1,
      orbit.eccentricity,
      eccentricAnomaly,
      inclinationRad,
      longitudeAscendingNodeRad,
      argumentOfPeriapsisRad,
    );

    const offset = index * 3;
    positions[offset] = point.x;
    positions[offset + 1] = point.y;
    positions[offset + 2] = point.z;
  }

  return positions;
}
