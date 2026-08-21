import type { DistanceScaleMode, SizeScaleMode } from "../types";

export type { DistanceScaleMode, SizeScaleMode } from "../types";

export const EARTH_RADIUS_KM = 6_371;
export const SUN_RENDER_RADIUS = 8;

export const MAX_HELIOCENTRIC_DISTANCE_AU = 39.5;
export const MIN_HELIOCENTRIC_RENDER_DISTANCE = 16;
export const MAX_HELIOCENTRIC_RENDER_DISTANCE = 190;

export const MIN_MOON_ORBIT_RADIUS_MULTIPLIER = 2.5;
export const MAX_MOON_ORBIT_RADIUS_MULTIPLIER = 9;
export const FOCUSED_MIN_MOON_ORBIT_RADIUS_MULTIPLIER = 3;
export const FOCUSED_MAX_MOON_ORBIT_RADIUS_MULTIPLIER = 13;

/** The body categories needed by the visual-size functions. */
export type ScalableBodyType = "star" | "planet" | "dwarf-planet" | "moon";

/** Structural subset accepted from CelestialBodyData. */
export interface ScalableBody {
  readonly radiusKm: number;
  readonly type: ScalableBodyType;
}

export interface HeliocentricScaleConfig {
  maxDistanceAU: number;
  minRenderDistance: number;
  maxRenderDistance: number;
}

/** Shared immutable defaults; using them does not create a per-frame object. */
export const DEFAULT_HELIOCENTRIC_SCALE: Readonly<HeliocentricScaleConfig> =
  Object.freeze({
    maxDistanceAU: MAX_HELIOCENTRIC_DISTANCE_AU,
    minRenderDistance: MIN_HELIOCENTRIC_RENDER_DISTANCE,
    maxRenderDistance: MAX_HELIOCENTRIC_RENDER_DISTANCE,
  });

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Logarithmic heliocentric compression.
 *
 * normalized = log(1 + d) / log(1 + dMax)
 * rendered = rMin + normalized (rMax - rMin)
 */
export function mapLogHeliocentricDistance(
  distanceAU: number,
  maxDistanceAU = MAX_HELIOCENTRIC_DISTANCE_AU,
  minRenderDistance = MIN_HELIOCENTRIC_RENDER_DISTANCE,
  maxRenderDistance = MAX_HELIOCENTRIC_RENDER_DISTANCE,
): number {
  const safeMaximum = finiteNonNegative(maxDistanceAU);
  if (safeMaximum === 0) return minRenderDistance;

  const safeDistance = clamp(
    finiteNonNegative(distanceAU),
    0,
    safeMaximum,
  );
  const normalized = Math.log1p(safeDistance) / Math.log1p(safeMaximum);
  return minRenderDistance +
    normalized * (maxRenderDistance - minRenderDistance);
}

/**
 * Linear comparison scale.
 *
 * normalized = d / dMax. This intentionally makes the inner planets cluster,
 * demonstrating the real disparity between inner and outer orbital distances.
 */
export function mapLinearHeliocentricDistance(
  distanceAU: number,
  maxDistanceAU = MAX_HELIOCENTRIC_DISTANCE_AU,
  minRenderDistance = MIN_HELIOCENTRIC_RENDER_DISTANCE,
  maxRenderDistance = MAX_HELIOCENTRIC_RENDER_DISTANCE,
): number {
  const safeMaximum = finiteNonNegative(maxDistanceAU);
  if (safeMaximum === 0) return minRenderDistance;

  const normalized =
    clamp(finiteNonNegative(distanceAU), 0, safeMaximum) / safeMaximum;
  return minRenderDistance +
    normalized * (maxRenderDistance - minRenderDistance);
}

/**
 * Focus-centered signed logarithmic mapping.
 *
 * The selected system maps to the middle of the render range. Signed distance
 * from the focus is compressed with log(1 + |Δd|), retaining orbital order
 * while dedicating more screen space to the focus neighborhood.
 */
