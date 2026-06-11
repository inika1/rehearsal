function escapeCell(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const HEADERS = [
  'participant_id',
  'task_id',
  'task_title',
  'success',
  'needed_help',
  'time_to_access_sec',
  'click_count',
  'backtrack_count',
  'confidence_rating',
  'overwhelm_rating',
  'started_at',
  'completed_at',
];

export function rowsToCsv(rows) {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(HEADERS.map((key) => escapeCell(row[key])).join(','));
  }
  return lines.join('\n');
}

export function buildParticipantRows(participantId, results) {
  return results.map((r) => ({
    participant_id: participantId,
    task_id: r.taskId,
    task_title: r.taskTitle,
    success: r.success ? 1 : 0,
    needed_help: r.neededHelp ? 1 : 0,
    time_to_access_sec: r.timeToAccessSec ?? '',
    click_count: r.clickCount ?? 0,
    backtrack_count: r.backtrackCount ?? 0,
    confidence_rating: r.confidence ?? '',
    overwhelm_rating: r.overwhelm ?? '',
    started_at: r.startedAt ?? '',
    completed_at: r.completedAt ?? '',
  }));
}

export function buildSummaryRow(participantId, results) {
  const completed = results.filter((r) => r.completedAt);
  const successes = completed.filter((r) => r.success);
  return {
    participant_id: participantId,
    task_id: '_summary',
    task_title: 'Session summary',
    success: completed.length ? Math.round((successes.length / completed.length) * 100) : 0,
    needed_help: completed.filter((r) => r.neededHelp).length,
    time_to_access_sec: completed.length
      ? Math.round(
          completed.reduce((sum, r) => sum + (r.timeToAccessSec || 0), 0) / completed.length
        )
      : '',
    click_count: completed.reduce((sum, r) => sum + (r.clickCount || 0), 0),
    backtrack_count: completed.reduce((sum, r) => sum + (r.backtrackCount || 0), 0),
    confidence_rating: completed.length
      ? (completed.reduce((sum, r) => sum + (r.confidence || 0), 0) / completed.length).toFixed(1)
      : '',
    overwhelm_rating: completed.length
      ? (completed.reduce((sum, r) => sum + (r.overwhelm || 0), 0) / completed.length).toFixed(1)
      : '',
    started_at: completed[0]?.startedAt ?? '',
    completed_at: completed[completed.length - 1]?.completedAt ?? '',
  };
}
