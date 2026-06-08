import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
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
    <View style={ps.detail}>
      <View style={ps.detailHead}>
        <View style={[ps.dot, { backgroundColor: meter.color }]} />
        <Text style={ps.detailTitle}>{meter.label}</Text>
        <Text style={[ps.detailPct, { color: meter.color }]}>{pct}%</Text>
      </View>
      <Text style={ps.detailDesc}>{meter.description}</Text>
      {instances.map((inst, i) => (
        <View key={i} style={i > 0 ? ps.inst : undefined}>
          <Text style={ps.quote}>“{inst.quote}”</Text>
          {inst.why ? <Text style={ps.why}>{inst.why}</Text> : null}
        </View>
      ))}
      {!instances.length && (
        <Text style={ps.why}>No clear examples for this style in your messages.</Text>
      )}
    </View>
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
    <View style={ps.wrap}>
      <View style={ps.pieRow}>
        <Svg width={SIZE} height={SIZE}>
          <G>
            {slices.map((slice) => (
              <Path
                key={slice.key}
                d={describeSliceArc(CX, CY, R, slice.startAngle, slice.endAngle)}
                fill={slice.color}
                opacity={selected === slice.key ? 1 : 0.82}
                onPress={() => setSelected(slice.key)}
              />
            ))}
          </G>
        </Svg>
        <View style={ps.center}>
          <Text style={ps.centerPct}>{pct}%</Text>
          <Text style={ps.centerLbl} numberOfLines={2}>
            {meter?.label}
          </Text>
        </View>
      </View>
      <View style={ps.legend}>
        {activeMeters.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => setSelected(m.key)}
            style={[ps.chip, selected === m.key && { borderColor: m.color, backgroundColor: m.color + '22' }]}
          >
            <View style={[ps.chipDot, { backgroundColor: m.color }]} />
            <Text style={ps.chipTx}>{m.label}</Text>
            <Text style={[ps.chipPct, { color: m.color }]}>{styles[m.key]}%</Text>
          </Pressable>
        ))}
      </View>
      {meter && <StyleDetail meter={meter} note={styleNotes[selected]} pct={pct} />}
    </View>
  );
}

const ps = StyleSheet.create({
  wrap: { marginHorizontal: 24, marginBottom: 4 },
  pieRow: { alignSelf: 'center', width: SIZE, height: SIZE, marginBottom: 12 },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    paddingHorizontal: 36,
  },
  centerPct: { fontSize: 26, fontWeight: '700', color: '#f0e6d3' },
  centerLbl: { fontSize: 10, color: 'rgba(255,255,255,.45)', marginTop: 2, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.12)',
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipTx: { fontSize: 11, color: 'rgba(255,255,255,.7)' },
  chipPct: { fontSize: 11, fontWeight: '600' },
  detail: {
    backgroundColor: 'rgba(255,255,255,.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.08)',
    borderRadius: 14,
    padding: 13,
    marginBottom: 12,
  },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  detailTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: '#f0e6d3' },
  detailPct: { fontSize: 14, fontWeight: '700' },
  detailDesc: { fontSize: 11, lineHeight: 16, color: 'rgba(255,255,255,.4)', marginBottom: 10 },
  inst: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.08)' },
  quote: { fontSize: 12, color: '#f0e6d3', fontStyle: 'italic', lineHeight: 18 },
  why: { marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,.55)', lineHeight: 18 },
});