export function mapFocusHeliocentricDistance(
  distanceAU: number,
  focusDistanceAU: number,
  maxDistanceAU = MAX_HELIOCENTRIC_DISTANCE_AU,
  minRenderDistance = MIN_HELIOCENTRIC_RENDER_DISTANCE,
  maxRenderDistance = MAX_HELIOCENTRIC_RENDER_DISTANCE,
): number {
  const safeMaximum = finiteNonNegative(maxDistanceAU);
  if (safeMaximum === 0) {
    return (minRenderDistance + maxRenderDistance) * 0.5;
  }

  const distance = clamp(finiteNonNegative(distanceAU), 0, safeMaximum);
  const focus = clamp(finiteNonNegative(focusDistanceAU), 0, safeMaximum);
  const delta = distance - focus;
  const largestSpan = Math.max(focus, safeMaximum - focus);
  const center = (minRenderDistance + maxRenderDistance) * 0.5;

  if (largestSpan === 0 || delta === 0) return center;

  const normalizedMagnitude =
    Math.log1p(Math.abs(delta)) / Math.log1p(largestSpan);
  const signedNormalized = delta < 0
    ? -normalizedMagnitude
    : normalizedMagnitude;
  const halfRange = (maxRenderDistance - minRenderDistance) * 0.5;

  return clamp(
    center + signedNormalized * halfRange,
    Math.min(minRenderDistance, maxRenderDistance),
    Math.max(minRenderDistance, maxRenderDistance),
  );
}

/** Dispatch a heliocentric distance through the active UI scale mode. */
export function mapHeliocentricDistance(
  distanceAU: number,
  mode: DistanceScaleMode,
  focusDistanceAU?: number,
  config: Readonly<HeliocentricScaleConfig> = DEFAULT_HELIOCENTRIC_SCALE,
): number {
  if (mode === "linear") {
    return mapLinearHeliocentricDistance(
      distanceAU,
      config.maxDistanceAU,
      config.minRenderDistance,
      config.maxRenderDistance,
    );
  }

  if (mode === "focus") {
    // Focus mode normally receives the selected body's AU distance. If the
    // renderer handles focus purely through its camera/local-system transform,
    // retaining the global log map is the least surprising two-argument form.
    if (focusDistanceAU === undefined) {
      return mapLogHeliocentricDistance(
        distanceAU,
        config.maxDistanceAU,
        config.minRenderDistance,
        config.maxRenderDistance,
      );
    }

    return mapFocusHeliocentricDistance(
      distanceAU,
      focusDistanceAU,
      config.maxDistanceAU,
      config.minRenderDistance,
      config.maxRenderDistance,
    );
  }

  return mapLogHeliocentricDistance(
    distanceAU,
    config.maxDistanceAU,
    config.minRenderDistance,
    config.maxRenderDistance,
  );
}

/**
 * Local logarithmic scale for satellites.
 *
 * shifted = max(0, d - dMin)
 * normalized = log(1 + shifted) / log(1 + (dMax - dMin))
 * This scale is deliberately independent from the AU-scale Solar System map.
 */
export function mapSatelliteDistanceToRange(
  distanceKm: number,
  minDistanceKm: number,
  maxDistanceKm: number,
  minRenderDistance: number,
  maxRenderDistance: number,
): number {
  const minimum = finiteNonNegative(minDistanceKm);
  const maximum = Math.max(minimum, finiteNonNegative(maxDistanceKm));
  const distance = clamp(finiteNonNegative(distanceKm), minimum, maximum);
  const shiftedDistance = distance - minimum;
  const shiftedMaximum = maximum - minimum;

  if (shiftedMaximum === 0) return minRenderDistance;

  const normalized =
    Math.log1p(shiftedDistance) / Math.log1p(shiftedMaximum);
  return minRenderDistance +
    normalized * (maxRenderDistance - minRenderDistance);
}

/**
 * Map a moon's real parent distance into its parent's local render system.
 * Focused systems expand from the default 2.5–9 to 3–13 parent radii.
 */
export function mapSatelliteDistance(
  distanceKm: number,
  minDistanceKm: number,
  maxDistanceKm: number,
  parentRenderedRadius: number,
  focused = false,
): number {
  const parentRadius = finiteNonNegative(parentRenderedRadius);
  const minimumMultiplier = focused
    ? FOCUSED_MIN_MOON_ORBIT_RADIUS_MULTIPLIER
    : MIN_MOON_ORBIT_RADIUS_MULTIPLIER;
  const maximumMultiplier = focused
    ? FOCUSED_MAX_MOON_ORBIT_RADIUS_MULTIPLIER
    : MAX_MOON_ORBIT_RADIUS_MULTIPLIER;

  return mapSatelliteDistanceToRange(
    distanceKm,
    minDistanceKm,
    maxDistanceKm,
    parentRadius * minimumMultiplier,
    parentRadius * maximumMultiplier,
  );
}

