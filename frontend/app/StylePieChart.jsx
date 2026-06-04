'use client';

import { useMemo, useState } from 'react';
import { buildStyleSlices, describeSliceArc } from './pieUtils.js';

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 6;

function StyleDetail({ meter, note, pct }) {
  return (
    <div className="pie-detail">
      <div className="pie-detail-head">
        <span className="dot" style={{ background: meter.color }} />
        <span className="pie-detail-title">{meter.label}</span>
        <span className="pie-detail-pct" style={{ color: meter.color }}>{pct}%</span>
      </div>
      <p className="style-desc">{meter.description}</p>
      {(note?.instances || []).map((inst, i) => (
        <div key={i} className={i > 0 ? 'style-instance' : 'style-instance-first'}>
          <div className="style-example">From your call: “{inst.quote}”</div>
          {inst.why && <div className="style-reason">{inst.why}</div>}
        </div>
      ))}
    </div>
  );
}

export function StylePieChart({ styles, styleNotes, meters }) {
  const slices = useMemo(() => buildStyleSlices(styles, meters), [styles, meters]);
  const [selected, setSelected] = useState(slices[0]?.key || meters[0]?.key);
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
              opacity={selected === slice.key ? 1 : 0.78}
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
        {meters.map((m) => (
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
