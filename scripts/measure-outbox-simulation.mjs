// Deterministic model, not measurements of Cloudflare billing or real traffic.
const events = [
  { owner: 'operations', eligibleAt: 1, kind: 'event' },
  { owner: 'billing', eligibleAt: 61, kind: 'event' },
  { owner: 'clinical', eligibleAt: 301, kind: 'event' },
  { owner: 'billing', eligibleAt: 421, kind: 'expired_lease' },
];
function simulate(intervalSeconds) {
  const delivered = new Set();
  let rpc = 0,
    probes = 0,
    maxLatency = 0,
    maxRecovery = 0;
  for (let tick = intervalSeconds; tick <= 86400; tick += intervalSeconds) {
    probes++;
    const ready = events.filter(
      (event, index) => !delivered.has(index) && event.eligibleAt <= tick,
    );
    rpc += new Set(ready.map((event) => event.owner)).size;
    for (const event of ready) {
      const index = events.indexOf(event);
      delivered.add(index);
      const delay = tick - event.eligibleAt;
      maxLatency = Math.max(maxLatency, delay);
      if (event.kind === 'expired_lease')
        maxRecovery = Math.max(maxRecovery, delay);
    }
  }
  return {
    intervalSeconds,
    scheduledInvocations: probes,
    d1Probes: probes,
    rpc,
    maxLatencySeconds: maxLatency,
    maxRecoverySeconds: maxRecovery,
    delivered: delivered.size,
  };
}
console.log(
  JSON.stringify(
    {
      kind: 'synthetic_projection',
      events: events.length,
      scenarios: [simulate(60), simulate(300)],
    },
    null,
    2,
  ),
);