/**
 * Convenience wrapper that keeps a moon system between 2.5 and 9 displayed
 * parent radii by default.
 */
export function mapMoonLocalDistance(
  distanceKm: number,
  minDistanceKm: number,
  maxDistanceKm: number,
  parentRenderedRadius: number,
  minRadiusMultiplier = MIN_MOON_ORBIT_RADIUS_MULTIPLIER,
  maxRadiusMultiplier = MAX_MOON_ORBIT_RADIUS_MULTIPLIER,
): number {
  const parentRadius = finiteNonNegative(parentRenderedRadius);
  return mapSatelliteDistanceToRange(
    distanceKm,
    minDistanceKm,
    maxDistanceKm,
    parentRadius * minRadiusMultiplier,
    parentRadius * maxRadiusMultiplier,
  );
}

/** Default visibility-enhanced mapping for planets and dwarf planets. */
export function mapEnhancedPlanetRadius(radiusKm: number): number {
  const ratio = finiteNonNegative(radiusKm) / EARTH_RADIUS_KM;
  return clamp(0.55 + 0.65 * Math.sqrt(ratio), 0.55, 4);
}

/** Default visibility-enhanced mapping with a smaller floor for satellites. */
export function mapEnhancedMoonRadius(radiusKm: number): number {
  const ratio = finiteNonNegative(radiusKm) / EARTH_RADIUS_KM;
  return clamp(0.16 + 0.4 * Math.sqrt(ratio), 0.16, 0.75);
}

/** Enhanced Visibility mode; the Sun is intentionally capped separately. */
export function mapEnhancedBodyRadius(
  radiusKm: number,
  bodyType: ScalableBodyType,
): number {
  if (bodyType === "star") return SUN_RENDER_RADIUS;
  if (bodyType === "moon") return mapEnhancedMoonRadius(radiusKm);
  return mapEnhancedPlanetRadius(radiusKm);
}

/**
 * Relative Size mode.
 *
 * rendered = base + coefficient (radius / EarthRadius)^0.78
 * The higher exponent preserves more of the real size contrast than the
 * square-root enhanced mode, while the small base still keeps tiny moons usable.
 */
export function mapRelativeBodyRadius(
  radiusKm: number,
  bodyType: ScalableBodyType,
): number {
  if (bodyType === "star") return SUN_RENDER_RADIUS;

  const ratio = finiteNonNegative(radiusKm) / EARTH_RADIUS_KM;
  const poweredRatio = Math.pow(ratio, 0.78);

  if (bodyType === "moon") {
    return Math.min(0.9, 0.08 + 0.52 * poweredRatio);
  }

  return Math.min(6, 0.18 + 0.75 * poweredRatio);
}

/**
 * Uniform Markers mode. A small monotonic logarithmic variation keeps real size
 * ordering visible without letting any body dominate the marker set.
 */
export function mapUniformBodyRadius(radiusKm: number): number {
  const normalized =
    Math.log1p(finiteNonNegative(radiusKm)) / Math.log1p(696_340);
  return 0.72 + 0.4 * normalized;
}

/** Dispatch actual radius through the selected UI size representation. */
export function mapBodyRadiusValue(
  radiusKm: number,
  bodyType: ScalableBodyType,
  mode: SizeScaleMode,
): number {
  if (mode === "relative") {
    return mapRelativeBodyRadius(radiusKm, bodyType);
  }

  if (mode === "uniform") {
    return mapUniformBodyRadius(radiusKm);
  }

  return mapEnhancedBodyRadius(radiusKm, bodyType);
}

/** Map a CelestialBodyData-compatible object through the selected size mode. */
export function mapBodyRadius(
  body: ScalableBody,
  mode: SizeScaleMode,
): number {
  return mapBodyRadiusValue(body.radiusKm, body.type, mode);
}
