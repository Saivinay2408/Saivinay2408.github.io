/* StratoGlide dashboard. Every value is read from data/*.json written by build_site.py; nothing is typed in. */
(function () {
  "use strict";
  var FILES = ["numbers", "geometry", "polars", "stability", "release", "prop", "perf", "predictions", "verify"];
  var D = {};
  var NS = "http://www.w3.org/2000/svg";
  var C = { gold: "#FED176", blue: "#7aa2f7", green: "#6fd3a3", red: "#ff7b7b", violet: "#b9a3ff", mute: "#93a3c4", ink: "#e6ecf7", line: "#22335a" };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, html, cls) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function N(k) { var n = D.numbers.numbers[k]; if (!n) { console.warn("missing key", k); return null; } return n; }
  function fmt(x, nd) {
    if (x == null || typeof x !== "number") return String(x);
    var s = Math.abs(x) >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: nd, minimumFractionDigits: nd }) : x.toFixed(nd);
    return s;
  }
  /* value span with provenance tooltip; scale for percent display */
  function v(k, nd, scale) {
    var n = N(k); if (!n) return "n/a";
    var x = typeof n.value === "number" ? n.value * (scale || 1) : n.value;
    return '<span data-k title="' + k + "  (" + n.script + ')">' + fmt(x, nd) + "</span>";
  }
  function raw(k) { var n = N(k); return n ? n.value : null; }

  function load(name) {
    return fetch("data/" + name + ".json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  /* ---------- generic SVG chart ---------- */
  function chart(host, o) {
    var W = o.w || 420, H = o.h || 260, m = { l: 46, r: 12, t: 10, b: 34 };
    var wrap = h("div");
    if (o.title) wrap.appendChild(h("h4", o.title));
    if (o.cap) wrap.appendChild(h("p", o.cap, "cap"));
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": o.title || "chart" });
    wrap.appendChild(svg);
    host.appendChild(wrap);
    var x0 = o.x[0], x1 = o.x[1], y0 = o.y[0], y1 = o.y[1];
    function X(x) { return m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r); }
    function Y(y) { return H - m.b - (y - y0) / (y1 - y0) * (H - m.t - m.b); }
    var g = el("g", { "class": "axis" }, svg);
    var nt = 5;
    for (var i = 0; i <= nt; i++) {
      var xv = x0 + (x1 - x0) * i / nt, yv = y0 + (y1 - y0) * i / nt;
      el("line", { x1: X(xv), x2: X(xv), y1: m.t, y2: H - m.b, "class": "gridl" }, g);
      el("line", { x1: m.l, x2: W - m.r, y1: Y(yv), y2: Y(yv), "class": "gridl" }, g);
      if (!o.cats) { var tx = el("text", { x: X(xv), y: H - m.b + 13, "text-anchor": "middle" }, g); tx.textContent = o.xf ? o.xf(xv) : +xv.toPrecision(3); }
      var ty = el("text", { x: m.l - 5, y: Y(yv) + 3, "text-anchor": "end" }, g); ty.textContent = o.yf ? o.yf(yv) : +yv.toPrecision(3);
    }
    if (o.cats) o.cats.forEach(function (c, i) { var t = el("text", { x: X(i + 0.5), y: H - m.b + 13, "text-anchor": "middle", "class": "lbl" }, svg); t.textContent = c; });
    var xl = el("text", { x: (m.l + W - m.r) / 2, y: H - 4, "text-anchor": "middle", "class": "lbl" }, svg); xl.textContent = o.xl || "";
    var yl = el("text", { x: 11, y: (m.t + H - m.b) / 2, "text-anchor": "middle", "class": "lbl", transform: "rotate(-90 11 " + (m.t + H - m.b) / 2 + ")" }, svg); yl.textContent = o.yl || "";
    var clip = "c" + Math.random().toString(36).slice(2);
    var cp = el("clipPath", { id: clip }, el("defs", {}, svg));
    el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, cp);
    var body = el("g", { "clip-path": "url(#" + clip + ")" }, svg);
    var api = {
      line: function (xs, ys, st) {
        var d = "", pen = false;
        for (var i = 0; i < xs.length; i++) {
          if (!isFinite(xs[i]) || !isFinite(ys[i])) { pen = false; continue; }
          d += (pen ? "L" : "M") + X(xs[i]).toFixed(1) + " " + Y(ys[i]).toFixed(1); pen = true;
        }
        el("path", { d: d, fill: "none", stroke: st.c, "stroke-width": st.w || 1.6, opacity: st.o || 1, "stroke-dasharray": st.dash || "" }, body);
      },
      dots: function (xs, ys, st) {
        for (var i = 0; i < xs.length; i++) el("circle", { cx: X(xs[i]), cy: Y(ys[i]), r: st.r || 2.4, fill: st.c, opacity: st.o || 1 }, body);
      },
      bars: function (edges, counts, st) {
        for (var i = 0; i < counts.length; i++) {
          el("rect", { x: X(edges[i]) + 0.5, y: Y(counts[i]), width: Math.max(0, X(edges[i + 1]) - X(edges[i]) - 1), height: Y(y0) - Y(counts[i]), fill: st.c, opacity: 0.85 }, body);
        }
      },
      hline: function (y, st) { el("line", { x1: m.l, x2: W - m.r, y1: Y(y), y2: Y(y), stroke: st.c, "stroke-dasharray": "5 4", "stroke-width": 1.2 }, body); },
      vline: function (x, st) { el("line", { x1: X(x), x2: X(x), y1: m.t, y2: H - m.b, stroke: st.c, "stroke-dasharray": "5 4", "stroke-width": 1.2 }, body); },
      legend: function (items) {
        var lg = h("div", null, "legend");
        items.forEach(function (it) { lg.appendChild(h("span", '<i style="background:' + it[1] + '"></i>' + it[0])); });
        wrap.appendChild(lg);
      }
    };
    return api;
  }
  function ext(arrs, pad) {
    var lo = Infinity, hi = -Infinity;
    arrs.forEach(function (a) { a.forEach(function (x) { if (isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }); });
    var p = (hi - lo) * (pad || 0.05); return [lo - p, hi + p];
  }
  function hist(xs, nb) {
    var r = ext([xs], 0), e = [], c = [];
    for (var i = 0; i <= nb; i++) e.push(r[0] + (r[1] - r[0]) * i / nb);
    for (i = 0; i < nb; i++) c.push(0);
    xs.forEach(function (x) { if (!isFinite(x)) return; var j = Math.min(nb - 1, Math.floor((x - r[0]) / (r[1] - r[0]) * nb)); c[j]++; });
    return { e: e, c: c };
  }

  /* ---------- sections ---------- */
  function kpi(label, html, tip, fail) {
    var d = h("div", '<div class="l">' + label + '</div><div class="v">' + html + "</div>" + (tip ? '<div class="t">' + tip + "</div>" : ""), "kpi" + (fail ? " fail" : ""));
    return d;
  }
  function mission() {
    $("hash").textContent = D.numbers.values_sha256.slice(0, 16);
    var k = $("kpis");
    k.appendChild(kpi("MTOW", v("p3.mtow_kg", 3) + "<small>kg</small>"));
    k.appendChild(kpi("Span", v("p3.span_m", 3) + "<small>m</small>", "AR " + v("p3.AR", 1)));
    k.appendChild(kpi("Release altitude", v("mission.release.alt_m", 0) + "<small>m</small>"));
    k.appendChild(kpi("Loiter endurance, 19 km", v("p7.endurance_min_19km", 1) + "<small>min</small>", "need " + v("mission.loiter.duration_min", 0) + " min"));
    k.appendChild(kpi("Autopilot recovery", v("p5.recovery_rate_autopilot", 1, 100) + "<small>%</small>", v("p5.mc_n", 0) + " Monte Carlo releases"));
    k.appendChild(kpi("Peak Mach P99", v("p5.mach_p99", 3), "max n " + v("p5.nz_max", 2) + " g"));
    k.appendChild(kpi("Static margin", v("p4.sm_pct_sl", 2) + "<small>% MAC</small>", "same at 20 km: " + v("p4.sm_pct_20km", 2) + "%"));
    k.appendChild(kpi("XFOIL drag error, Re 100k to 200k", v("derived.cd_mape_re100k_200k_best", 1, 100) + " to " + v("derived.cd_mape_re100k_200k_worst", 1, 100) + "<small>%</small>", "validated against UIUC wind-tunnel data"));
    k.appendChild(kpi("BOM (airframe)", "INR " + v("p8.bom_total_inr", 0), "airframe bill of materials"));
  }

  function geometry() {
    var g = D.geometry;
    $("geo-sub").innerHTML = "Span " + v("p3.span_m", 3) + " m, area " + v("p3.S_m2", 3) + " m^2, root chord " + v("p3.c_root_m", 3) + " m, tip chord " + v("p3.c_tip_m", 3) + " m. Drawn to scale from geometry_final.json (P4).";
    var s0 = g.wing_sections[0], s1 = g.wing_sections[1], ht = g.htail, vt = g.vtail, pod = g.pod, bm = g.boom;
    var xmin = pod.x_nose - 0.03, xmax = Math.max(ht.x_le + ht.chord, vt.x_le + vt.chord) + 0.03, ymax = g.b / 2 + 0.03;
    function view(id, vb, draw) { var svg = $(id); svg.setAttribute("viewBox", vb.join(" ")); draw(svg); }
    var st = { fill: "rgba(254,209,118,.10)", stroke: C.gold, "stroke-width": 0.006, "stroke-linejoin": "round" };
    function poly(svg, pts, extra) { var a = Object.assign({}, st, extra || {}); a.points = pts.map(function (p) { return p.join(","); }).join(" "); el("polygon", a, svg); }
    /* top: x down the page would be unusual; use x to the right, y up */
    /* top view: nose up, span horizontal. Drawn in (x, y) body axes, swapped by the group transform. */
    view("v-top", [-ymax, xmin, 2 * ymax, xmax - xmin], function (root) {
      var svg = el("g", { transform: "matrix(0,1,1,0,0,0)" }, root);
      [1, -1].forEach(function (sg) {
        poly(svg, [[s0.x_le, 0], [s1.x_le, -sg * s1.y], [s1.x_le + s1.chord, -sg * s1.y], [s0.x_le + s0.chord, 0]]);
        poly(svg, [[ht.x_le, 0], [ht.x_le, -sg * ht.b / 2], [ht.x_le + ht.chord, -sg * ht.b / 2], [ht.x_le + ht.chord, 0]]);
      });
      el("rect", { x: bm.x0, y: -bm.d / 2, width: bm.length, height: bm.d, fill: "none", stroke: C.blue, "stroke-width": 0.005 }, svg);
      el("ellipse", { cx: pod.x_nose + pod.length / 2, cy: 0, rx: pod.length / 2, ry: pod.diameter / 2, fill: "rgba(122,162,247,.12)", stroke: C.blue, "stroke-width": 0.006 }, svg);
      el("line", { x1: g.prop.x, x2: g.prop.x, y1: -g.prop.diameter / 2, y2: g.prop.diameter / 2, stroke: C.mute, "stroke-width": 0.006 }, svg);
      el("circle", { cx: g.cg.x, cy: 0, r: 0.012, fill: C.green }, svg);
    });
    var zmin = -0.15, zmax = Math.max(vt.z0 + vt.h, s1.z) + 0.05;
    view("v-front", [-ymax, -zmax, 2 * ymax, zmax - zmin], function (svg) {
      var tw = g.tc * s0.chord;
      [1, -1].forEach(function (sg) {
        poly(svg, [[0, tw / 2], [sg * s1.y, -s1.z + g.tc * s1.chord / 2], [sg * s1.y, -s1.z - g.tc * s1.chord / 2], [0, -tw / 2]]);
        el("line", { x1: 0, x2: sg * ht.b / 2, y1: -ht.z, y2: -ht.z, stroke: C.gold, "stroke-width": 0.012 }, svg);
      });
      el("line", { x1: 0, x2: 0, y1: -vt.z0, y2: -(vt.z0 + vt.h), stroke: C.gold, "stroke-width": 0.014 }, svg);
      el("circle", { cx: 0, cy: -pod.z, r: pod.diameter / 2, fill: "rgba(122,162,247,.12)", stroke: C.blue, "stroke-width": 0.006 }, svg);
      el("circle", { cx: 0, cy: -pod.z, r: g.prop.diameter / 2, fill: "none", stroke: C.mute, "stroke-width": 0.004, "stroke-dasharray": "0.02 0.02" }, svg);
    });
    view("v-side", [xmin, -zmax, xmax - xmin, zmax - zmin], function (svg) {
      poly(svg, [[s0.x_le, -0.012], [s0.x_le + s0.chord, 0], [s0.x_le, 0.012]]);
      poly(svg, [[vt.x_le, -vt.z0], [vt.x_le + vt.chord * 0.25, -(vt.z0 + vt.h)], [vt.x_le + vt.chord, -(vt.z0 + vt.h)], [vt.x_le + vt.chord, -vt.z0]]);
      el("line", { x1: ht.x_le, x2: ht.x_le + ht.chord, y1: -ht.z, y2: -ht.z, stroke: C.gold, "stroke-width": 0.01 }, svg);
      el("rect", { x: bm.x0, y: -bm.z - bm.d / 2, width: bm.length, height: bm.d, fill: "none", stroke: C.blue, "stroke-width": 0.005 }, svg);
      el("ellipse", { cx: pod.x_nose + pod.length / 2, cy: -pod.z, rx: pod.length / 2, ry: pod.diameter / 2, fill: "rgba(122,162,247,.12)", stroke: C.blue, "stroke-width": 0.006 }, svg);
      el("line", { x1: g.prop.x, x2: g.prop.x, y1: -pod.z - g.prop.diameter / 2, y2: -pod.z + g.prop.diameter / 2, stroke: C.mute, "stroke-width": 0.006 }, svg);
      el("circle", { cx: g.cg.x, cy: -g.cg.z, r: 0.012, fill: C.green }, svg);
    });
  }

  function airfoil() {
    var P = D.polars;
    $("foil-sub").innerHTML = "XFOIL at the design Ncrit " + v("p2.design_ncrit", 0) + " (lines) against UIUC LSAT drag polars (dots). CD error is the mean absolute error at matched CL over 0.3 to 1.0; bar " + v("bars.validation.cd_mape_max", 0, 100) + "% at Re 100k and 200k (60k and 300k held out). E387 fails the bar at 100k and 200k; the measured knockdown is carried into sizing.";
    P.cases.forEach(function (c) {
      var box = h("div", null, "chart"); $("polars").appendChild(box);
      var key = "p2.cd_mape_" + c.foil + "_re" + (c.re / 1000) + "k";
      var pass = c.cd_mape <= P.bar;
      var ch = chart(box, { title: c.foil + ", Re " + (c.re / 1000) + "k" + (c.held_out ? " (held out)" : ""), cap: "CD error " + v(key, 1, 100) + '% <span class="pill ' + (c.held_out ? "skip" : pass ? "pass" : "fail") + '">' + (c.held_out ? "reported" : pass ? "pass" : "fail") + "</span>",
        x: [0, 0.035], y: [-0.2, 1.5], xl: "CD", yl: "CL", w: 300, h: 230, xf: function (x) { return x.toFixed(3); } });
      ch.line(c.xfoil.cd, c.xfoil.cl, { c: C.gold, w: 1.8 });
      ch.dots(c.uiuc.cd, c.uiuc.cl, { c: C.blue, r: 2.6 });
    });
  }

  function sizing() {
    var rows = [["Wing loading", v("p3.wing_loading_npm2", 1) + " N/m^2"], ["Loiter CL", v("p3.cl_loiter", 3)], ["Loiter speed", v("p3.v_loiter_tas", 1) + " m/s TAS, " + v("p3.v_loiter_eas", 2) + " m/s EAS"],
      ["Loiter L/D", v("p3.ld_loiter", 2)], ["Loiter Re", v("p3.re_loiter", 0) + " (max reachable " + v("p3.max_re_loiter_other_constraints", 0) + ")"], ["Stall EAS", v("p3.vs_eas_sl", 2) + " m/s (limit " + v("mission.handlaunch.stall_eas_max_mps", 1) + ")"],
      ["Battery", v("p3.pack", 0) + ", " + v("p3.E_nameplate_wh", 1) + " Wh nameplate, " + v("p3.E_usable_wh", 1) + " Wh usable"], ["Cell min temperature", v("p3.cell_T_min_c", 1) + " C (uninsulated " + v("p3.noinsulation_cell_T_min_c", 1) + " C)"],
      ["Opti vs grid optimum", v("derived.opti_vs_grid_pct", 2) + "%"]];
    rows.forEach(function (r) { var tr = h("tr"); tr.appendChild(h("td", r[0])); tr.appendChild(h("td", r[1])); $("sizing-kv").appendChild(tr); });
    $("sizing-note").innerHTML = "Active constraints: hand-launch stall and the design Re floor. Strict MR-9 (loiter Re at or above the validated " + v("p2.re_min_validated", 0) + ") is infeasible with the other requirements: logged, not hidden.";
  }

  function stability() {
    var S = D.stability.cases;
    $("stab-sub").innerHTML = "AVL at matched CL with the CG at " + v("p4.sm_pct_sl", 2) + "% MAC static margin. Relative density mu rises from " + v("p4.mu_rel_sl", 0) + " to " + v("p4.mu_rel_20km", 0) + ", so aerodynamic damping falls with altitude.";
    var t = $("modes");
    t.innerHTML = "<tr><th>Mode</th><th>Sea level</th><th>20 km</th></tr>";
    var M = [["Short period", "short_period", "zeta / wn", function (m, z) { return v("p4.short_period_zeta_" + z, 3) + " / " + v("p4.short_period_wn_" + z, 2) + " rad/s"; }],
      ["Phugoid", "phugoid", "", function (m, z) { return v("p4.phugoid_zeta_" + z, 3) + " / " + v("p4.phugoid_period_s_" + z, 1) + " s"; }],
      ["Dutch roll", "dutch_roll", "", function (m, z) { return "zeta " + v("p4.dutch_roll_zeta_" + z, 3); }],
      ["Roll", "roll", "", function (m, z) { return "tau " + v("p4.roll_tau_s_" + z, 3) + " s"; }]];
    M.forEach(function (r) { var tr = h("tr"); tr.appendChild(h("td", r[0])); tr.appendChild(h("td", r[3](r[1], "sl"))); tr.appendChild(h("td", r[3](r[1], "20km"))); t.appendChild(tr); });
    var box = $("zeta-chart");
    var names = ["short_period", "phugoid", "dutch_roll"], lab = ["Short period", "Phugoid", "Dutch roll"];
    var zs = names.map(function (n) { return [raw("p4." + n + "_zeta_sl"), raw("p4." + n + "_zeta_20km")]; });
    var ymax = Math.max.apply(null, zs.map(function (a) { return Math.max(a[0], a[1]); })) * 1.15;
    var ch = chart(box, { title: "Damping ratio, SL vs 20 km", x: [0, 3], y: [0, ymax], xl: "", yl: "zeta", w: 420, h: 250, cats: lab });
    zs.forEach(function (a, i) { ch.bars([i + 0.15, i + 0.48], [a[0]], { c: C.blue }); ch.bars([i + 0.52, i + 0.85], [a[1]], { c: C.gold }); });
    var dr = raw("bars.stability.dr_zeta_min.alt20"); if (dr != null) ch.hline(dr, { c: C.red });
    ch.legend([["Sea level", C.blue], ["20 km", C.gold], ["Dutch roll bar at 20 km", C.red]]);
  }

  function release() {
    var R = D.release;
    $("rel-sub").innerHTML = v("p5.mc_n", 0) + "-run Latin hypercube Monte Carlo (seed " + R.seed + ") from " + v("mission.release.alt_m", 0) + " m with the own 6-DOF and the EAS-scheduled pull-out autopilot. JSBSim flies the same law on the nominal case: altitude lost " + v("p5.nominal_alt_lost_jsb_m", 1) + " m vs " + v("p5.nominal_alt_lost_own_m", 1) + " m.";
    var k = $("rel-kpis");
    k.appendChild(kpi("Recovered (autopilot)", v("p5.recovery_rate_autopilot", 1, 100) + "<small>%</small>"));
    k.appendChild(kpi("Recovered (controls fixed)", v("p5.recovery_rate_passive", 1, 100) + "<small>%</small>", "controls fixed, phugoid-limited"));
    k.appendChild(kpi("Mach P99", v("p5.mach_p99", 3)));
    k.appendChild(kpi("Max load factor", v("p5.nz_max", 2) + "<small>g</small>"));
    k.appendChild(kpi("Altitude lost P95", v("p5.alt_loss_p95_m", 0) + "<small>m</small>"));
    k.appendChild(kpi("Vertical dive, no pull-out", "Mach " + v("p5.vertical_dive_max_mach_clean", 3), "counterfactual"));
    var tz = [], tt = [];
    R.traj.forEach(function (r) { tz.push(r.z.map(function (z) { return z / 1000; })); tt.push(r.t); });
    var ch = chart($("traj"), { title: "Altitude after release (60 of " + R.N + " runs)", x: ext(tt, 0), y: ext(tz, 0.05), xl: "time (s)", yl: "altitude (km)", w: 380, h: 250 });
    R.traj.forEach(function (r, i) { ch.line(tt[i], tz[i], { c: C.gold, w: 1, o: 0.45 }); });
    var hm = hist(R.peak_mach_recorded, 24);
    var c2 = chart($("mach-hist"), { title: "Peak Mach per run", x: [hm.e[0], hm.e[hm.e.length - 1]], y: [0, Math.max.apply(null, hm.c) * 1.1], xl: "Mach", yl: "runs", w: 380, h: 250 });
    c2.bars(hm.e, hm.c, { c: C.blue }); c2.vline(raw("bars.release.mach_p99_max"), { c: C.red }); c2.legend([["bar", C.red]]);
    var hn = hist(R.peak_nz_recorded, 24);
    var c3 = chart($("nz-hist"), { title: "Peak load factor per run", x: [hn.e[0], Math.max(hn.e[hn.e.length - 1], raw("bars.release.n_max_g") * 1.05)], y: [0, Math.max.apply(null, hn.c) * 1.1], xl: "n (g)", yl: "runs", w: 380, h: 250 });
    c3.bars(hn.e, hn.c, { c: C.violet }); c3.vline(raw("bars.release.n_max_g"), { c: C.red }); c3.legend([["bar", C.red]]);
    $("rel-note").textContent = "Histograms and traces use the recorded history (every 100th integration step); headline percentiles above use every step.";
  }

  function prop() {
    var T = D.prop.table;
    $("prop-sub").innerHTML = "Own BEMT with a calibrated section stand-in. Flying at constant EAS keeps the required CT/J^2 the same at every altitude, so variable pitch recovers only " + v("p6.vp_gain_eta_points_max", 2) + " efficiency points over the same blade at fixed pitch (" + v("p6.vp_gain_vs_B_max", 2) + " over a blade optimised for sea level).";
    var z = T.map(function (r) { return r.z_m / 1000; });
    var all = [T.map(function (r) { return r.eta_A; }), T.map(function (r) { return r.eta_B; }), T.map(function (r) { return r.eta_VP; })];
    var ch = chart($("eta-chart"), { title: "Propeller efficiency vs altitude", x: [0, Math.max.apply(null, z)], y: ext(all, 0.15), xl: "altitude (km)", yl: "eta", w: 440, h: 260 });
    ch.line(z, all[0], { c: C.gold, w: 2 }); ch.dots(z, all[0], { c: C.gold });
    ch.line(z, all[1], { c: C.blue, w: 1.6, dash: "5 4" }); ch.dots(z, all[1], { c: C.blue });
    ch.line(z, all[2], { c: C.green, w: 1.6 }); ch.dots(z, all[2], { c: C.green });
    ch.legend([["Fixed pitch A (design)", C.gold], ["Fixed pitch B (SL-optimised)", C.blue], ["Variable pitch", C.green]]);
    var rows = [["Diameter", v("p6.prop_diameter_m", 2) + " m"], ["P/D (A)", v("p6.prop_pitch_over_D_A", 3)], ["Efficiency at 19 km", v("p6.eta_prop_loiter_19km", 3)], ["Blade Re75 at 20 km", v("p6.re75_20km", 0)],
      ["Helical tip Mach, 19 km", v("p6.mach_tip_19km", 3)], ["Held-out CT error", v("p6.bemt_ct_rel_max_heldout", 1, 100) + '% <span class="pill fail">fail</span>'], ["Held-out peak eta error", v("p6.bemt_eta_peak_abs_max_heldout", 3) + ' <span class="pill pass">pass</span>'],
      ["Motor", D.prop.motor.name]];
    rows.forEach(function (r) { var tr = h("tr"); tr.appendChild(h("td", r[0])); tr.appendChild(h("td", r[1])); $("prop-kv").appendChild(tr); });
  }

  function perf() {
    var P = D.perf, k = $("perf-kpis");
    [18, 19, 20].forEach(function (a) { k.appendChild(kpi("Endurance at " + a + " km", v("p7.endurance_min_" + a + "km", 1) + "<small>min</small>")); });
    k.appendChild(kpi("Still-air glide range", v("p7.glide_range_still_km", 1) + "<small>km</small>"));
    k.appendChild(kpi("P95 downwind reach", v("p7.footprint_p95_max_reach_km", 1) + "<small>km</small>"));
    var alts = Object.keys(P.altitudes).sort(function (a, b) { return a - b; });
    var cols = [C.mute, C.blue, C.violet, C.green, C.gold, C.red];
    var xs = alts.map(function (a) { return P.altitudes[a].polar.V; }), ys = alts.map(function (a) { return P.altitudes[a].polar.P; });
    var ymax = Math.max.apply(null, alts.map(function (a) { return P.altitudes[a].P_req_min_w; })) * 3;
    var ch = chart($("power-chart"), { title: "Power required vs true airspeed", x: ext(xs, 0), y: [0, ymax], xl: "V TAS (m/s)", yl: "P required (W)", w: 440, h: 270 });
    alts.forEach(function (a, i) { ch.line(xs[i], ys[i], { c: cols[i % cols.length], w: 1.7 }); });
    ch.legend(alts.map(function (a, i) { return [(a / 1000) + " km", cols[i % cols.length]]; }));
    /* footprint polar plot */
    var box = $("foot-chart"); var wrap = h("div"); wrap.appendChild(h("h4", "Return reach from end of loiter (P50, P95 winds)")); box.appendChild(wrap);
    var W = 300, R = 130, svg = el("svg", { viewBox: (-W / 2) + " " + (-W / 2) + " " + W + " " + W }); wrap.appendChild(svg);
    var all = P.footprint.p50.concat(P.footprint.p95).map(function (r) { return r.reach_m; }).filter(function (x) { return x != null && x > 0; });
    var rmax = Math.max.apply(null, all.concat([P.footprint.still]));
    [0.25, 0.5, 0.75, 1].forEach(function (f) { el("circle", { cx: 0, cy: 0, r: R * f, fill: "none", "class": "gridl" }, svg); var t = el("text", { x: 3, y: -R * f - 2, "class": "lbl" }, svg); t.textContent = (rmax * f / 1000).toFixed(0) + " km"; });
    function ring(rows, c, dash) {
      /* null or negative reach = that track cannot be held (cannot make progress into wind): left as a gap */
      var d = "", pen = false, n = rows.length;
      for (var i = 0; i <= n; i++) {
        var r = rows[i % n];
        if (r.reach_m == null || r.reach_m <= 0) { pen = false; continue; }
        var a = r.psi_deg * Math.PI / 180, rr = R * r.reach_m / rmax;
        d += (pen ? "L" : "M") + (rr * Math.sin(a)).toFixed(1) + " " + (-rr * Math.cos(a)).toFixed(1); pen = true;
      }
      el("path", { d: d, fill: "none", stroke: c, "stroke-width": 1.8, "stroke-dasharray": dash || "" }, svg);
    }
    el("circle", { cx: 0, cy: 0, r: R * P.footprint.still / rmax, fill: "none", stroke: C.mute, "stroke-dasharray": "3 3" }, svg);
    ring(P.footprint.p50, C.gold); ring(P.footprint.p95, C.red);
    var lg = h("div", null, "legend"); lg.innerHTML = '<span><i style="background:' + C.mute + '"></i>still air</span><span><i style="background:' + C.gold + '"></i>P50 wind</span><span><i style="background:' + C.red + '"></i>P95 wind</span><span>angle = track relative to downwind (up); gaps = track cannot be held</span>'; wrap.appendChild(lg);
    var t = $("timeline"); t.innerHTML = "<tr><th>Phase</th><th>Altitude (m)</th><th>Duration (s)</th><th>Energy (Wh)</th></tr>";
    P.timeline.forEach(function (r) { var tr = h("tr"); tr.appendChild(h("td", r.phase)); tr.appendChild(h("td", fmt(r.alt_start_m, 0) + " to " + fmt(r.alt_end_m, 0))); tr.appendChild(h("td", fmt(r.duration_s, 0))); tr.appendChild(h("td", fmt(r.energy_wh, 1))); t.appendChild(tr); });
  }

  function tests() {
    var t = $("preds");
    t.innerHTML = "<tr><th>Card</th><th>Quantity</th><th>Predicted</th><th>Band</th><th>Unit</th><th>Key</th></tr>";
    D.predictions.forEach(function (p) {
      var tr = h("tr");
      [p.card, p.quantity, v(p.numbers_key, 3), (+p.band_lo.toPrecision(4)) + " to " + (+p.band_hi.toPrecision(4)), p.unit, "<code>" + p.numbers_key + "</code>"].forEach(function (c) { tr.appendChild(h("td", c)); });
      t.appendChild(tr);
    });
  }

  function checks() {
    var box = $("verify");
    if (!D.verify) { box.innerHTML = '<p class="sub">Full verify.py run not embedded in this build.</p>'; return; }
    var V = D.verify;
    box.appendChild(h("p", "verify.py: " + V.pass + " pass, " + V.fail + " fail, " + V.skip + " skip of " + V.total + ".", "sub"));
    var g = h("div", null, "checks");
    V.results.forEach(function (r) {
      var s = r.status.toLowerCase();
      var icon = s === "pass" ? "#i-check" : s === "fail" ? "#i-x" : "#i-card";
      var d = h("div", '<b>[' + r.n + "] " + r.name + '</b> <span class="pill ' + s + '"><svg><use href="' + icon + '"/></svg>' + r.status + "</span><p></p>", "chk");
      d.querySelector("p").textContent = r.msg;
      g.appendChild(d);
    });
    box.appendChild(g);
  }

  var src = window.SG_DATA ? Promise.resolve(FILES.map(function (f) { return window.SG_DATA[f] || null; })) : Promise.all(FILES.map(load));
  src.then(function (res) {
    FILES.forEach(function (f, i) { D[f] = res[i]; });
    if (!D.numbers) { document.querySelector("main").insertAdjacentHTML("afterbegin", '<p class="sub">Could not load data/numbers.json. Open through any static server, or a browser that allows local fetch.</p>'); return; }
    [mission, geometry, airfoil, sizing, stability, release, prop, perf, tests, checks].forEach(function (fn) {
      try { fn(); } catch (e) { console.error(fn.name, e); }
    });
  });
})();
