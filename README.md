# Solar System by GPT-5.6 Solar Ultra

An interactive Three.js solar-system simulation that keeps astronomical source data separate from the visual scales needed to make the system readable on a screen. The Sun, eight planets, Pluto, and 28 representative moons can be explored in a global logarithmic view or in a focused planetary system.

> This is an educational visualization, not a precision ephemeris. Orbital distances are compressed for comprehension and body radii are enlarged for visibility; those two display scales are not a shared physical scale.

## Prompt attribution

This implementation was produced from the supplied Three.js solar-system implementation prompt. The prompt reference is recorded here for transparency:

[View the source prompt gist](https://gist.github.com/plainOldCode/fb2e3ea48caada23107704628c2a9384)

## Run locally

Node.js `22.13.0` or newer is recommended.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. The production and verification commands are:

```bash
npm run build
npm run start
npm run lint
npm test
```

`npm test` builds the app and runs the server-rendering/data-integrity checks in `tests/solar-system.test.mjs`.

## What is included

- Three.js scene with a procedural star field, ambient light, Sun glow, Sun light, orbit lines, labels, and responsive HTML HUD panels.
- Sun, Mercury through Neptune, Pluto, and 28 configurable moons: Moon; Phobos and Deimos; Amalthea, Io, Europa, Ganymede, and Callisto; Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Hyperion, and Iapetus; Miranda, Ariel, Umbriel, Titania, and Oberon; Triton and Nereid; and Pluto's Charon, Styx, Nix, Kerberos, and Hydra.
- Kepler-equation motion using cumulative simulation days, so the orbital-period ratios remain meaningful regardless of frame rate.
- Elliptical, inclined orbits with eccentricity and inclination preserved in the data model; Pluto's eccentric, tilted path is intentionally visible.
- Global, linear-comparison, and focused distance modes; Enhanced Visibility, Relative Size, and Uniform Markers size modes.
- Play/pause, reset, 1/10/100 days or 1 year per second, orbital/label/moon/star toggles, camera reset, body selection, hover tooltip, and detail panels.
- Global-to-planetary-system camera easing. Selecting a moon frames it together with its parent system.
- Keyboard-friendly native controls, bilingual Korean/English labels, reduced-motion handling, and mobile layout adjustments.

## Data and display scales

The runtime never treats a render unit as a physical unit. Each body keeps its source values (`radiusKm`, semi-major axis, eccentricity, inclination, orbital period, rotation period, and epoch metadata) in `app/solar/data/solarSystemData.ts`. The runtime then derives separate display values:

| Layer | Units | Purpose |
| --- | --- | --- |
| Astronomical data | km, AU, days, hours, degrees | Source physical and orbital values |
| Render orbit distance | Three.js units | A readable global or focused layout |
| Render body radius | Three.js units | A selectable, visible marker |

### Global distance modes

The default logarithmic mapping uses `dMax = 39.5 AU`, `rMin = 16`, and `rMax = 190`:

```text
n = log1p(semiMajorAxisAU) / log1p(39.5)
renderOrbit = 16 + n * (190 - 16)
```

The linear mode uses the same display range with `n = semiMajorAxisAU / 39.5`. It is intentionally a comparison view, not a 1:1 AU model. Focus mode centers the selected planetary system and applies a separate local logarithmic mapping for its moons.

### Moon distance mapping

Moon semi-major axes remain in kilometers and are mapped inside their parent's local `THREE.Group`. The normal view places moons at roughly `2.5–9×` the parent's rendered radius; focus view expands that range. The monotonic mapping keeps each parent's real moon-distance ordering while keeping small moons selectable.

### Body size modes

Enhanced Visibility is the default: it uses a square-root response and minimum sizes, with the Sun capped independently at about eight render units. Relative Size keeps more of the source radius contrast, while Uniform Markers makes bodies easier to scan with a small logarithmic size variation. Switching modes never changes `radiusKm`.

## Motion model

The data is referenced to J2000 (`2000-01-01 12:00 UTC`) where available. For each orbit the runtime advances mean anomaly from the accumulated simulation day count, solves `M = E - e sin(E)` with Newton iterations, constructs the ellipse, and applies the stored inclination and orientation angles. Rotation is derived from simulation time as well, so reset is deterministic and frame-rate independent. This is a two-body educational approximation: it does not model live perturbations, precession, barycentric wobble, collisions, eclipses, or tidal evolution.

## Controls

- Left drag: orbit the camera
- Wheel/trackpad: zoom
- Right drag: pan
- Click a body: select and focus it
- Empty-space double-click or **Solar System**: return to the global view
- `Space`: play/pause, `R`: reset, `Escape`: return from a focused system

The detail panel separates actual values from rendered radius/orbit units and shows the active scale mode. The persistent disclaimer explains why those values must not be compared as one physical scale.

## Project layout

```text
app/
  page.tsx                         # vinext App Router entry point
  components/
    SolarSystemExperience.tsx      # Three.js runtime and React bridge
    ControlPanel.tsx               # Time, distance, size, and layer controls
    InfoPanel.tsx                  # Actual values versus render values
  solar/
    SolarSystemRuntime.ts          # Scene, camera, selection, and RAF loop
    data/solarSystemData.ts        # Astronomical data only
    math/kepler.ts                 # Kepler solver and orbital coordinates
    math/scales.ts                 # Global and local display mappings
    SimulationClock.ts             # Frame-rate-independent simulation time
    config.ts, types.ts             # Render constants and typed data model
  globals.css                      # Responsive HUD and accessibility styles
tests/solar-system.test.mjs        # Build, SSR, and data-integrity checks
vite.config.ts                     # vinext and Cloudflare Vite setup
worker/index.ts                    # Deployment runtime entry point
```

## Astronomical sources

Values are rounded only where extra precision is not useful for this visualization. The source URLs, units, epoch, reference-plane notes, and known limitations are documented in the data module and in the Korean companion document.

- [JPL Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html) — planetary and Pluto radii, rotation periods, and orbital periods.
- [JPL Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html) — J2000-style semi-major axes, eccentricities, inclinations, and angular elements for the major planets. JPL's table does not include Pluto.
- [NASA/JPL Horizons API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html) and [Horizons service](https://ssd.jpl.nasa.gov/horizons/) — Pluto orbital-element cross-checks and epoch context.
- [JPL Planetary Satellite Physical Parameters](https://ssd.jpl.nasa.gov/sats/phys_par/) — mean radii for the included moons.
- [JPL Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/) — parent-centered moon semi-major axes, eccentricities, inclinations, and sidereal periods.

JPL explicitly describes the approximate and mean-element tables as suitable for general orbit-shape explanations rather than precision position calculations. Small irregular moons are represented by mean radii and simplified two-body elements; this project does not infer values that are absent from the cited tables.

## Performance and accessibility notes

The renderer caps device pixel ratio at two, reuses sphere/orbit geometry and materials, keeps one points geometry for stars, avoids per-frame React state updates, and disposes Three.js resources on unmount. Mobile layouts reduce star and label density. Native controls expose labels and pressed state, the body selector provides a keyboard alternative to pointer selection, and `prefers-reduced-motion` pauses automatic motion and removes camera tweening.

## License and contribution

No license has been selected yet. Add a license before accepting external contributions. Issues and pull requests are welcome for data corrections, accessibility improvements, and rendering/performance work.
