import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { VisibilitySettings } from "../components/ControlPanel";
import type { RenderedBodyMetrics } from "../components/InfoPanel";
import { SCENE_DEFAULTS, SIMULATION_DEFAULTS } from "./config";
import { SOLAR_SYSTEM_BODIES } from "./data/solarSystemData";
import { createUnitOrbitPoints, writeOrbitalPosition } from "./math/kepler";
import {
  mapBodyRadius,
  mapHeliocentricDistance,
  mapSatelliteDistance,
} from "./math/scales";
import { SimulationClock } from "./SimulationClock";
import type {
  CelestialBodyData,
  DistanceScaleMode,
  SizeScaleMode,
} from "./types";

export interface HoveredBody {
  body: CelestialBodyData;
  x: number;
  y: number;
}

export interface RuntimeCallbacks {
  onSelection: (bodyId: string, distanceMode: DistanceScaleMode) => void;
  onHover: (hovered: HoveredBody | null) => void;
  onTime: (elapsedDays: number) => void;
  onPlayingChange: (playing: boolean) => void;
}

interface BodyRecord {
  data: CelestialBodyData;
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  hitMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  orbitLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null;
  ringMeshes: Array<THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>;
  label: HTMLDivElement;
  currentDistance: number;
  targetDistance: number;
  currentRadius: number;
  targetRadius: number;
  currentOpacity: number;
  targetOpacity: number;
  currentOrbitOpacity: number;
  targetOrbitOpacity: number;
}

interface CameraTween {
  startMs: number;
  durationMs: number;
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
}

const DEFAULT_VISIBILITY: VisibilitySettings = {
  orbits: true,
  labels: true,
  moons: true,
  stars: true,
};

const GLOBAL_RADIUS = 252;
const CAMERA_TWEEN_MS = 900;
const SCALE_EASING_SPEED = 6.5;

