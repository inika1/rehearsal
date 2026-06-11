import { useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStudy } from './StudyContext.js';
import { buildParticipantRows, buildSummaryRow, rowsToCsv } from './exportCsv.js';

function RatingScale({ label, value, onChange }) {
  return (
    <View style={styles.ratingBlock}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={styles.ratingRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            style={[styles.ratingBtn, value === n && styles.ratingBtnActive]}
          >
            <Text style={[styles.ratingBtnTx, value === n && styles.ratingBtnTxActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function RatingModal({ visible, onSubmit }) {
  const [confidence, setConfidence] = useState(null);
  const [overwhelm, setOverwhelm] = useState(null);

  const handleSubmit = () => {
    if (!confidence || !overwhelm) return;
    onSubmit(confidence, overwhelm);
    setConfidence(null);
    setOverwhelm(null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Quick check-in</Text>
          <Text style={styles.modalSub}>Rate your experience on this task (1 = low, 5 = high)</Text>
          <RatingScale
            label="I knew where to go"
            value={confidence}
            onChange={setConfidence}
          />
          <RatingScale
            label="This felt manageable"
            value={overwhelm}
            onChange={setOverwhelm}
          />
          <TouchableOpacity
            onPress={handleSubmit}
            style={[styles.primaryBtn, (!confidence || !overwhelm) && styles.primaryBtnDisabled]}
            disabled={!confidence || !overwhelm}
          >
            <Text style={styles.primaryBtnTx}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

async function shareCsv(filename, csv) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ message: csv, title: filename });
}

export default function StudyPanel() {
  const study = useStudy();
  const [draftId, setDraftId] = useState('');

  if (!study) return null;

  const {
    phase,
    participantId,
    taskIndex,
    activeTask,
    results,
    panelExpanded,
    ratingTaskIndex,
    setPanelExpanded,
    beginSession,
    startTask,
    markNeedHelp,
    markFinished,
    submitRatings,
    taskCount,
  } = study;

  const taskStarted = Boolean(results[taskIndex]?.startedAt && !results[taskIndex]?.completedAt);
  const completedCount = results.filter((r) => r.completedAt).length;
  const successRate = completedCount
    ? Math.round((results.filter((r) => r.success).length / completedCount) * 100)
    : 0;

  const exportResults = async () => {
    const rows = [
      ...buildParticipantRows(participantId, results),
      buildSummaryRow(participantId, results),
    ];
    const csv = rowsToCsv(rows);
    const filename = `study-${participantId}-${new Date().toISOString().slice(0, 10)}.csv`;
    await shareCsv(filename, csv);
  };

  if (phase === 'welcome') {
    return (
      <View style={styles.floatingWrap} pointerEvents="box-none">
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>User study</Text>
          <Text style={styles.panelSub}>
            Sign in below, enter a participant ID, then complete 5 tasks. Metrics are recorded automatically.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Participant ID (e.g. P001)"
            placeholderTextColor="rgba(0,0,0,.35)"
            value={draftId}
            onChangeText={setDraftId}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            onPress={() => beginSession(draftId)}
            style={[styles.primaryBtn, !draftId.trim() && styles.primaryBtnDisabled]}
            disabled={!draftId.trim()}
          >
            <Text style={styles.primaryBtnTx}>Begin session</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Use “Try sample login”. Michael should appear in your people list for several tasks.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <RatingModal
        visible={ratingTaskIndex != null}
        onSubmit={submitRatings}
      />

      <View style={styles.floatingWrap} pointerEvents="box-none">
        {!panelExpanded && (
          <TouchableOpacity onPress={() => setPanelExpanded(true)} style={styles.fab}>
            <Text style={styles.fabTx}>Study · {taskIndex + 1}/{taskCount}</Text>
          </TouchableOpacity>
        )}

        {panelExpanded && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>
                {phase === 'complete' ? 'Session complete' : `Task ${taskIndex + 1} of ${taskCount}`}
              </Text>
              {phase !== 'complete' && (
                <TouchableOpacity onPress={() => setPanelExpanded(false)} hitSlop={8}>
                  <Text style={styles.minimizeTx}>Minimize</Text>
                </TouchableOpacity>
              )}
            </View>

            {phase === 'complete' ? (
              <ScrollView style={styles.scroll} nestedScrollEnabled>
                <Text style={styles.completeMsg}>
                  All tasks recorded for {participantId}.
                </Text>
                <Text style={styles.statLine}>Success rate: {successRate}%</Text>
                {results.map((r) => (
                  <View key={r.taskId} style={styles.resultRow}>
                    <Text style={styles.resultTitle}>{r.taskTitle}</Text>
                    <Text style={styles.resultMeta}>
                      {r.success ? 'Success' : r.neededHelp ? 'Needed help' : 'Incomplete'}
                      {' · '}{r.timeToAccessSec ?? '—'}s · {r.clickCount} clicks · {r.backtrackCount} backtracks
                    </Text>
                  </View>
                ))}
                <TouchableOpacity onPress={exportResults} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnTx}>Export CSV</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <>
                <Text style={styles.taskTitle}>{activeTask?.title}</Text>
                <Text style={styles.taskPrompt}>{activeTask?.prompt}</Text>

                {!taskStarted ? (
                  <TouchableOpacity onPress={startTask} style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnTx}>Start this task</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <Text style={styles.liveHint}>Timer running — use the app below.</Text>
                    <View style={styles.actionRow}>
                      <TouchableOpacity onPress={markFinished} style={styles.secondaryBtn}>
                        <Text style={styles.secondaryBtnTx}>I finished</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={markNeedHelp} style={styles.helpBtn}>
                        <Text style={styles.helpBtnTx}>Need help</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <View style={styles.progressRow}>
                  {results.map((r, i) => (
                    <View
                      key={r.taskId}
                      style={[
                        styles.progressDot,
                        i === taskIndex && styles.progressDotActive,
                        r.completedAt && (r.success ? styles.progressDotSuccess : styles.progressDotFail),
                      ]}
                    />
                  ))}
                </View>
              </>
            )}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  floatingWrap: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 12 : 48,
    right: 12,
    left: 12,
    zIndex: 100,
    alignItems: 'flex-end',
  },
  fab: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  fabTx: { color: '#fff', fontWeight: '700', fontSize: 13 },
  panel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    maxHeight: 360,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  panelTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  panelSub: { fontSize: 13, color: 'rgba(0,0,0,.55)', lineHeight: 18, marginBottom: 12 },
  minimizeTx: { color: '#1e3a8a', fontSize: 13, fontWeight: '600' },
  taskTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  taskPrompt: { fontSize: 13, color: 'rgba(0,0,0,.65)', lineHeight: 19, marginBottom: 12 },
  liveHint: { fontSize: 12, color: '#1e3a8a', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  primaryBtn: {
    backgroundColor: '#1e3a8a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnTx: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1e3a8a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnTx: { color: '#1e3a8a', fontWeight: '700', fontSize: 13 },
  helpBtn: {
    flex: 1,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  helpBtnTx: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  hint: { fontSize: 12, color: 'rgba(0,0,0,.4)', marginTop: 12, lineHeight: 17 },
  progressRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,.08)',
  },
  progressDotActive: { backgroundColor: '#93c5fd' },
  progressDotSuccess: { backgroundColor: '#3ec46a' },
  progressDotFail: { backgroundColor: '#f87171' },
  scroll: { maxHeight: 260 },
  completeMsg: { fontSize: 14, color: '#111827', marginBottom: 8 },
  statLine: { fontSize: 13, fontWeight: '700', color: '#1e3a8a', marginBottom: 10 },
  resultRow: { marginBottom: 8 },
  resultTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  resultMeta: { fontSize: 12, color: 'rgba(0,0,0,.5)', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 4 },
  modalSub: { fontSize: 13, color: 'rgba(0,0,0,.55)', marginBottom: 16, lineHeight: 18 },
  ratingBlock: { marginBottom: 14 },
  ratingLabel: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 8 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.12)',
    alignItems: 'center',
  },
  ratingBtnActive: { backgroundColor: '#1e3a8a', borderColor: '#1e3a8a' },
  ratingBtnTx: { fontWeight: '700', color: '#374151' },
  ratingBtnTxActive: { color: '#fff' },
});
