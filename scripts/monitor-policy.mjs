/** Only alert on a transition or a failure that has remained unresolved. */
export function shouldSendAlert(state, healthy, nowMs, reminderHours) {
  const lastNotified = Date.parse(state.lastNotifiedAt || '') || 0;
  if (healthy) return state.status === 'failed';
  return state.status !== 'failed' || nowMs - lastNotified >= reminderHours * 3600000;
}
