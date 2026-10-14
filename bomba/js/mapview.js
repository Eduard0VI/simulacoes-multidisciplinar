/* SVG renderer: draws every visual layer as a pure function of elapsed time. */
(function () {
  const FM = (window.FM = window.FM || {});
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const el = (name, attrs) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MAX_PARTICLES = 60;
  const CAP = [ // [dx, dy, radius] relative to cap radius
    [0, 0, 1], [-0.7, 0.15, 0.7], [0.7, 0.15, 0.7], [-0.35, -0.45, 0.6],
    [0.4, -0.45, 0.6], [-1.0, 0.35, 0.45], [1.0, 0.35, 0.45], [0, 0.55, 0.55]
  ];
  const V = {};
  let seeds = [];

  FM.mapInit = function () {
    ['map', 'land', 'zones', 'thermal', 'ring1', 'ring2', 'marker', 'markerScale', 'cloud',
     'particles', 'rain', 'haze', 'flashRect', 'flashCore', 'mLabel'].forEach((id) => (V[id] = $(id)));

    // zones (outer first so inner paints on top)
    V.zoneEls = FM.computeEffects(FM.DEFAULTS).zones.map((z) => {
      const g = el('g', {});
      const c = el('circle', { r: 0, fill: z.color, 'fill-opacity': 0, stroke: z.color, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' });
      const t = el('text', { 'font-size': 11, 'font-weight': 600, fill: z.color, 'text-anchor': 'middle', opacity: 0 });
      t.textContent = 'ZONA ' + z.id;
      g.append(c, t);
      return { g, c, t };
    });
    V.zoneEls.slice().reverse().forEach((z) => V.zones.appendChild(z.g));

    // cloud
    V.stem = el('path', { fill: '#2B3642', stroke: '#566474', 'stroke-width': 1 });
    V.base = el('ellipse', { rx: 0, ry: 0, fill: '#2B3642', opacity: 0.8 });
    V.cloud.append(V.base, V.stem);
    V.caps = CAP.map(() => {
      const c = el('circle', { fill: '#3A4654', stroke: '#5B6878', 'stroke-width': 1 });
      V.cloud.appendChild(c);
      return c;
    });
    V.glow = el('circle', { fill: '#D9A441' });
    V.cloud.appendChild(V.glow);

    // particles
    seeds = FM.makeParticles(MAX_PARTICLES);
    V.pEls = seeds.map(() => {
      const c = el('circle', { fill: '#98A4B3', r: 1.5, opacity: 0 });
      V.particles.appendChild(c);
      return c;
    });

    // rain
    for (let i = 0; i < 70; i++) {
      const x = Math.round(Math.random() * 840 - 20);
      const l = el('line', { x1: x, y1: 0, x2: x - 4, y2: 14, class: 'rain-drop' });
      l.style.animationDelay = (-Math.random() * 0.9).toFixed(2) + 's';
      l.style.animationDuration = (0.7 + Math.random() * 0.5).toFixed(2) + 's';
      V.rain.appendChild(l);
    }
  };

  // client coordinates -> SVG map coordinates
  FM.clientToMap = function (cx, cy) {
    const pt = V.map.createSVGPoint();
    pt.x = cx; pt.y = cy;
    return pt.matrixTransform(V.map.getScreenCTM().inverse());
  };

  FM.isLand = function (p) {
    if (p.x < 20 || p.x > 780 || p.y < 20 || p.y > 580) return false;
    if (typeof V.land.isPointInFill === 'function') {
      const pt = V.map.createSVGPoint(); pt.x = p.x; pt.y = p.y;
      return V.land.isPointInFill(pt);
    }
    return true;
  };

  FM.render = function (t, params, fx) {
    const T = FM.TIMELINE;
    const L = FM.layerProgress(t);
    const { x, y } = params.loc;

    // marker
    V.marker.setAttribute('transform', `translate(${x} ${y})`);
    let s = 1;
    if (t >= T[1].start && t < T[2].start) s = 1 + 1.2 * FM.easeOut(L.flash);
    else if (t >= T[2].start) s = 2.2 - 0.8 * FM.easeOut(FM.prog(t, 1500, 2500));
    V.markerScale.setAttribute('transform', `scale(${s.toFixed(3)})`);
    V.mLabel.setAttribute('opacity', t > 0 ? 0.6 : 1);
    V.mLabel.textContent = params.mode === 'historical' ? 'HIPOCENTRO' : 'PONTO PERSONALIZADO';

    // atmosphere
    V.haze.setAttribute('opacity', fx.haze);
    V.rain.style.display = fx.rain ? '' : 'none';

    // flash (never fully opaque, short)
    const fp = L.flash;
    let fo = 0;
    if (t >= T[1].start && t < T[1].end) fo = fp < 0.12 ? fp / 0.12 : Math.pow(1 - fp, 2);
    const max = reduced ? 0.2 : 0.7;
    V.flashRect.setAttribute('opacity', (fo * max * 0.55).toFixed(3));
    V.flashCore.setAttribute('cx', x); V.flashCore.setAttribute('cy', y);
    V.flashCore.setAttribute('r', 40 + 120 * FM.easeOut(fp));
    V.flashCore.setAttribute('opacity', (fo * max).toFixed(3));

    // shockwave rings
    const sp = L.shock, sp2 = FM.prog(t, 1900, 3700);
    [[V.ring1, sp, 1], [V.ring2, sp2, 0.82]].forEach(([r, p, k]) => {
      r.setAttribute('cx', x); r.setAttribute('cy', y);
      r.setAttribute('r', (fx.shockMax * k * FM.easeOut(p)).toFixed(1));
      r.setAttribute('stroke-width', (3 - 2 * p).toFixed(2));
      r.setAttribute('opacity', p > 0 && p < 1 ? ((1 - p) * 0.9).toFixed(3) : 0);
    });

    // thermal glow
    V.thermal.setAttribute('cx', x); V.thermal.setAttribute('cy', y);
    V.thermal.setAttribute('r', (fx.zones[1].r * 1.1 * FM.easeOut(L.thermal)).toFixed(1));
    V.thermal.setAttribute('opacity', t >= T[3].start && t < T[4].start ? (Math.sin(Math.PI * L.thermal) * 0.8).toFixed(3) : 0);

    // zones: dashed preview while idle, filled reveal during/after ZONES phase
    fx.zones.forEach((z, i) => {
      const e = V.zoneEls[i];
      const zp = FM.prog(t, T[4].start + i * 350, T[4].start + i * 350 + 900);
      const r = t <= 0 ? z.r : z.r * FM.easeOut(zp);
      e.c.setAttribute('cx', x); e.c.setAttribute('cy', y); e.c.setAttribute('r', r.toFixed(1));
      e.c.setAttribute('fill-opacity', (z.fill * zp).toFixed(3));
      e.c.setAttribute('stroke-opacity', t <= 0 ? 0.28 : Math.min(1, zp * 1.2) * 0.85);
      e.t.setAttribute('x', x); e.t.setAttribute('y', y + r - 6);
      e.t.setAttribute('opacity', zp > 0.9 ? 0.9 : 0);
    });

    // cloud (stylized side elevation anchored at the marker)
    const cp = L.cloud, e = FM.easeOut(cp);
    V.cloud.setAttribute('opacity', cp > 0 ? 1 : 0);
    if (cp > 0) {
      const R = fx.cloudWidth * (0.25 + 0.75 * e) * 0.8;
      // keep the stylized cloud inside the map, whatever the marker position
      const H = Math.max(30, Math.min(fx.cloudHeight * e, y - R * 0.75 - 14));
      const lean = fx.wind * e, w = 8 + 6 * e, ty = -H;
      V.cloud.setAttribute('transform', `translate(${x} ${y})`);
      V.stem.setAttribute('d',
        `M${-w},0 Q${(-w * 0.5 + lean * 0.25).toFixed(1)},${(-H * 0.5).toFixed(1)} ${(lean - w * 0.8).toFixed(1)},${ty.toFixed(1)} ` +
        `L${(lean + w * 0.8).toFixed(1)},${ty.toFixed(1)} Q${(w * 0.5 + lean * 0.25).toFixed(1)},${(-H * 0.5).toFixed(1)} ${w},0 Z`);
      V.base.setAttribute('rx', (w * 2.4).toFixed(1)); V.base.setAttribute('ry', (w * 0.9).toFixed(1));
      const bil = performance.now() / 420;
      CAP.forEach((c, i) => {
        const n = V.caps[i];
        n.setAttribute('cx', (lean + c[0] * R).toFixed(1));
        n.setAttribute('cy', (ty + c[1] * R * 0.7 + Math.sin(bil + i) * 1.5 * cp).toFixed(1));
        n.setAttribute('r', (c[2] * R * 0.62).toFixed(1));
      });
      V.glow.setAttribute('cx', lean); V.glow.setAttribute('cy', ty);
      V.glow.setAttribute('r', (R * 0.4).toFixed(1));
      V.glow.setAttribute('opacity', ((1 - e) * 0.55).toFixed(3));
    }

    // particles (capped at MAX_PARTICLES)
    const pp = L.particles, n = Math.min(MAX_PARTICLES, fx.particleCount);
    V.pEls.forEach((c, i) => {
      if (i >= n || pp <= 0) { c.setAttribute('opacity', 0); return; }
      const sd = seeds[i], q = FM.easeOut(FM.clamp01((pp - sd.delay) / (1 - sd.delay)));
      const px = x + Math.cos(sd.a) * sd.d * fx.spread * q + fx.wind * (0.4 + sd.delay) * q;
      const py = y - sd.rise * q * 0.9 + Math.abs(Math.sin(sd.a)) * 25 * q;
      c.setAttribute('cx', px.toFixed(1)); c.setAttribute('cy', py.toFixed(1));
      c.setAttribute('r', sd.size);
      c.setAttribute('opacity', (0.7 - 0.35 * q).toFixed(2));
    });
  };
})();
