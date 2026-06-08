'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildStyleSlices, describeSliceArc } from './pieUtils.js';

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 6;

function dominantStyleKey(styles, meters) {
  let best = meters[0]?.key;
  let bestVal = -1;
  for (const m of meters) {
    const v = styles[m.key] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = m.key;
    }
  }
  return best;
}

function StyleDetail({ meter, note, pct }) {
  const instances = note?.instances || [];
  return (
    <div className="pie-detail">
      <div className="pie-detail-head">
        <span className="dot" style={{ background: meter.color }} />
        <span className="pie-detail-title">{meter.label}</span>
        <span className="pie-detail-pct" style={{ color: meter.color }}>{pct}%</span>
      </div>
      <p className="style-desc">{meter.description}</p>
      {instances.map((inst, i) => (
        <div key={i} className={i > 0 ? 'style-instance' : 'style-instance-first'}>
          <div className="style-example">“{inst.quote}”</div>
          {inst.why && <div className="style-reason">{inst.why}</div>}
        </div>
      ))}
      {!instances.length && (
        <div className="style-reason">No clear examples for this style in your messages.</div>
      )}
    </div>
  );
}

export function StylePieChart({ styles, styleNotes, meters }) {
  const slices = useMemo(() => buildStyleSlices(styles, meters), [styles, meters]);
  const defaultKey = useMemo(() => dominantStyleKey(styles, meters), [styles, meters]);
  const [selected, setSelected] = useState(defaultKey);
  const activeMeters = useMemo(
    () => meters.filter((m) => (styles[m.key] ?? 0) > 0),
    [meters, styles]
  );

  useEffect(() => {
    setSelected(defaultKey);
  }, [defaultKey]);

  const meter = meters.find((m) => m.key === selected) || meters[0];
  const pct = styles[selected] ?? 0;

  return (
    <div className="pie-wrap">
      <div className="pie-chart-row">
        <svg width={SIZE} height={SIZE} className="style-pie-svg">
          {slices.map((slice) => (
            <path
              key={slice.key}
              d={describeSliceArc(CX, CY, R, slice.startAngle, slice.endAngle)}
              fill={slice.color}
              opacity={selected === slice.key ? 1 : 0.82}
              className="pie-slice"
              onClick={() => setSelected(slice.key)}
            />
          ))}
        </svg>
        <div className="pie-center">
          <div className="pie-center-pct">{pct}%</div>
          <div className="pie-center-lbl">{meter?.label}</div>
        </div>
      </div>
      <div className="pie-legend">
        {activeMeters.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`pie-chip${selected === m.key ? ' active' : ''}`}
            style={selected === m.key ? { borderColor: m.color, background: `${m.color}22` } : undefined}
            onClick={() => setSelected(m.key)}
          >
            <span className="pie-chip-dot" style={{ background: m.color }} />
            <span>{m.label}</span>
            <span style={{ color: m.color, fontWeight: 600 }}>{styles[m.key]}%</span>
          </button>
        ))}
      </div>
      {meter && <StyleDetail meter={meter} note={styleNotes[selected]} pct={pct} />}
    </div>
  );
}
