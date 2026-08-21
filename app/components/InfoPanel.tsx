import type {
  CelestialBodyData,
  DistanceScaleMode,
  SizeScaleMode,
} from "../solar/types";

export interface RenderedBodyMetrics {
  renderedDistance: number;
  renderedRadius: number;
}

interface InfoPanelProps {
  body: CelestialBodyData;
  moons: readonly CelestialBodyData[];
  metrics: RenderedBodyMetrics;
  distanceMode: DistanceScaleMode;
  sizeMode: SizeScaleMode;
  onClose: () => void;
}

const TYPE_LABELS: Record<CelestialBodyData["type"], string> = {
  star: "항성",
  planet: "행성",
  "dwarf-planet": "왜행성",
  moon: "위성",
};

const DISTANCE_LABELS: Record<DistanceScaleMode, string> = {
  log: "로그 스케일",
  linear: "선형 스케일",
  focus: "행성계 포커스 스케일",
};

const SIZE_LABELS: Record<SizeScaleMode, string> = {
  enhanced: "가시성 강화",
  relative: "상대 크기",
  uniform: "균일 마커",
};

const formatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });

function formatPeriod(days: number) {
  if (days >= 365.25) return `${formatter.format(days / 365.25)} 년`;
  if (days < 1) return `${formatter.format(days * 24)} 시간`;
  return `${formatter.format(days)} 일`;
}

function formatRotation(hours: number) {
  if (hours >= 48) return `${formatter.format(hours / 24)} 일`;
  return `${formatter.format(hours)} 시간`;
}

export default function InfoPanel({
  body,
  moons,
  metrics,
  distanceMode,
  sizeMode,
  onClose,
}: InfoPanelProps) {
  return (
    <details className="info-panel glass-panel" open>
      <summary>
        <span>{body.nameKo} · {body.nameEn}</span>
        <span className="summary-action">정보</span>
      </summary>
      <div className="info-panel__content">
        <div className="info-title-row">
          <div>
            <span className="type-chip">{TYPE_LABELS[body.type]}</span>
            <h2>{body.nameKo}</h2>
            <p className="english-name">{body.nameEn}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="정보 패널 닫고 전체 보기">×</button>
        </div>
        <p className="body-description">{body.descriptionKo}</p>

        <div className="data-block actual-data">
          <div className="data-block__heading">
            <span>실제 천문 데이터</span><small>ACTUAL</small>
          </div>
          <dl>
            <div><dt>실제 반지름</dt><dd>{formatter.format(body.radiusKm)} km</dd></div>
            {body.orbit ? (
              <>
                <div>
                  <dt>{body.type === "moon" ? "부모와의 평균 거리" : "태양과의 평균 거리"}</dt>
                  <dd>{formatter.format(body.orbit.semiMajorAxis)} {body.orbit.semiMajorAxisUnit}</dd>
                </div>
                <div><dt>공전 주기</dt><dd>{formatPeriod(body.orbit.orbitalPeriodDays)}</dd></div>
                <div><dt>이심률</dt><dd>{body.orbit.eccentricity.toFixed(4)}</dd></div>
                <div><dt>궤도 경사</dt><dd>{formatter.format(body.orbit.inclinationDeg)}°</dd></div>
              </>
            ) : null}
            <div><dt>자전 주기</dt><dd>{formatRotation(body.rotationPeriodHours)}</dd></div>
            {moons.length > 0 ? (
              <div className="moon-list-row"><dt>주요 위성</dt><dd>{moons.map((moon) => moon.nameKo).join(" · ")}</dd></div>
            ) : null}
          </dl>
        </div>

        <div className="data-block rendered-data">
          <div className="data-block__heading">
            <span>현재 화면 표현</span><small>RENDERED</small>
          </div>
          <dl>
            <div><dt>렌더 반지름</dt><dd>{metrics.renderedRadius.toFixed(2)} units</dd></div>
            <div><dt>렌더 궤도 거리</dt><dd>{metrics.renderedDistance.toFixed(2)} units</dd></div>
            <div><dt>거리 표현</dt><dd>{DISTANCE_LABELS[distanceMode]}</dd></div>
            <div><dt>크기 표현</dt><dd>{SIZE_LABELS[sizeMode]}</dd></div>
          </dl>
        </div>
      </div>
    </details>
  );
}
