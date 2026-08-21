"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ControlPanel, {
  type VisibilitySettings,
} from "./ControlPanel";
import InfoPanel, { type RenderedBodyMetrics } from "./InfoPanel";
import {
  PRIMARY_BODIES,
  SOLAR_SYSTEM_BODIES,
  getCelestialBody,
  getMoonsFor,
} from "../solar/data/solarSystemData";
import {
  DEFAULT_VISIBILITY,
  SolarSystemRuntime,
  type HoveredBody,
} from "../solar/SolarSystemRuntime";
import type { DistanceScaleMode, SizeScaleMode } from "../solar/types";

const EPOCH_MS = Date.parse("2000-01-01T12:00:00.000Z");
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const numberFormatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

const TYPE_LABELS = {
  star: "항성",
  planet: "행성",
  "dwarf-planet": "왜행성",
  moon: "위성",
} as const;

export default function SolarSystemExperience() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SolarSystemRuntime | null>(null);
  const [selectedId, setSelectedId] = useState("sun");
  const [playing, setPlaying] = useState(true);
  const [daysPerSecond, setDaysPerSecond] = useState(100);
  const [elapsedDays, setElapsedDays] = useState(0);
  const [distanceMode, setDistanceMode] = useState<DistanceScaleMode>("log");
  const [sizeMode, setSizeMode] = useState<SizeScaleMode>("enhanced");
  const [visibility, setVisibility] = useState<VisibilitySettings>({ ...DEFAULT_VISIBILITY });
  const [hovered, setHovered] = useState<HoveredBody | null>(null);
  const [metrics, setMetrics] = useState<RenderedBodyMetrics>({
    renderedDistance: 0,
    renderedRadius: 8,
  });
  const [webGlError, setWebGlError] = useState(false);

  useEffect(() => {
    const scene = sceneRef.current;
    const labels = labelsRef.current;
    if (!scene || !labels) return;

    try {
      const runtime = new SolarSystemRuntime(scene, labels, {
        onSelection: (bodyId, activeDistanceMode) => {
          setSelectedId(bodyId);
          setDistanceMode(activeDistanceMode);
          requestAnimationFrame(() => {
            const activeRuntime = runtimeRef.current;
            if (activeRuntime) setMetrics(activeRuntime.getBodyMetrics(bodyId));
          });
        },
        onHover: setHovered,
        onTime: setElapsedDays,
        onPlayingChange: setPlaying,
      });
      runtimeRef.current = runtime;
      setMetrics(runtime.getBodyMetrics("sun"));
      return () => {
        runtime.dispose();
        runtimeRef.current = null;
      };
    } catch {
      setWebGlError(true);
    }
  }, []);

  const selectedBody = getCelestialBody(selectedId) ?? SOLAR_SYSTEM_BODIES[0];
  const selectedMoons = getMoonsFor(selectedBody.id);
  const focusAvailable = selectedBody.type !== "star";
  const currentDate = useMemo(() => {
    const timestamp = EPOCH_MS + elapsedDays * 86_400_000;
    return Number.isFinite(timestamp) ? dateFormatter.format(new Date(timestamp)) : "—";
  }, [elapsedDays]);

  const refreshMetrics = (bodyId = selectedId) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    requestAnimationFrame(() => setMetrics(runtime.getBodyMetrics(bodyId)));
  };

  const selectBody = (bodyId: string) => {
    runtimeRef.current?.focusBody(bodyId);
    refreshMetrics(bodyId);
  };

  const changePlaying = (nextPlaying: boolean) => {
    setPlaying(nextPlaying);
    runtimeRef.current?.setPlaying(nextPlaying);
  };

  const changeDaysPerSecond = (nextValue: number) => {
    setDaysPerSecond(nextValue);
    runtimeRef.current?.setDaysPerSecond(nextValue);
  };

  const changeDistanceMode = (nextMode: DistanceScaleMode) => {
    runtimeRef.current?.setDistanceMode(nextMode);
    setDistanceMode(runtimeRef.current?.getDistanceMode() ?? nextMode);
    refreshMetrics(nextMode === "focus" ? selectedId : "sun");
  };

  const changeSizeMode = (nextMode: SizeScaleMode) => {
    setSizeMode(nextMode);
    runtimeRef.current?.setSizeMode(nextMode);
    refreshMetrics();
  };

  const changeVisibility = (nextVisibility: VisibilitySettings) => {
    setVisibility(nextVisibility);
    runtimeRef.current?.setVisibility(nextVisibility);
  };

  const showGlobal = () => {
    runtimeRef.current?.showGlobalView();
    refreshMetrics("sun");
  };

  const resetSimulation = () => {
    setElapsedDays(0);
    setDaysPerSecond(100);
    setPlaying(true);
    runtimeRef.current?.resetSimulation();
  };

  const tooltipStyle = hovered
    ? {
        left: Math.max(12, Math.min(hovered.x + 16, window.innerWidth - 164)),
        top: Math.max(12, Math.min(hovered.y + 16, window.innerHeight - 82)),
      }
    : undefined;

  return (
    <main className="solar-experience">
      <div ref={sceneRef} className="scene-mount" aria-hidden={webGlError} />
      <div ref={labelsRef} className="label-layer" aria-hidden="true" />
      <div className="scene-vignette" aria-hidden="true" />

      {webGlError ? (
        <div className="webgl-fallback" role="alert">
          <span>3D 렌더링을 시작할 수 없습니다.</span>
          <p>WebGL을 지원하는 최신 브라우저에서 다시 열어 주세요.</p>
        </div>
      ) : null}

      <header className="experience-header">
        <p className="eyebrow"><span /> NASA / JPL DATA MODEL</p>
        <h1>Logarithmic<br /><em>Solar System</em></h1>
        <p className="header-copy">실제 천문 데이터를 로그 스케일로 압축해 태양부터 명왕성까지 한눈에 탐험합니다.</p>
      </header>

      <section className="time-readout" aria-label="현재 시뮬레이션 시간">
        <span className={playing ? "pulse-dot" : "pulse-dot is-paused"} aria-hidden="true" />
        <div><small>SIMULATION DATE</small><strong>{currentDate}</strong></div>
        <div><small>ELAPSED</small><strong>+{numberFormatter.format(elapsedDays)}일</strong></div>
        <div><small>RATE</small><strong>{numberFormatter.format(daysPerSecond)} d/s</strong></div>
      </section>

      <ControlPanel
        bodies={SOLAR_SYSTEM_BODIES}
        selectedId={selectedId}
        playing={playing}
        daysPerSecond={daysPerSecond}
        distanceMode={distanceMode}
        sizeMode={sizeMode}
        visibility={visibility}
        focusAvailable={focusAvailable}
        onSelectBody={selectBody}
        onPlayingChange={changePlaying}
        onDaysPerSecondChange={changeDaysPerSecond}
        onDistanceModeChange={changeDistanceMode}
        onSizeModeChange={changeSizeMode}
        onVisibilityChange={changeVisibility}
        onGlobalView={showGlobal}
        onResetSimulation={resetSimulation}
        onResetCamera={() => runtimeRef.current?.resetCamera()}
      />

      <InfoPanel
        body={selectedBody}
        moons={selectedMoons}
        metrics={metrics}
        distanceMode={distanceMode}
        sizeMode={sizeMode}
        onClose={showGlobal}
      />

      <nav className="planet-rail" aria-label="행성 빠른 탐색">
        <button
          type="button"
          className={selectedId === "sun" ? "is-active sun-rail-button" : "sun-rail-button"}
          onClick={showGlobal}
        >
          <span className="rail-orb" style={{ "--orb-color": "#ffb21f" } as React.CSSProperties} />
          <span>태양<small>Sun</small></span>
        </button>
        {PRIMARY_BODIES.filter((body) => body.id !== "sun").map((body, index) => (
          <button
            key={body.id}
            type="button"
            className={selectedId === body.id || selectedBody.parentId === body.id ? "is-active" : ""}
            onClick={() => selectBody(body.id)}
          >
            <i>{String(index + 1).padStart(2, "0")}</i>
            <span className="rail-orb" style={{ "--orb-color": body.display.base } as React.CSSProperties} />
            <span>{body.nameKo}<small>{body.nameEn}</small></span>
          </button>
        ))}
      </nav>

      <aside className="scale-disclaimer">
        <span aria-hidden="true">i</span>
        <p><strong>축척 안내</strong> 실제 천문 데이터를 사용하지만, 궤도 거리는 압축되고 천체 크기는 가시성을 위해 확대됩니다. 두 표현은 하나의 물리 축척을 공유하지 않습니다.</p>
      </aside>

      <div className="gesture-guide" aria-hidden="true">
        <span>좌 드래그 <b>회전</b></span><span>스크롤 <b>확대</b></span><span>우 드래그 <b>이동</b></span>
      </div>

      {hovered ? (
        <div className="body-tooltip" role="tooltip" style={tooltipStyle}>
          <strong>{hovered.body.nameKo}</strong>
          <span>{hovered.body.nameEn} · {TYPE_LABELS[hovered.body.type]}</span>
        </div>
      ) : null}
    </main>
  );
}
