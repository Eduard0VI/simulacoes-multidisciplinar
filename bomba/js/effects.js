/* Pure functions: timeline, presets and visual-effect parameters.
   Everything here is abstract/visual. No physical model. */
(function () {
  const FM = (window.FM = window.FM || {});

  FM.HISTORICAL_POINT = { x: 460, y: 170 };
  FM.DEFAULTS = { height: 50, intensity: 50, atmosphere: 'NORMAL' };

  // Phase timeline in ms. Visual layers are derived from elapsed time, so the
  // canvas can be paused, stepped or seeked deterministically.
  FM.TIMELINE = [
    { id: 'ARMED',     label: 'PRONTO',     start: 0,     end: 1000 },
    { id: 'FLASH',     label: 'CLARÃO',     start: 1000,  end: 1500 },
    { id: 'SHOCKWAVE', label: 'ONDA DE CHOQUE', start: 1500,  end: 3700 },
    { id: 'THERMAL',   label: 'TÉRMICO',   start: 3700,  end: 5500 },
    { id: 'ZONES',     label: 'ZONAS',     start: 5500,  end: 7300 },
    { id: 'CLOUD',     label: 'NUVEM',     start: 7300,  end: 12000 },
    { id: 'COMPLETE',  label: 'CONCLUÍDO',  start: 12000, end: 12000 }
  ];
  FM.TOTAL = 12000;
  FM.PARTICLE_WINDOW = [8500, 12000];

  // Presentation steps (end = elapsed time at which the step is fully shown)
  FM.STEPS = [
    { title: 'LOCAL HISTÓRICO', end: 0,     text: 'Distrito de Urakami, Nagasaki — 9 de agosto de 1945.' },
    { title: 'DETONAÇÃO',          end: 1500,  text: 'Um clarão breve marca o instante da explosão aérea.' },
    { title: 'ONDA DE CHOQUE',      end: 3700,  text: 'Uma onda de pressão se expande a partir do ponto.' },
    { title: 'EFEITO TÉRMICO',      end: 7300,  text: 'Calor e zonas de efeito visualizadas se espalham pela área.' },
    { title: 'CONSEQUÊNCIAS',       end: 12000, text: 'A nuvem sobe; a área atingida fica em ruínas.' }
  ];

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  FM.clamp01 = clamp01;
  FM.prog = (t, s, e) => clamp01((t - s) / (e - s));
  FM.easeOut = (p) => 1 - Math.pow(1 - p, 3);
  FM.easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  FM.phaseAt = function (t) {
    if (t <= 0) return 'IDLE';
    if (t >= FM.TOTAL) return 'COMPLETE';
    for (const ph of FM.TIMELINE) if (t >= ph.start && t < ph.end) return ph.id;
    return 'COMPLETE';
  };

  FM.stepIndex = function (t) {
    if (t <= 0) return 0;
    for (let i = 1; i < FM.STEPS.length; i++) if (t <= FM.STEPS[i].end + 1) return i;
    return FM.STEPS.length - 1;
  };

  FM.presetOf = (v) => (v < 34 ? 'LOW' : v < 67 ? 'MEDIUM' : 'HIGH');
  FM.presetLabel = (v, fem) => ({ LOW: fem ? 'BAIXA' : 'BAIXA', MEDIUM: 'MÉDIA', HIGH: 'ALTA' })[FM.presetOf(v)];

  // Progress of each visual layer (0..1), used by renderer and results panel.
  FM.layerProgress = function (t) {
    const T = FM.TIMELINE;
    return {
      flash: FM.prog(t, T[1].start, T[1].end),
      shock: FM.prog(t, T[2].start, T[2].end),
      thermal: FM.prog(t, T[3].start, T[3].end),
      zones: FM.prog(t, T[4].start, T[4].end),
      cloud: FM.prog(t, T[5].start, T[5].end),
      particles: FM.prog(t, FM.PARTICLE_WINDOW[0], FM.PARTICLE_WINDOW[1])
    };
  };

  const ATMOS = {
    NORMAL: { wind: 18,  spread: 1.0, haze: 0.05, rain: false },
    WINDY:  { wind: 95,  spread: 1.7, haze: 0.07, rain: false },
    RAIN:   { wind: 30,  spread: 0.9, haze: 0.2,  rain: true },
    CLEAR:  { wind: 0,   spread: 0.8, haze: 0,    rain: false }
  };
  const INTENSITY_SCALE = { LOW: 0.75, MEDIUM: 1.0, HIGH: 1.3 };

  // Visual parameters only. Zone radii are in map units and illustrative.
  FM.computeEffects = function (params) {
    const h = clamp01(params.height / 100);
    const I = INTENSITY_SCALE[FM.presetOf(params.intensity)];
    const a = ATMOS[params.atmosphere] || ATMOS.NORMAL;
    const zones = [
      { id: 'A', r: 55 * (1.25 - 0.5 * h) * I,  color: '#D95C59', fill: 0.24 },
      { id: 'B', r: 110 * (0.9 + 0.2 * h) * I,  color: '#D9A441', fill: 0.16 },
      { id: 'C', r: 175 * (0.85 + 0.4 * h) * I, color: '#98A4B3', fill: 0.09 }
    ];
    return {
      zones,
      shockMax: zones[2].r * 1.15,
      cloudHeight: 230 * (0.8 + 0.4 * (I - 0.75) / 0.55),
      cloudWidth: 62 * (0.85 + 0.3 * (I - 0.75) / 0.55),
      wind: a.wind,
      spread: a.spread,
      haze: a.haze,
      rain: a.rain,
      particleCount: Math.round(40 * (0.8 + 0.4 * (I - 0.75) / 0.55))
    };
  };

  // Deterministic particle seeds so seeking/rewinding gives identical frames.
  FM.makeParticles = function (n) {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: n }, () => ({
      a: rnd() * Math.PI * 2, d: 25 + rnd() * 120, rise: 20 + rnd() * 150,
      size: 1 + rnd() * 1.8, delay: rnd() * 0.4
    }));
  };
})();