export class SolarSystemRuntime {
  private readonly container: HTMLElement;
  private readonly labelLayer: HTMLElement;
  private readonly callbacks: RuntimeCallbacks;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly clock: SimulationClock;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly bodyRecords = new Map<string, BodyRecord>();
  private readonly selectables: THREE.Object3D[] = [];
  private readonly textures = new Set<THREE.Texture>();
  private readonly starField: THREE.Points;
  private readonly sharedSphereGeometry = new THREE.SphereGeometry(1, 32, 22);
  private readonly sharedHitGeometry = new THREE.SphereGeometry(1, 12, 8);
  private readonly sharedHitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    colorWrite: false,
  });
  private readonly tempVector = new THREE.Vector3();
  private readonly tempVectorB = new THREE.Vector3();
  private readonly focusAnchor = new THREE.Vector3();
  private hasFocusAnchor = false;
  private animationFrame = 0;
  private previousFrameMs = performance.now();
  private lastUiTimeMs = 0;
  private lastHoverMs = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownMs = 0;
  private cameraTween: CameraTween | null = null;
  private selectedId = "sun";
  private focusedPlanetId: string | null = null;
  private distanceMode: DistanceScaleMode = "log";
  private previousGlobalDistanceMode: Exclude<DistanceScaleMode, "focus"> = "log";
  private sizeMode: SizeScaleMode = "enhanced";
  private visibility: VisibilitySettings = { ...DEFAULT_VISIBILITY };
  private disposed = false;

  constructor(
    container: HTMLElement,
    labelLayer: HTMLElement,
    callbacks: RuntimeCallbacks,
  ) {
    this.container = container;
    this.labelLayer = labelLayer;
    this.callbacks = callbacks;
    this.scene.background = new THREE.Color(0x01050d);
    this.scene.fog = new THREE.FogExp2(0x01050d, 0.00095);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.isMobile() ? 1.5 : SCENE_DEFAULTS.maxPixelRatio),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = "solar-canvas";
    this.renderer.domElement.setAttribute("aria-label", "드래그와 확대/축소로 탐색하는 3차원 태양계");
    this.renderer.domElement.setAttribute("role", "img");
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 1450;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener("start", this.handleControlsStart);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.clock = new SimulationClock({
      daysPerSecond: SIMULATION_DEFAULTS.daysPerSecond,
      running: !reducedMotion,
      maxFrameDeltaSeconds: SIMULATION_DEFAULTS.maxFrameDeltaSeconds,
    });

    this.addLights();
    this.starField = this.createStarField();
    this.scene.add(this.starField);
    this.buildBodies();
    this.refreshScaleTargets(true);
    this.refreshVisualTargets(true);
    this.updateBodies(0, 0);
    this.scene.updateMatrixWorld(true);

    window.addEventListener("resize", this.resize, { passive: true });
    this.resize();
    this.setGlobalCamera(false);

    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("dblclick", this.handleDoubleClick);
    this.renderer.domElement.addEventListener("contextmenu", this.handleContextMenu);
    window.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    this.callbacks.onPlayingChange(this.clock.isRunning);
    this.callbacks.onSelection("sun", "log");
    this.animate(performance.now());
  }

  getBodyMetrics(bodyId: string): RenderedBodyMetrics {
    const record = this.bodyRecords.get(bodyId);
    if (!record) return { renderedDistance: 0, renderedRadius: 0 };
    return {
      renderedDistance: record.targetDistance,
      renderedRadius: record.targetRadius,
    };
  }

  getDistanceMode(): DistanceScaleMode {
    return this.distanceMode;
  }

  setPlaying(playing: boolean): void {
    if (playing) this.clock.play();
    else this.clock.pause();
  }

  setDaysPerSecond(daysPerSecond: number): void {
    this.clock.setDaysPerSecond(daysPerSecond);
  }

  resetSimulation(): void {
    this.clock.reset(0);
    this.clock.setDaysPerSecond(SIMULATION_DEFAULTS.daysPerSecond);
    this.clock.play();
    this.callbacks.onTime(0);
    this.callbacks.onPlayingChange(true);
  }

  setDistanceMode(mode: DistanceScaleMode): void {
    if (mode === "focus") {
      if (!this.focusedPlanetId) {
        const selected = this.bodyRecords.get(this.selectedId)?.data;
        const parentId = selected?.type === "moon" ? selected.parentId : selected?.id;
        if (!parentId || parentId === "sun") return;
        this.focusedPlanetId = parentId;
      }
      this.distanceMode = "focus";
      this.refreshScaleTargets();
      this.refreshVisualTargets();
      this.tweenToFocusedSystem();
      this.callbacks.onSelection(this.selectedId, "focus");
      return;
    }

    this.previousGlobalDistanceMode = mode;
    this.distanceMode = mode;
    this.focusedPlanetId = null;
    this.selectedId = "sun";
    this.hasFocusAnchor = false;
    this.refreshScaleTargets();
    this.refreshVisualTargets();
    this.setGlobalCamera(true);
    this.callbacks.onSelection("sun", mode);
  }

  setSizeMode(mode: SizeScaleMode): void {
    this.sizeMode = mode;
    this.refreshScaleTargets();
  }

  setVisibility(visibility: VisibilitySettings): void {
    this.visibility = { ...visibility };
    this.starField.visible = visibility.stars;
    this.refreshVisualTargets();
  }

  focusBody(bodyId: string): void {
    const record = this.bodyRecords.get(bodyId);
    if (!record) return;
    if (record.data.type === "star") {
      this.showGlobalView();
      return;
    }

    this.selectedId = bodyId;
    this.focusedPlanetId = record.data.type === "moon"
      ? record.data.parentId ?? null
      : record.data.id;
    this.distanceMode = "focus";
    this.refreshScaleTargets();
    this.refreshVisualTargets();
    this.scene.updateMatrixWorld(true);
    this.tweenToFocusedSystem();
    this.callbacks.onSelection(bodyId, "focus");
  }

  showGlobalView(): void {
    this.selectedId = "sun";
    this.focusedPlanetId = null;
    this.distanceMode = this.previousGlobalDistanceMode;
    this.hasFocusAnchor = false;
    this.refreshScaleTargets();
    this.refreshVisualTargets();
    this.setGlobalCamera(true);
    this.callbacks.onSelection("sun", this.distanceMode);
  }

  resetCamera(): void {
    if (this.focusedPlanetId) this.tweenToFocusedSystem();
    else this.setGlobalCamera(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    this.controls.removeEventListener("start", this.handleControlsStart);
    this.controls.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("dblclick", this.handleDoubleClick);
    this.renderer.domElement.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach((material) => materials.add(material));
      }
      if (object instanceof THREE.Sprite) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.labelLayer.replaceChildren();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private addLights(): void {
    this.scene.add(new THREE.AmbientLight(0x7891b1, 0.16));
    const sunLight = new THREE.PointLight(0xffe2ad, 1650, 680, 1.25);
    sunLight.position.set(0, 0, 0);
    this.scene.add(sunLight);
  }

  private createStarField(): THREE.Points {
    const count = this.isMobile()
      ? SCENE_DEFAULTS.mobileStarCount
      : SCENE_DEFAULTS.desktopStarCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let index = 0; index < count; index += 1) {
      const radius = 470 + Math.random() * 590;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      color.setHSL(0.54 + Math.random() * 0.1, 0.3, 0.65 + Math.random() * 0.3);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: this.isMobile() ? 0.8 : 0.72,
      transparent: true,
      opacity: 0.82,
      sizeAttenuation: true,
    });
    return new THREE.Points(geometry, material);
  }

  private buildBodies(): void {
    const primaryBodies = SOLAR_SYSTEM_BODIES.filter((body) => body.type !== "moon");
    const moons = SOLAR_SYSTEM_BODIES.filter((body) => body.type === "moon");
    primaryBodies.forEach((body) => this.createBody(body, this.scene));
    moons.forEach((body) => {
      const parent = body.parentId ? this.bodyRecords.get(body.parentId) : undefined;
      if (parent) this.createBody(body, parent.group);
    });
  }

  private createBody(body: CelestialBodyData, parent: THREE.Object3D): void {
    const group = new THREE.Group();
    group.name = `system-${body.id}`;
    parent.add(group);

    const texture = body.type === "moon" ? null : this.createBodyTexture(body);
    const material = new THREE.MeshStandardMaterial({
      color: texture ? 0xffffff : body.display.base,
      map: texture,
      emissive: body.type === "star" ? new THREE.Color(body.display.dark) : new THREE.Color(0x000000),
      emissiveIntensity: body.type === "star" ? 2.75 : 0,
      roughness: body.type === "star" ? 0.58 : 0.86,
      metalness: 0,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(this.sharedSphereGeometry, material);
    mesh.name = body.id;
    mesh.userData.bodyId = body.id;
    mesh.rotation.z = THREE.MathUtils.degToRad(body.axialTiltDeg);
    group.add(mesh);

    const hitMesh = new THREE.Mesh(this.sharedHitGeometry, this.sharedHitMaterial);
    hitMesh.userData.bodyId = body.id;
    hitMesh.renderOrder = -1;
    group.add(hitMesh);
    this.selectables.push(mesh, hitMesh);

    let orbitLine: BodyRecord["orbitLine"] = null;
    if (body.orbit) {
      const positions = createUnitOrbitPoints(
        body.orbit,
        body.type === "moon" ? SCENE_DEFAULTS.moonOrbitSegments : SCENE_DEFAULTS.orbitSegments,
      );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const orbitMaterial = new THREE.LineBasicMaterial({
        color: body.display.orbit,
        transparent: true,
        opacity: body.type === "moon" ? 0.025 : 0.2,
        depthWrite: false,
      });
      orbitLine = new THREE.Line(geometry, orbitMaterial);
      orbitLine.name = `orbit-${body.id}`;
      if (body.type === "moon") parent.add(orbitLine);
      else this.scene.add(orbitLine);
    }

    const ringMeshes: BodyRecord["ringMeshes"] = [];
    if (body.id === "saturn" || body.id === "uranus") {
      const isSaturn = body.id === "saturn";
      const ringGeometry = new THREE.RingGeometry(
        isSaturn ? 1.35 : 1.58,
        isSaturn ? 2.3 : 1.92,
        112,
      );
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: isSaturn ? 0xd8c69c : 0x8fd9dd,
        transparent: true,
        opacity: isSaturn ? 0.68 : 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      mesh.add(ring);
      ringMeshes.push(ring);
    }

    if (body.type === "star") {
      const glowTexture = this.createGlowTexture();
      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffa43b,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.set(31, 31, 1);
      group.add(glow);
    }

    const label = this.createLabel(body);
    const initialRadius = mapBodyRadius(body, this.sizeMode);
    const record: BodyRecord = {
      data: body,
      group,
      mesh,
      hitMesh,
      orbitLine,
      ringMeshes,
      label,
      currentDistance: 0,
      targetDistance: 0,
      currentRadius: initialRadius,
      targetRadius: initialRadius,
      currentOpacity: body.type === "moon" ? 0.42 : 1,
      targetOpacity: body.type === "moon" ? 0.42 : 1,
      currentOrbitOpacity: body.type === "moon" ? 0.025 : 0.2,
      targetOrbitOpacity: body.type === "moon" ? 0.025 : 0.2,
    };
    this.bodyRecords.set(body.id, record);
  }

  private createLabel(body: CelestialBodyData): HTMLDivElement {
    const label = document.createElement("div");
    label.className = `body-label body-label--${body.type}`;
    label.dataset.bodyId = body.id;
    const korean = document.createElement("strong");
    korean.textContent = body.nameKo;
    const english = document.createElement("small");
    english.textContent = body.nameEn;
    label.append(korean, english);
    this.labelLayer.appendChild(label);
    return label;
  }

  private createBodyTexture(body: CelestialBodyData): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable");
    context.fillStyle = body.display.base;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const random = this.seededRandom(body.id);
    if (body.id === "jupiter" || body.id === "saturn" || body.id === "venus") {
      for (let y = 0; y < canvas.height; y += 8) {
        context.fillStyle = y % 24 === 0 ? body.display.light : body.display.dark;
        context.globalAlpha = body.id === "jupiter" ? 0.34 : 0.16;
        context.fillRect(0, y + random() * 3, canvas.width, 3 + random() * 4);
      }
      if (body.id === "jupiter") {
        context.globalAlpha = 0.58;
        context.fillStyle = "#a95438";
        context.beginPath();
        context.ellipse(184, 77, 21, 7, -0.08, 0, Math.PI * 2);
        context.fill();
      }
    } else if (body.id === "earth") {
      context.fillStyle = body.display.light;
      context.globalAlpha = 0.82;
      for (let index = 0; index < 17; index += 1) {
        context.beginPath();
        context.ellipse(
          random() * canvas.width,
          18 + random() * 92,
          5 + random() * 22,
          3 + random() * 11,
          random() * Math.PI,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      context.fillStyle = "#e8f5f5";
      context.globalAlpha = 0.55;
      context.fillRect(0, 0, canvas.width, 8);
      context.fillRect(0, canvas.height - 7, canvas.width, 7);
    } else {
      for (let index = 0; index < 72; index += 1) {
        context.fillStyle = random() > 0.5 ? body.display.light : body.display.dark;
        context.globalAlpha = 0.08 + random() * 0.18;
        context.beginPath();
        context.arc(random() * canvas.width, random() * canvas.height, 1 + random() * 7, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.add(texture);
    return texture;
  }

  private createGlowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable");
    const gradient = context.createRadialGradient(64, 64, 7, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,244,184,0.95)");
    gradient.addColorStop(0.22, "rgba(255,167,56,0.42)");
    gradient.addColorStop(1, "rgba(255,111,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    return texture;
  }

  private seededRandom(seedText: string): () => number {
    let state = 2166136261;
    for (let index = 0; index < seedText.length; index += 1) {
      state ^= seedText.charCodeAt(index);
      state = Math.imul(state, 16777619);
    }
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  private refreshScaleTargets(immediate = false): void {
    const focusDistanceAu = this.focusedPlanetId
      ? this.bodyRecords.get(this.focusedPlanetId)?.data.orbit?.semiMajorAxis
      : undefined;

    for (const record of this.bodyRecords.values()) {
      record.targetRadius = mapBodyRadius(record.data, this.sizeMode);
      if (record.data.orbit && record.data.type !== "moon") {
        record.targetDistance = mapHeliocentricDistance(
          record.data.orbit.semiMajorAxis,
          this.distanceMode,
          focusDistanceAu,
        );
      }
      if (!record.data.orbit) record.targetDistance = 0;
    }

    for (const parent of this.bodyRecords.values()) {
      const moons = SOLAR_SYSTEM_BODIES.filter(
        (body) => body.type === "moon" && body.parentId === parent.data.id && body.orbit,
      );
      if (moons.length === 0) continue;
      const distances = moons.map((moon) => moon.orbit?.semiMajorAxis ?? 0);
      const minimum = Math.min(...distances);
      const maximum = Math.max(...distances);
      const focused = this.distanceMode === "focus" && this.focusedPlanetId === parent.data.id;
      moons.forEach((moon) => {
        const moonRecord = this.bodyRecords.get(moon.id);
        if (!moonRecord || !moon.orbit) return;
        moonRecord.targetDistance = mapSatelliteDistance(
          moon.orbit.semiMajorAxis,
          minimum,
          maximum,
          parent.targetRadius,
          focused,
        );
      });
    }

    if (immediate) {
      this.bodyRecords.forEach((record) => {
        record.currentDistance = record.targetDistance;
        record.currentRadius = record.targetRadius;
      });
    }
  }

  private refreshVisualTargets(immediate = false): void {
    const focused = this.focusedPlanetId;
    for (const record of this.bodyRecords.values()) {
      const isMoon = record.data.type === "moon";
      const isFocusedSystem = focused !== null && (
        record.data.id === focused || record.data.parentId === focused
      );
      const isSelected = record.data.id === this.selectedId;

      if (focused) {
        record.targetOpacity = isFocusedSystem ? 1 : record.data.type === "star" ? 0.2 : 0.08;
        if (isMoon && !isFocusedSystem) record.targetOpacity = 0.03;
        record.targetOrbitOpacity = isSelected
          ? 0.9
          : isFocusedSystem
            ? isMoon ? 0.32 : 0.72
            : 0.018;
      } else {
        record.targetOpacity = isMoon ? 0.38 : 1;
        record.targetOrbitOpacity = isSelected && record.orbitLine
          ? 0.82
          : isMoon ? 0.018 : 0.2;
      }

      if (immediate) {
        record.currentOpacity = record.targetOpacity;
        record.currentOrbitOpacity = record.targetOrbitOpacity;
      }
      if (isMoon) record.group.visible = this.visibility.moons;
      if (record.orbitLine) {
        record.orbitLine.visible = this.visibility.orbits && (!isMoon || this.visibility.moons);
      }
      record.label.classList.toggle("is-selected", isSelected);
    }
  }

  private updateBodies(elapsedDays: number, deltaSeconds: number): void {
    const easing = deltaSeconds <= 0 ? 1 : 1 - Math.exp(-deltaSeconds * SCALE_EASING_SPEED);
    for (const record of this.bodyRecords.values()) {
      record.currentDistance += (record.targetDistance - record.currentDistance) * easing;
      record.currentRadius += (record.targetRadius - record.currentRadius) * easing;
      record.currentOpacity += (record.targetOpacity - record.currentOpacity) * easing;
      record.currentOrbitOpacity += (record.targetOrbitOpacity - record.currentOrbitOpacity) * easing;

      if (record.data.orbit) {
        writeOrbitalPosition(
          record.group.position,
          record.data.orbit,
          record.currentDistance,
          elapsedDays,
        );
      }
      record.mesh.scale.setScalar(record.currentRadius);
      record.hitMesh.scale.setScalar(
        Math.max(
          record.currentRadius * (record.data.type === "moon" ? 2.8 : 1.45),
          record.data.type === "moon" ? 0.62 : 1.1,
        ),
      );
      const direction = record.data.rotationState === "retrograde" ? -1 : 1;
      record.mesh.rotation.y = direction * (
        (elapsedDays * 24 / Math.max(record.data.rotationPeriodHours, 0.001)) * Math.PI * 2
      );
      record.mesh.material.opacity = record.currentOpacity;
      record.ringMeshes.forEach((ring) => {
        ring.material.opacity = (record.data.id === "saturn" ? 0.68 : 0.24) * record.currentOpacity;
      });
      record.group.children.forEach((child) => {
        if (child instanceof THREE.Sprite) child.material.opacity = 0.58 * record.currentOpacity;
      });
      if (record.orbitLine) {
        record.orbitLine.scale.setScalar(record.currentDistance);
        record.orbitLine.material.opacity = record.currentOrbitOpacity;
      }
    }
  }

  private updateLabels(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    for (const record of this.bodyRecords.values()) {
      const isMoon = record.data.type === "moon";
      const shouldShowMoon = isMoon &&
        this.visibility.moons &&
        this.focusedPlanetId === record.data.parentId;
      const shouldShow = this.visibility.labels && (!isMoon || shouldShowMoon);
      if (!shouldShow || record.currentOpacity < 0.12) {
        record.label.hidden = true;
        continue;
      }
      record.group.getWorldPosition(this.tempVector);
      this.tempVector.project(this.camera);
      if (
        this.tempVector.z < -1 ||
        this.tempVector.z > 1 ||
        Math.abs(this.tempVector.x) > 1.08 ||
        Math.abs(this.tempVector.y) > 1.08
      ) {
        record.label.hidden = true;
        continue;
      }
      record.label.hidden = false;
      const x = (this.tempVector.x * 0.5 + 0.5) * width;
      const y = (-this.tempVector.y * 0.5 + 0.5) * height;
      record.label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      record.label.style.opacity = String(Math.min(1, record.currentOpacity + 0.18));
    }
  }

  private animate = (nowMs: number): void => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const deltaSeconds = Math.min(Math.max((nowMs - this.previousFrameMs) / 1000, 0), 0.1);
    this.previousFrameMs = nowMs;
    const elapsedDays = this.clock.advance(deltaSeconds);
    this.updateBodies(elapsedDays, deltaSeconds);
    this.starField.rotation.y += deltaSeconds * 0.002;
    this.scene.updateMatrixWorld(true);
    this.updateFocusTracking();
    this.updateCameraTween(nowMs);
    this.controls.update();
    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
    if (nowMs - this.lastUiTimeMs > 240) {
      this.lastUiTimeMs = nowMs;
      this.callbacks.onTime(elapsedDays);
    }
  };

  private getFocusTarget(out: THREE.Vector3): THREE.Vector3 {
    const selected = this.bodyRecords.get(this.selectedId);
    const parent = this.focusedPlanetId ? this.bodyRecords.get(this.focusedPlanetId) : undefined;
    if (!parent) return out.set(0, 0, 0);
    parent.group.getWorldPosition(out);
    if (selected?.data.type === "moon") {
      selected.group.getWorldPosition(this.tempVectorB);
      out.lerp(this.tempVectorB, 0.5);
    }
    return out;
  }

  private updateFocusTracking(): void {
    if (!this.focusedPlanetId) return;
    this.getFocusTarget(this.tempVector);
    if (!this.hasFocusAnchor) {
      this.focusAnchor.copy(this.tempVector);
      this.hasFocusAnchor = true;
      return;
    }
    this.tempVectorB.copy(this.tempVector).sub(this.focusAnchor);
    if (this.tempVectorB.lengthSq() > 0) {
      if (this.cameraTween) {
        this.cameraTween.endPosition.add(this.tempVectorB);
        this.cameraTween.endTarget.add(this.tempVectorB);
      } else {
        this.camera.position.add(this.tempVectorB);
        this.controls.target.add(this.tempVectorB);
      }
      this.focusAnchor.copy(this.tempVector);
    }
  }

  private tweenToFocusedSystem(): void {
    if (!this.focusedPlanetId) return;
    this.scene.updateMatrixWorld(true);
    const target = this.getFocusTarget(new THREE.Vector3()).clone();
    const focusedRecord = this.bodyRecords.get(this.focusedPlanetId);
    const selectedRecord = this.bodyRecords.get(this.selectedId);
    const moonDistances = SOLAR_SYSTEM_BODIES
      .filter((body) => body.type === "moon" && body.parentId === this.focusedPlanetId)
      .map((body) => this.bodyRecords.get(body.id)?.targetDistance ?? 0);
    const moonSystemRadius = Math.max(0, ...moonDistances);
    let contentRadius = Math.max(6, focusedRecord?.targetRadius ?? 2, moonSystemRadius * 1.1);
    if (selectedRecord?.data.type === "moon") {
      selectedRecord.group.getWorldPosition(this.tempVectorB);
      contentRadius = Math.max(contentRadius * 0.5, target.distanceTo(this.tempVectorB) * 1.35);
    }
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = Math.max(16, contentRadius / Math.tan(verticalFov / 2) * 1.28);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    direction.y = Math.max(direction.y, 0.24);
    direction.normalize();
    const endPosition = target.clone().add(direction.multiplyScalar(distance));
    this.hasFocusAnchor = true;
    this.focusAnchor.copy(target);
    this.startCameraTween(endPosition, target);
  }

  private setGlobalCamera(animate: boolean): void {
    const endPosition = this.getGlobalCameraPosition();
    const target = new THREE.Vector3(0, 0, 0);
    if (animate) this.startCameraTween(endPosition, target);
    else {
      this.camera.position.copy(endPosition);
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  private getGlobalCameraPosition(): THREE.Vector3 {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const distance = Math.max(
      GLOBAL_RADIUS / Math.tan(verticalFov / 2),
      GLOBAL_RADIUS / Math.tan(horizontalFov / 2),
    ) * 1.06;
    return new THREE.Vector3(0.62, 0.48, 1).normalize().multiplyScalar(distance);
  }

  private startCameraTween(endPosition: THREE.Vector3, endTarget: THREE.Vector3): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.camera.position.copy(endPosition);
      this.controls.target.copy(endTarget);
      this.cameraTween = null;
      return;
    }
    this.cameraTween = {
      startMs: performance.now(),
      durationMs: CAMERA_TWEEN_MS,
      startPosition: this.camera.position.clone(),
      endPosition: endPosition.clone(),
      startTarget: this.controls.target.clone(),
      endTarget: endTarget.clone(),
    };
  }

  private updateCameraTween(nowMs: number): void {
    const tween = this.cameraTween;
    if (!tween) return;
    const raw = Math.min(1, Math.max(0, (nowMs - tween.startMs) / tween.durationMs));
    const eased = raw < 0.5
      ? 4 * raw * raw * raw
      : 1 - Math.pow(-2 * raw + 2, 3) / 2;
    this.camera.position.lerpVectors(tween.startPosition, tween.endPosition, eased);
    this.controls.target.lerpVectors(tween.startTarget, tween.endTarget, eased);
    if (raw >= 1) this.cameraTween = null;
  }

  private raycast(clientX: number, clientY: number): BodyRecord | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.selectables, false);
    for (const hit of hits) {
      const bodyId = hit.object.userData.bodyId as string | undefined;
      if (!bodyId) continue;
      const record = this.bodyRecords.get(bodyId);
      if (record && record.group.visible) return record;
    }
    return null;
  }

  private resize = (): void => {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (!this.focusedPlanetId && !this.cameraTween) {
      const required = this.getGlobalCameraPosition().length();
      const current = this.camera.position.distanceTo(this.controls.target);
      if (current < required) {
        this.tempVector.copy(this.camera.position).sub(this.controls.target).normalize();
        this.camera.position.copy(this.controls.target).addScaledVector(this.tempVector, required);
      }
    }
  };

  private handleControlsStart = (): void => {
    this.cameraTween = null;
  };

  private handlePointerDown = (event: PointerEvent): void => {
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerDownMs = performance.now();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const now = performance.now();
    if (now - this.lastHoverMs < 55) return;
    this.lastHoverMs = now;
    const record = this.raycast(event.clientX, event.clientY);
    this.container.style.cursor = record ? "pointer" : "grab";
    this.callbacks.onHover(record ? { body: record.data, x: event.clientX, y: event.clientY } : null);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const movement = Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY);
    const duration = performance.now() - this.pointerDownMs;
    if (movement > 7 || duration > 650) return;
    const record = this.raycast(event.clientX, event.clientY);
    if (record) this.focusBody(record.data.id);
  };

  private handlePointerLeave = (): void => {
    this.callbacks.onHover(null);
    this.container.style.cursor = "grab";
  };

  private handleDoubleClick = (event: MouseEvent): void => {
    if (!this.raycast(event.clientX, event.clientY)) this.showGlobalView();
  };

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, select, textarea, button")) return;
    if (event.key === "Escape") this.showGlobalView();
    if (event.key.toLowerCase() === "r") this.resetCamera();
    if (event.key === " ") {
      event.preventDefault();
      const playing = this.clock.toggle();
      this.callbacks.onPlayingChange(playing);
    }
  };

  private handleVisibilityChange = (): void => {
    this.previousFrameMs = performance.now();
  };

  private isMobile(): boolean {
    return window.matchMedia("(max-width: 720px)").matches;
  }
}

export { DEFAULT_VISIBILITY };
