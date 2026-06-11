const MICHAEL = /^michael$/i;

export const STUDY_TASKS = [
  {
    id: 'task1',
    title: 'Coach call with Michael',
    prompt:
      'Start a conversation about Michael with the coach, end the call, and view your insights.',
    checkSuccess(events) {
      const ended = events.some((e) => e.type === 'call_ended' && MICHAEL.test(e.personName || ''));
      const insights = events.some(
        (e) => e.type === 'insights_viewed' && MICHAEL.test(e.personName || '') && !e.fromHistory
      );
      return ended && insights;
    },
  },
  {
    id: 'task2',
    title: 'Add a new person',
    prompt: 'Create a new person to talk about with the coach.',
    checkSuccess(events) {
      return events.some((e) => e.type === 'person_added');
    },
  },
  {
    id: 'task3',
    title: 'Past Michael conversations',
    prompt:
      'View past conversations with Michael and open insights for a conversation you had.',
    checkSuccess(events) {
      return events.some(
        (e) => e.type === 'insights_viewed' && MICHAEL.test(e.personName || '') && e.fromHistory
      );
    },
  },
  {
    id: 'task4',
    title: 'Delete Michael conversation',
    prompt: 'Delete your conversation with Michael.',
    checkSuccess(events) {
      return events.some(
        (e) => e.type === 'conversation_deleted' && MICHAEL.test(e.personName || '')
      );
    },
  },
  {
    id: 'task5',
    title: 'Pause during a call',
    prompt: 'Open a conversation with the coach and use the pause button while speaking.',
    checkSuccess(events) {
      return events.some((e) => e.type === 'pause_used');
    },
  },
];

export const TASK_COUNT = STUDY_TASKS.length;
