import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Solar System experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Logarithmic Solar System<\/title>/i);
  assert.match(html, /NASA \/ JPL DATA MODEL/);
  assert.match(html, /태양계 전체 보기/);
  assert.match(html, /실제 천문 데이터/);
  assert.match(html, /축척 안내/);
  assert.match(html, /궤도 거리는 압축되고 천체 크기는 가시성을 위해 확대/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("keeps astronomical data and render mappings separate", async () => {
  const [data, runtime, scales, kepler, packageJson] = await Promise.all([
    readFile(new URL("app/solar/data/solarSystemData.ts", root), "utf8"),
    readFile(new URL("app/solar/SolarSystemRuntime.ts", root), "utf8"),
    readFile(new URL("app/solar/math/scales.ts", root), "utf8"),
    readFile(new URL("app/solar/math/kepler.ts", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);

  const requiredBodies = [
    "sun", "mercury", "venus", "earth", "moon", "mars", "phobos", "deimos",
    "jupiter", "io", "europa", "ganymede", "callisto", "saturn", "mimas",
    "enceladus", "tethys", "dione", "rhea", "titan", "iapetus", "uranus",
    "miranda", "ariel", "umbriel", "titania", "oberon", "neptune", "triton",
    "pluto", "charon", "styx", "nix", "kerberos", "hydra",
  ];
  for (const id of requiredBodies) {
    assert.match(data, new RegExp(`id: ["']${id}["']`), `missing body: ${id}`);
  }

  assert.match(data, /semiMajorAxisUnit/);
  assert.match(data, /radiusKm/);
  assert.match(scales, /Math\.log1p/);
  assert.match(scales, /mapHeliocentricDistance/);
  assert.match(scales, /mapSatelliteDistance/);
  assert.match(scales, /mapBodyRadius/);
  assert.match(kepler, /solveKeplerEquation/);
  assert.match(kepler, /writeOrbitalPosition/);
  assert.match(runtime, /Math\.min\(window\.devicePixelRatio/);
  assert.match(runtime, /requestAnimationFrame/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
