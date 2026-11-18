// LiveTwin browser backend: answers the dashboard's /api/* calls from real NASA C-MAPSS FD001 data
// (window.LT_DATA, built by build_livetwin_data.py). Same response contract as src/08_dashboard/api_server.py.
(function () {
  const D = window.LT_DATA, CAP = D.cap, T0 = Date.now();
  const ids = Array.from({ length: 20 }, (_, i) => i + 1);
  const START_BACK = 25, TICK_MS = 3000;            // replay the last 25 cycles live, 1 cycle per 3 s
  const iso = (ms) => new Date(ms).toISOString();
  const status = (s) => s == null ? 'unknown' : s >= 80 ? 'healthy' : s >= 50 ? 'degrading' : s >= 20 ? 'critical' : 'failure_imminent';
  const cursor = (e) => {
    const n = e.cycles.length, start = Math.max(0, n - 1 - START_BACK);
    return Math.min(n - 1, start + Math.floor((Date.now() - T0) / TICK_MS));
  };
  const snap = (id) => {
    const e = D.fleet[id], i = cursor(e), rul = e.rul_pred[i];
    const health = Math.round(Math.max(0, Math.min(100, (rul / CAP) * 100)) * 10) / 10;
    const lo = Math.max(0, i - 49), win = e.anomaly.slice(Math.max(0, i - 23), i + 1);
    return { e, i, rul, health, lo, anomalies: win.filter((a) => a > 1).length };
  };
  const SENS = D.sensor_ids;
  const cost = (h) => h < 20 ? 48000 : h < 50 ? 18500 : 6500;
  const urgency = (h) => h < 20 ? 'CRITICAL' : h < 50 ? 'URGENT' : 'ROUTINE';

  // seed orders for engines already in trouble when the page opens
  const orders = [], decisions = [], branches = [];
  let oid = 1000, did = 1;
  function addOrder(id, by) {
    const s = snap(id), now = Date.now();
    const o = {
      id: ++oid, asset_id: id, failure_mode: 'HPC degradation', urgency: urgency(s.health), status: 'pending',
      estimated_cost: cost(s.health), maintenance_action: s.health < 20 ? 'Pull engine, HPC module inspection and blade replacement' : 'Borescope HPC stages, schedule wash',
      rul_at_detection: Math.round(s.rul), rul_lower_bound: Math.max(0, Math.round(s.rul - 22)), rul_upper_bound: Math.round(s.rul + 22),
      failure_confidence: Math.round((0.6 + 0.4 * (1 - s.health / 100)) * 100) / 100,
      window_start: iso(now + Math.max(1, s.rul * 0.5) * 3.6e6), window_end: iso(now + Math.max(2, s.rul * 0.8) * 3.6e6),
      guardian_approved: true, guardian_reason: 'Cost within supervisor limit, RUL band supports action',
      approved_by_user: by, branch_id: 'lt-br-' + id + '-' + (now % 100000), created_at: iso(now), updated_at: iso(now),
      similar_incident_id: 'INC-FD001-' + (60 + id), similar_incident_similarity: 0.87,
    };
    orders.unshift(o);
    return o;
  }
  function log(agent, id, action, extra) {
    const d = Object.assign({ id: did++, agent_name: agent, asset_id: id, timestamp: iso(Date.now()), output_action: action,
      guardian_verdict: null, latency_ms: 40 + Math.round(Math.random() * 400), triggered_by_user: 'plant_a_supervisor@livetwin.com' }, extra || {});
    decisions.unshift(d);
    if (d.branch_id) branches.unshift(d);
  }
  ids.forEach((id) => {
    const s = snap(id);
    if (s.health < 50 && id !== 15) {
      const o = addOrder(id, 'auto');
      log('monitor_agent', id, `Health ${s.health} below 50, escalated`);
      log('diagnosis_agent', id, 'HPC degradation signature: T30 and phi drift, matches INC-FD001');
      log('plan_agent', id, `${o.urgency} order, est. cost $${o.estimated_cost}`);
      log('guardian_agent', id, 'APPROVED', { guardian_verdict: 'APPROVED', guardian_reason: o.guardian_reason, branch_id: o.branch_id });
    }
  });

  let inflight = [];
  function runChain(id) {
    const steps = [['monitor', 'monitor_agent', `Engine ${id}: anomaly burst, health dropping fast`],
      ['diagnosis', 'diagnosis_agent', 'Vector search: nearest incident INC-FD001-75 (0.91), HPC degradation'],
      ['plan', 'plan_agent', 'Plan: pull engine before RUL lower bound, window in 2 shifts'],
      ['guardian', 'guardian_agent', 'APPROVED']];
    steps.forEach(([stage, agent, msg], k) => {
      setTimeout(() => { inflight = [{ asset_id: id, stage, started_at: iso(Date.now()) }]; }, k * 2200);
      setTimeout(() => {
        if (agent === 'guardian_agent') {
          const o = addOrder(id, 'plant_a_supervisor@livetwin.com');
          log(agent, id, 'APPROVED', { guardian_verdict: 'APPROVED', guardian_reason: 'Branch tested: cost and window within policy', branch_id: o.branch_id });
          inflight = [];
        } else log(agent, id, msg);
      }, k * 2200 + 2000);
    });
  }

  const routes = {
    'GET /api/fleet': () => {
      const engines = ids.map((id) => {
        const s = snap(id), o = orders.find((x) => x.asset_id === id);
        return { asset_id: id, name: `Engine-${String(id).padStart(2, '0')}`, plant: id <= 10 ? 'A' : 'B',
          health_score: s.health, health_status: status(s.health), anomaly_count_24h: s.anomalies,
          rul_hours: o ? o.rul_at_detection : Math.round(s.rul), failure_mode: o ? o.failure_mode : null,
          in_flight_stage: (inflight.find((f) => f.asset_id === id) || {}).stage || null, last_seen_ts: iso(Date.now()) };
      });
      const sc = engines.map((e) => e.health_score);
      return { engines, timestamp: iso(Date.now()), kpis: {
        engines_online: engines.filter((e) => ['healthy', 'degrading'].includes(e.health_status)).length,
        active_alerts: engines.filter((e) => ['critical', 'failure_imminent'].includes(e.health_status)).length,
        pending_orders: orders.filter((o) => o.status === 'pending').length,
        avg_health: Math.round((sc.reduce((a, b) => a + b, 0) / sc.length) * 10) / 10, agents_in_flight: inflight.length } };
    },
    'GET /api/engine': (id) => {
      const s = snap(id), e = s.e, o = orders.find((x) => x.asset_id === id) || {};
      const rows = [];
      for (let k = s.i; k >= s.lo; k--) {
        const sensors = {}; SENS.forEach((sid, j) => (sensors['s' + sid] = e.sensors[k][j]));
        rows.push({ cycle: e.cycles[k], sensors, op_settings: { op1: e.ops[k][0], op2: e.ops[k][1], op3: e.ops[k][2] },
          anomaly_score: e.anomaly[k], anomaly_flag: e.anomaly[k] > 1, timestamp: iso(Date.now() - (s.i - k) * TICK_MS) });
      }
      const hist = []; for (let k = s.lo; k <= s.i; k++) hist.push(Math.round(Math.max(0, Math.min(100, e.rul_pred[k] / CAP * 100)) * 10) / 10);
      const engine = { asset_id: id, name: `Engine-${String(id).padStart(2, '0')}`, plant: id <= 10 ? 'A' : 'B',
        health_score: s.health, health_status: status(s.health), anomaly_count_24h: s.anomalies, current_cycle: e.cycles[s.i],
        last_seen: iso(Date.now()), health_history: hist };
      return { engine, sensor_readings: rows, health_history: hist,
        predictions: { rul_hours: Math.round(s.rul), rul_lower: Math.max(0, Math.round(s.rul - D.model_rmse_cycles)), rul_upper: Math.round(s.rul + D.model_rmse_cycles),
          failure_mode: s.health < 80 ? 'HPC degradation' : null, failure_confidence: o.failure_confidence || null, urgency: o.urgency || null },
        similar_incidents: o.similar_incident_id ? [{ incident_id: o.similar_incident_id, failure_mode: 'HPC degradation', similarity_score: o.similar_incident_similarity, cost: o.estimated_cost, resolution: 'HPC module overhaul' }] : [],
        latest_order: o };
    },
    'GET /api/agents/status': () => {
      const AG = [['monitor_agent', 'monitor'], ['diagnosis_agent', 'diagnosis'], ['plan_agent', 'plan'], ['guardian_agent', 'guardian']];
      return { inflight, decisions: decisions.slice(0, 20), agents: AG.map(([n, st]) => {
        const inf = inflight.find((f) => f.stage === st), last = decisions.find((d) => d.agent_name === n) || {};
        return { agent_name: n, status: inf ? 'running' : last.guardian_verdict === 'BLOCKED' ? 'blocked' : last.id ? 'complete' : 'idle',
          last_output: last.guardian_verdict ? `${last.guardian_verdict}: ${last.guardian_reason || ''}` : (last.output_action || '—'),
          last_run: last.timestamp || null, asset_id: inf ? inf.asset_id : last.asset_id, latency_ms: last.latency_ms, branch_id: n === 'guardian_agent' ? last.branch_id || null : null };
      }) };
    },
    'GET /api/orders': () => {
      const pend = orders.filter((o) => o.status === 'pending'), total = orders.reduce((a, o) => a + o.estimated_cost, 0);
      return { orders, summary: { total_this_month: orders.length, total_cost: total, estimated_savings: total * 2,
        critical_pending: pend.filter((o) => o.urgency === 'CRITICAL').length, urgent_pending: pend.filter((o) => o.urgency === 'URGENT').length } };
    },
    'GET /api/governance': () => ({
      obo_context: { user_id: 'plant_a_supervisor@livetwin.com', groups: ['plant_a_operators', 'maintenance_supervisors'], plant: 'A', role: 'supervisor' },
      visible_engines: ids.slice(0, 10), cost_limits: { operator: 10000, supervisor: 50000, admin: null },
      branch_log: branches.map((r) => ({ branch_id: r.branch_id, asset_id: r.asset_id, action: 'CREATE → TEST → ' + (r.guardian_verdict === 'APPROVED' ? 'MERGE' : 'DROP'),
        outcome: r.guardian_verdict === 'APPROVED' ? 'MERGED' : 'DROPPED', duration_ms: r.latency_ms, created_at: r.timestamp, triggered_by: r.triggered_by_user })),
      guardian_decisions: decisions.filter((d) => d.agent_name === 'guardian_agent').slice(0, 10).map((r) => ({ asset_id: r.asset_id, verdict: r.guardian_verdict, reason: r.guardian_reason,
        estimated_cost: (orders.find((o) => o.branch_id === r.branch_id) || {}).estimated_cost, triggered_by: r.triggered_by_user, created_at: r.timestamp })),
      fleet_summary: { source: D.trained_on, rul_model_rmse_cycles: D.model_rmse_cycles } }),
    'POST /api/demo/trigger': () => { runChain(15); return { status: 'accepted', asset_id: 15, message: 'Engine 15 demo chain started.', timestamp: iso(Date.now()) }; },
    'POST /api/stream/control': () => ({ status: 'ok', mode: 'replay', timestamp: iso(Date.now()) }),
    'GET /health': () => ({ status: 'ok', lakebase: true, spark: true, agents_in_flight: inflight.length, timestamp: iso(Date.now()) }),
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = ((init && init.method) || 'GET').toUpperCase();
    let m = url.pathname.match(/\/api\/engine\/(\d+)/), key, arg;
    if (m) { key = 'GET /api/engine'; arg = +m[1]; } else key = method + ' ' + url.pathname.replace(/^.*?(\/api\/|\/health)/, '$1');
    if (routes[key]) {
      const body = JSON.stringify(routes[key](arg));
      return new Promise((r) => setTimeout(() => r(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })), 30 + Math.random() * 60));
    }
    return realFetch(input, init);
  };
})();
