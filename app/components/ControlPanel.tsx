"use client";

import type {
  CelestialBodyData,
  DistanceScaleMode,
  SizeScaleMode,
} from "../solar/types";

export interface VisibilitySettings {
  orbits: boolean;
  labels: boolean;
  moons: boolean;
  stars: boolean;
}

interface ControlPanelProps {
  bodies: readonly CelestialBodyData[];
  selectedId: string;
  playing: boolean;
  daysPerSecond: number;
  distanceMode: DistanceScaleMode;
  sizeMode: SizeScaleMode;
  visibility: VisibilitySettings;
  focusAvailable: boolean;
  onSelectBody: (id: string) => void;
  onPlayingChange: (playing: boolean) => void;
  onDaysPerSecondChange: (value: number) => void;
  onDistanceModeChange: (mode: DistanceScaleMode) => void;
  onSizeModeChange: (mode: SizeScaleMode) => void;
  onVisibilityChange: (next: VisibilitySettings) => void;
  onGlobalView: () => void;
  onResetSimulation: () => void;
  onResetCamera: () => void;
}

const DISTANCE_OPTIONS: ReadonlyArray<{ value: DistanceScaleMode; label: string }> = [
  { value: "log", label: "로그" },
  { value: "linear", label: "선형" },
  { value: "focus", label: "포커스" },
];

const SIZE_OPTIONS: ReadonlyArray<{ value: SizeScaleMode; label: string }> = [
  { value: "enhanced", label: "가시성 강화" },
  { value: "relative", label: "상대 크기" },
  { value: "uniform", label: "균일 마커" },
];

const SPEED_OPTIONS = [
  { value: 1, label: "1일 / 초" },
  { value: 10, label: "10일 / 초" },
  { value: 100, label: "100일 / 초" },
  { value: 365.256, label: "1년 / 초" },
] as const;

export default function ControlPanel({
  bodies,
  selectedId,
  playing,
  daysPerSecond,
  distanceMode,
  sizeMode,
  visibility,
  focusAvailable,
  onSelectBody,
  onPlayingChange,
  onDaysPerSecondChange,
  onDistanceModeChange,
  onSizeModeChange,
  onVisibilityChange,
  onGlobalView,
  onResetSimulation,
  onResetCamera,
}: ControlPanelProps) {
  const selectableBodies = bodies.filter((body) => body.type !== "moon");

  const toggle = (key: keyof VisibilitySettings) => {
    onVisibilityChange({ ...visibility, [key]: !visibility[key] });
  };

  return (
    <details className="control-panel glass-panel" open>
      <summary>
        <span>탐색 및 시뮬레이션</span>
        <span className="summary-action">제어</span>
      </summary>
      <div className="control-panel__content">
        <div className="panel-kicker">
          <span>CONTROL DECK</span>
          <span className={playing ? "status-live" : "status-paused"}>
            {playing ? "RUNNING" : "PAUSED"}
          </span>
        </div>

        <button className="wide-action" type="button" onClick={onGlobalView}>
          <span>태양계 전체 보기</span>
          <span aria-hidden="true">↗</span>
        </button>

        <label className="field-label" htmlFor="body-select">천체 바로가기</label>
        <select
          id="body-select"
          className="control-select"
          value={selectedId}
          onChange={(event) => onSelectBody(event.target.value)}
        >
          {selectableBodies.map((body) => (
            <option key={body.id} value={body.id}>
              {body.nameKo} · {body.nameEn}
            </option>
          ))}
        </select>

        <div className="control-section">
          <div className="section-label"><span>시간</span><span>TIME</span></div>
          <div className="transport-row">
            <button
              type="button"
              className="transport-button"
              onClick={() => onPlayingChange(!playing)}
              aria-label={playing ? "시뮬레이션 일시정지" : "시뮬레이션 재생"}
            >
              <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
              {playing ? "일시정지" : "재생"}
            </button>
            <button type="button" className="icon-button" onClick={onResetSimulation} aria-label="시뮬레이션 시간 재설정">↺</button>
            <select
              className="speed-select"
              aria-label="시뮬레이션 시간 배속"
              value={String(daysPerSecond)}
              onChange={(event) => onDaysPerSecondChange(Number(event.target.value))}
            >
              {SPEED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="control-section">
          <div className="section-label"><span>거리 표현</span><span>DISTANCE</span></div>
          <div className="segmented-control" role="group" aria-label="거리 표현 스케일">
            {DISTANCE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={distanceMode === option.value ? "is-active" : ""}
                aria-pressed={distanceMode === option.value}
                disabled={option.value === "focus" && !focusAvailable}
                onClick={() => onDistanceModeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-section two-column-fields">
          <label>
            <span className="field-label">천체 크기</span>
            <select
              className="control-select"
              value={sizeMode}
              onChange={(event) => onSizeModeChange(event.target.value as SizeScaleMode)}
            >
              {SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div>
            <span className="field-label">카메라</span>
            <button type="button" className="camera-reset" onClick={onResetCamera}>시점 재설정</button>
          </div>
        </div>

        <div className="control-section">
          <div className="section-label"><span>화면 요소</span><span>LAYERS</span></div>
          <div className="toggle-grid">
            {(
              [
                ["orbits", "궤도", "◎"],
                ["labels", "라벨", "Aa"],
                ["moons", "위성", "●"],
                ["stars", "별", "✦"],
              ] as const
            ).map(([key, label, glyph]) => (
              <button
                key={key}
                type="button"
                className={visibility[key] ? "is-on" : ""}
                aria-pressed={visibility[key]}
                onClick={() => toggle(key)}
              >
                <span aria-hidden="true">{glyph}</span>{label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
