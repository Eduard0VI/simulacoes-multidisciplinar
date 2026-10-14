/* State + UI wiring. Three separate state objects: params (scenario), sim (playback), pres/ui. */
(function () {
  const FM = window.FM;
  const $ = (id) => document.getElementById(id);

  // ---- state ----
  const params = { mode: 'historical', loc: { ...FM.HISTORICAL_POINT }, ...FM.DEFAULTS };
  const sim = { elapsed: 0, target: 0, running: false, last: 0, raf: 0 };
  const pres = { active: false };
  const ui = { drawer: null, toastTimer: 0 };
  let fx = FM.computeEffects(params);

  // ---- simulation engine ----
  function frame(ts) {
    if (!sim.running) { sim.raf = 0; return; }
    const dt = Math.min(64, ts - sim.last);
    sim.last = ts;
    sim.elapsed = Math.min(sim.target, sim.elapsed + dt);
    if (sim.elapsed >= sim.target) sim.running = false;
    refresh();
    sim.raf = sim.running ? requestAnimationFrame(frame) : 0;
  }
  function playTo(target) {
    sim.target = target;
    if (sim.elapsed >= target) { refresh(); return; }
    sim.running = true;
    sim.last = performance.now();
    if (!sim.raf) sim.raf = requestAnimationFrame(frame);
    refresh();
  }
  function seek(t) {
    sim.running = false;
    if (sim.raf) { cancelAnimationFrame(sim.raf); sim.raf = 0; }
    sim.elapsed = sim.target = t;
    refresh();
  }
  const resetSim = () => seek(0);

  // ---- controls ----
  function onParamChange() { fx = FM.computeEffects(params); resetSim(); }

  function syncControls() {
    $('rngHeight').value = params.height;
    $('rngIntensity').value = params.intensity;
    $('selAtmo').value = params.atmosphere;
    document.querySelectorAll('.seg').forEach((b) => {
      const on = b.dataset.mode === params.mode;
      b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on);
    });
    $('valHeight').textContent = `${FM.presetLabel(params.height)} · ${(params.height / 100).toFixed(2).replace('.', ',')}`;
    $('valIntensity').textContent = `${FM.presetLabel(params.intensity)} · ${params.intensity}`;
    $('modeLabel').textContent = params.mode === 'historical' ? 'MODO HISTÓRICO' : 'MODO PERSONALIZADO';
    document.body.classList.toggle('mode-custom', params.mode === 'custom');
    $('locHint').textContent = params.mode === 'historical'
      ? 'Fixo no ponto histórico de referência (distrito de Urakami).'
      : 'Clique em um ponto de terra no mapa para mover o marcador.';
  }

  document.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => {
    params.mode = b.dataset.mode;
    if (params.mode === 'historical') params.loc = { ...FM.HISTORICAL_POINT };
    syncControls(); onParamChange();
  }));
  $('rngHeight').addEventListener('input', (e) => { params.height = +e.target.value; syncControls(); onParamChange(); });
  $('rngIntensity').addEventListener('input', (e) => { params.intensity = +e.target.value; syncControls(); onParamChange(); });
  $('selAtmo').addEventListener('change', (e) => { params.atmosphere = e.target.value; onParamChange(); });

  $('map').addEventListener('click', (e) => {
    if (params.mode !== 'custom') return;
    const p = FM.clientToMap(e.clientX, e.clientY);
    if (!FM.isLand(p)) { toast('Selecione um ponto em terra.'); return; }
    params.loc = { x: Math.round(p.x), y: Math.round(p.y) };
    onParamChange();
  });

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ---- main buttons ----
  $('btnSim').addEventListener('click', () => { sim.elapsed = 0; playTo(FM.TOTAL); });

  function resetAll() {
    Object.assign(params, { mode: 'historical', loc: { ...FM.HISTORICAL_POINT }, ...FM.DEFAULTS });
    fx = FM.computeEffects(params);
    if ($('modal').open) $('modal').close();
    closeDrawer();
    syncControls();
    resetSim();
  }
  $('btnReset').addEventListener('click', resetAll);

  // ---- presentation mode ----
  function setPresentation(on) {
    pres.active = on;
    document.body.classList.toggle('presentation', on);
    const b = $('btnPresent');
    b.setAttribute('aria-pressed', on);
    b.textContent = on ? 'SAIR DA APRESENTAÇÃO' : 'MODO APRESENTAÇÃO';
    closeDrawer();
    resetSim();
  }
  $('btnPresent').addEventListener('click', () => setPresentation(!pres.active));

  const cur = () => FM.stepIndex(sim.elapsed);
  $('btnNext').addEventListener('click', () => playTo(FM.STEPS[Math.min(cur() + 1, FM.STEPS.length - 1)].end));
  $('btnPrev').addEventListener('click', () => seek(cur() > 0 ? FM.STEPS[cur() - 1].end : 0));
  $('btnPlay').addEventListener('click', () => {
    if (sim.running) { sim.running = false; refresh(); return; }
    if (sim.elapsed >= FM.TOTAL) sim.elapsed = 0;
    playTo(FM.TOTAL);
  });

  document.addEventListener('keydown', (e) => {
    if (!pres.active || $('modal').open) return;
    if (e.key === 'ArrowRight') $('btnNext').click();
    else if (e.key === 'ArrowLeft') $('btnPrev').click();
    else if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); $('btnPlay').click(); }
    else if (e.key === 'Escape') setPresentation(false);
  });

  // ---- modal ----
  $('btnMore').addEventListener('click', () => $('modal').showModal());
  $('btnClose').addEventListener('click', () => $('modal').close());
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').close(); });

  // ---- drawers (small screens) ----
  function openDrawer(id) {
    closeDrawer();
    ui.drawer = id; $(id).classList.add('open'); $('backdrop').classList.add('show');
  }
  function closeDrawer() {
    if (ui.drawer) $(ui.drawer).classList.remove('open');
    ui.drawer = null; $('backdrop').classList.remove('show');
  }
  $('btnControls').addEventListener('click', () => (ui.drawer === 'controls' ? closeDrawer() : openDrawer('controls')));
  $('btnResults').addEventListener('click', () => (ui.drawer === 'results' ? closeDrawer() : openDrawer('results')));
  $('backdrop').addEventListener('click', closeDrawer);

  // ---- view updates ----
  const PHASE_CHIPS = FM.TIMELINE;
  $('phases').innerHTML = PHASE_CHIPS.map((p) => `<li data-id="${p.id}">${p.label}</li>`).join('');
  $('stepDots').innerHTML = FM.STEPS.map(() => '<i></i>').join('');

  function updateChrome() {
    const t = sim.elapsed, ph = FM.phaseAt(t);
    document.body.classList.toggle('running', sim.running);
    document.body.classList.toggle('has-run', t > 0);

    // banner
    const b = $('banner');
    const msg = ph === 'ARMED' ? 'SIMULAÇÃO INICIADA'
      : ph === 'COMPLETE' ? 'SIMULAÇÃO CONCLUÍDA'
      : ph === 'IDLE' ? '' : 'VISUALIZAÇÃO: ' + PHASE_CHIPS.find((p) => p.id === ph).label;
    b.textContent = msg;
    b.classList.toggle('show', !!msg);
    b.classList.toggle('done', ph === 'COMPLETE');
    $('legend').classList.toggle('show', t >= FM.TIMELINE[4].start);

    // phase chips
    const idx = ph === 'IDLE' ? -1 : PHASE_CHIPS.findIndex((p) => p.id === ph);
    $('phases').querySelectorAll('li').forEach((li, i) => {
      li.className = i < idx || ph === 'COMPLETE' ? 'done' : i === idx ? 'current' : '';
    });
    if (ph === 'COMPLETE') $('phases').lastElementChild.className = 'current';

    // simulate button
    const sb = $('btnSim');
    sb.disabled = sim.running;
    sb.textContent = sim.running ? 'EXECUTANDO…' : t >= FM.TOTAL ? 'SIMULAR NOVAMENTE' : 'SIMULAR EVENTO';

    // presentation bar
    if (pres.active) {
      const i = cur(), st = FM.STEPS[i];
      $('stepK').textContent = 'ETAPA ' + String(i + 1).padStart(2, '0');
      $('stepV').textContent = st.title;
      $('stepD').textContent = st.text;
      $('stepDots').querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k <= i));
      $('btnPlay').textContent = sim.running ? 'PAUSAR' : 'REPRODUZIR';
      $('btnPrev').disabled = t <= 0;
      $('btnNext').disabled = i === FM.STEPS.length - 1 && t >= FM.TOTAL;
    }
  }

  function stateOf(p) { return p >= 1 ? ['CONCLUÍDO', 'done'] : p > 0 ? ['EM ANDAMENTO', 'run'] : ['PENDENTE', '']; }

  function updateResults() {
    const body = $('resultsBody');
    if (sim.elapsed <= 0) {
      if (body.dataset.mode !== 'empty') {
        body.dataset.mode = 'empty';
        body.innerHTML = '<div class="empty">Nenhuma simulação executada.</div>';
      }
      return;
    }
    const L = FM.layerProgress(sim.elapsed);
    if (body.dataset.mode !== 'full') {
      body.dataset.mode = 'full';
      const adj = params.mode === 'historical' && params.height === 50 && params.intensity === 50 && params.atmosphere === 'NORMAL';
      const rows = [['Visualização da explosão', 'shock'], ['Visualização térmica', 'thermal'], ['Formação da nuvem', 'cloud'], ['Visualização da área afetada', 'zones']];
      body.innerHTML = `
        <div class="cards">
          <div class="card wide"><div class="k">EVENTO</div><div class="v">Nagasaki — 1945</div></div>
          <div class="card"><div class="k">TIPO DE EVENTO</div><div class="v">Explosão aérea</div></div>
          <div class="card"><div class="k">VISUALIZAÇÃO DE EFEITOS</div><div class="v">Ativada</div></div>
          <div class="card wide"><div class="k">CENÁRIO</div><div class="v">${adj ? 'Referência Histórica' : 'Variação Educativa'}</div></div>
        </div>
        <ul class="indicators">${rows.map(([n, k]) => `<li data-k="${k}"><div class="ind-row"><span>${n}</span><span class="ind-state"></span></div><div class="bar"><i></i></div></li>`).join('')}</ul>
        <p class="disclaimer">Visualização ilustrativa. As zonas são conceituais e não são previsões de danos.</p>`;
    }
    body.querySelectorAll('.indicators li').forEach((li) => {
      const p = L[li.dataset.k], [txt, cls] = stateOf(p);
      const s = li.querySelector('.ind-state'), bar = li.querySelector('.bar i');
      s.textContent = txt; s.className = 'ind-state ' + cls;
      bar.style.width = (p * 100).toFixed(0) + '%'; bar.className = cls === 'done' ? 'done' : '';
    });
  }

  function refresh() {
    FM.render(sim.elapsed, params, fx);
    updateChrome();
    updateResults();
  }

  // ---- boot ----
  FM.mapInit();
  syncControls();
  refresh();
})();
