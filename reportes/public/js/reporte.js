// Reporte de resultados de swipe digital: cálculos y dibujos.
// Los datos llegan de /api/reporte (Meta) y /api/ventas (ventas y metas que carga el equipo).

// ===== Cálculos =====
dash.calc('kpis', {
  title: 'Totales de Meta del período y del anterior',
  description: 'Suma los días del período elegido y los del mismo número de días justo antes; el alcance y la frecuencia vienen del resumen del período.',
  inputs: ['diario', 'resumen'],
  fn: (diario, resumen) => {
    const dias = ({last_7d: 7, last_14d: 14, last_30d: 30})[dash.params().periodo] || 30;
    const filas = diario.filter((r) => r.date_start).slice().sort((a, b) => (a.date_start < b.date_start ? -1 : 1));
    const actual = filas.slice(-dias), anterior = filas.slice(-2 * dias, -dias);
    const suma = (rows, k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
    const div = (a, b) => (b > 0 ? a / b : null);
    const totales = (rows) => {
      const o = {inversion: suma(rows, 'amount_spent'), clics_enlace: suma(rows, 'link_click'), compras: suma(rows, 'omni_purchase'), valor: suma(rows, 'omni_purchase_values'), mensajes: suma(rows, 'mensajes')};
      o.roas = div(o.valor, o.inversion);
      o.costo_compra = div(o.inversion, o.compras);
      o.costo_mensaje = div(o.inversion, o.mensajes);
      return o;
    };
    const a = totales(actual), b = totales(anterior);
    const r0 = resumen[0] || {};
    const fila = {desde: actual.length ? actual[0].date_start : null, hasta: actual.length ? actual[actual.length - 1].date_start : null,
      alcance: r0.reach == null ? null : Number(r0.reach), frecuencia: r0.frequency == null ? null : Number(r0.frequency)};
    for (const k of Object.keys(a)) { fila[k] = a[k]; fila['cambio_' + k] = a[k] != null && b[k] ? (a[k] - b[k]) / b[k] : null; }
    return [fila];
  },
});

dash.calc('ventas_kpi', {
  title: 'Ventas por WhatsApp del período',
  description: 'Ventas diarias que carga el equipo en las fechas del período, cruzadas con la inversión y las conversaciones de Meta de esos mismos días.',
  inputs: ['ventas', 'diario'],
  fn: (ventas, diario) => {
    const dias = ({last_7d: 7, last_14d: 14, last_30d: 30})[dash.params().periodo] || 30;
    const filas = diario.filter((r) => r.date_start).slice().sort((a, b) => (a.date_start < b.date_start ? -1 : 1));
    const actual = filas.slice(-dias), anterior = filas.slice(-2 * dias, -dias);
    const suma = (rows, k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
    const rango = (rows) => (rows.length ? [rows[0].date_start, rows[rows.length - 1].date_start] : null);
    const enRango = (r) => (r ? ventas.filter((v) => typeof v.fecha === 'string' && v.fecha >= r[0] && v.fecha <= r[1]) : []);
    const ra = rango(actual), rb = rango(anterior);
    const act = enRango(ra), ant = enRango(rb);
    const n = suma(act, 'ventas'), monto = suma(act, 'monto'), nAnt = suma(ant, 'ventas'), montoAnt = suma(ant, 'monto');
    const maximos = act.map((v) => Number(v.maximo)).filter((x) => x > 0);
    const inversion = suma(actual, 'amount_spent'), mensajes = suma(actual, 'mensajes');
    return [{
      ventas: n, monto, ticket: n > 0 ? monto / n : null,
      venta_max: maximos.length ? Math.max(...maximos) : null,
      costo_venta: n > 0 ? inversion / n : null,
      roas_real: inversion > 0 && monto > 0 ? monto / inversion : null,
      tasa_cierre: mensajes > 0 && n > 0 ? (n * 100) / mensajes : null,
      cambio_monto: montoAnt ? (monto - montoAnt) / montoAnt : null,
      cambio_ventas: nAnt ? (n - nAnt) / nAnt : null,
      desde: ra ? ra[0] : null, hasta: ra ? ra[1] : null,
    }];
  },
});

dash.calc('meta_mes', {
  title: 'Avance de la meta del mes',
  description: 'Ventas cargadas en el mes en curso (hasta hoy) frente a la meta del mes, y qué parte del mes ya pasó. En camino: el avance va igual o por delante del calendario; atento: entre 80 % y 100 % del ritmo; a mejorar: por debajo.',
  inputs: ['ventas', 'metas'],
  fn: (ventas, metas) => {
    const hoy = new Date();
    const mes = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const meta = metas.find((m) => m.id === mes || m.mes === mes) || null;
    const delMes = ventas.filter((v) => typeof v.fecha === 'string' && v.fecha.slice(0, 7) === mes);
    const vendido = delMes.reduce((t, v) => t + (Number(v.monto) || 0), 0);
    const n = delMes.reduce((t, v) => t + (Number(v.ventas) || 0), 0);
    const tiempo = hoy.getDate() / diasMes;
    const metaMonto = meta && Number(meta.monto) > 0 ? Number(meta.monto) : null;
    const metaVentas = meta && Number(meta.ventas) > 0 ? Number(meta.ventas) : null;
    const avance = metaMonto ? vendido / metaMonto : null;
    const ritmo = avance == null ? null : avance / tiempo;
    const estado = ritmo == null ? null : ritmo >= 1 ? 'En camino' : ritmo >= 0.8 ? 'Atento' : 'A mejorar';
    return [{mes, vendido, ventas: n, meta_monto: metaMonto, meta_ventas: metaVentas, avance, avance_ventas: metaVentas ? n / metaVentas : null, tiempo, estado}];
  },
});

dash.calc('serie', {
  title: 'Inversión, resultados y ventas por día',
  description: 'Los días del período elegido con la inversión, las conversaciones y compras web de Meta, y lo vendido por WhatsApp que cargó el equipo.',
  inputs: ['diario', 'ventas'],
  fn: (diario, ventas) => {
    const dias = ({last_7d: 7, last_14d: 14, last_30d: 30})[dash.params().periodo] || 30;
    const porDia = new Map(ventas.filter((v) => typeof v.fecha === 'string').map((v) => [v.fecha, v]));
    return diario.filter((r) => r.date_start).slice().sort((a, b) => (a.date_start < b.date_start ? -1 : 1)).slice(-dias)
      .map((r) => {
        const v = porDia.get(r.date_start);
        return {fecha: r.date_start, inversion: Number(r.amount_spent) || 0, mensajes: Number(r.mensajes) || 0, compras: Number(r.omni_purchase) || 0, vendido: v ? Number(v.monto) || 0 : null,
          impresiones: Number(r.impressions) || 0, clics: Number(r.link_click) || 0};
      });
  },
});

dash.calc('destacado', {
  title: 'Anuncio destacado',
  description: 'Entre los anuncios con más inversión, el que más conversaciones o compras trajo; a igualdad, el de menor costo por resultado. La participación es su parte de esos resultados.',
  inputs: ['anuncios'],
  fn: (anuncios) => {
    const validos = anuncios.filter((r) => r.resultados > 0 && r.tipo_resultado && /messaging_conversation_started|purchase/.test(r.tipo_resultado) && !/initiate_checkout/.test(r.tipo_resultado));
    if (!validos.length) return [];
    const total = validos.reduce((t, r) => t + r.resultados, 0);
    const top = validos.slice().sort((a, b) => b.resultados - a.resultados || (a.costo_por_resultado || 0) - (b.costo_por_resultado || 0))[0];
    return [{id: top.id, name: top.name, campaign_name: top.campaign_name, resultados: top.resultados, costo_por_resultado: top.costo_por_resultado,
      amount_spent: top.amount_spent, ctr: top.ctr, participacion: total > 0 ? top.resultados / total : null,
      tipo_resultado: top.tipo_resultado, es_video: top.es_video, imagen: top.imagen, video: top.video, duracion: top.duracion}];
  },
});

// ===== Formatos =====
const C = (window.CLIENTE = {nombre: '—', tipo: 'mensajes', logo: null});
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nf0 = new Intl.NumberFormat('es-PY', {maximumFractionDigits: 0});
const nf1 = new Intl.NumberFormat('es-PY', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const nf2 = new Intl.NumberFormat('es-PY', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const F = {
  gs: (v) => '₲\u00a0' + nf0.format(Math.round(v)),
  n: (v) => nf0.format(Math.round(v)),
  x: (v) => nf1.format(v) + 'x',
  gsx: (v) => '₲\u00a0' + nf1.format(v),
  pct: (v) => nf2.format(v) + ' %',
  pct1: (v) => nf1.format(v) + ' %',
  frac: (v) => nf0.format(Math.round(v * 100)) + ' %',
  uno: (v) => nf1.format(v),
  cambio: (v) => (v > 0 ? '+' : '') + nf0.format(Math.round(v * 100)) + ' %',
  fecha: (s) => { const d = d3.utcParse('%Y-%m-%d')(s); return d ? d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : '—'; },
  corta: (v) => (v >= 1e6 ? nf1.format(v / 1e6) + ' M' : v >= 1e3 ? nf0.format(Math.round(v / 1e3)) + ' mil' : nf0.format(v)),
};
const ESTADOS = {ACTIVE: 'Activa', PAUSED: 'Pausada', CAMPAIGN_PAUSED: 'Campaña pausada', ADSET_PAUSED: 'Conjunto pausado', ARCHIVED: 'Archivada', DELETED: 'Eliminada', WITH_ISSUES: 'Con problemas', DISAPPROVED: 'Rechazada', PENDING_REVIEW: 'En revisión', IN_PROCESS: 'En proceso'};
const tipoResultado = (ind) => {
  if (!ind) return '—';
  if (ind.includes('messaging_conversation_started')) return 'Conversaciones';
  if (ind.includes('initiate_checkout')) return 'Pagos iniciados';
  if (ind.includes('purchase')) return 'Compras web';
  if (ind.includes('lead')) return 'Leads';
  if (ind.includes('link_click')) return 'Clics';
  return ind.split('.').pop().replace(/_/g, ' ');
};
const movimiento = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches);
// El cliente usa la carga de ventas por WhatsApp si el equipo cargó alguna venta o alguna meta.
const hayVentas = () => {
  const v = dash.data('ventas'), m = dash.data('metas');
  return (v.status === 'ok' && v.data.length > 0) || (m.status === 'ok' && m.data.length > 0);
};
const filaDe = (src) => { const d = dash.data(src); return d.status === 'ok' && Array.isArray(d.data) && d.data[0] ? d.data[0] : null; };

// Datos del cliente (nombre, tipo y logo) que llegan con el reporte
const aplicarCliente = () => {
  document.title = `${C.nombre} · Reporte de resultados · swipe digital`;
  document.querySelectorAll('#nombre-cliente').forEach((e) => e.classList.toggle('cv-oculto', !!C.logo));
  document.querySelectorAll('#logo-portada').forEach((e) => { e.hidden = !C.logo; });
};

// ===== Dibujos =====
const valor = (name, src, campo, fmt) => dash.draw(name, (el) => {
  const d = dash.data(src);
  el.classList.toggle('dash-skeleton', d.status === 'loading');
  const fila = filaDe(src);
  const v = fila ? fila[campo] : null;
  if (v == null || v === '') { el.textContent = '—'; return; }
  if (el.classList.contains('cuenta') && movimiento && typeof v === 'number' && el.dataset.animado !== '1') {
    el.dataset.animado = '1';
    const t0 = performance.now();
    const paso = (t) => { const p = Math.min(1, (t - t0) / 1100); el.textContent = fmt(v * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
    return;
  }
  el.textContent = fmt(v);
});
const cambio = (name, src, campo, sentido) => dash.draw(name, (el) => {
  const fila = filaDe(src);
  const v = fila ? fila[campo] : null;
  const linea = el.closest('.cv-chg');
  if (linea) linea.hidden = v == null;
  el.textContent = v == null ? '' : F.cambio(v);
  const bueno = sentido === 'neutro' || v == null || Math.abs(v) < 0.005 ? null : (sentido === 'sube' ? v > 0 : v < 0);
  el.className = bueno == null ? 'neu' : bueno ? 'ok' : 'mal';
});
const dibujarLogo = (el, alto, textoSiNo) => {
  el.replaceChildren();
  if (C.logo) { const i = document.createElement('img'); i.src = C.logo; i.alt = C.nombre; i.style.height = alto + 'px'; el.append(i); }
  else if (textoSiNo) el.textContent = C.nombre;
};

dash.draw('logo-chico', (el) => dibujarLogo(el, 20, true));
dash.draw('logo-grande', (el) => dibujarLogo(el, 72, false));
dash.draw('cliente', (el) => { el.textContent = C.nombre; });
dash.draw('mes-nombre', (el) => { el.textContent = MESES_LARGOS[new Date().getMonth()]; });
valor('desde', 'kpis', 'desde', F.fecha);
const hoyLocal = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
valor('hasta', 'kpis', 'hasta', (v) => (v === hoyLocal() ? 'hoy, ' + F.fecha(v) : F.fecha(v)));
valor('fr-roas', 'ventas_kpi', 'roas_real', F.gsx); valor('fr-cmsj', 'kpis', 'costo_mensaje', F.gs); valor('fr-roasweb', 'kpis', 'roas', F.gsx);

valor('rb-vend', 'ventas_kpi', 'monto', F.gs); cambio('rb-vend-c', 'ventas_kpi', 'cambio_monto', 'sube');
valor('rb-nv', 'ventas_kpi', 'ventas', F.n); cambio('rb-nv-c', 'ventas_kpi', 'cambio_ventas', 'sube');
valor('rb-msj', 'kpis', 'mensajes', F.n); cambio('rb-msj-c', 'kpis', 'cambio_mensajes', 'sube');
valor('rb-web', 'kpis', 'compras', F.n); cambio('rb-web-c', 'kpis', 'cambio_compras', 'sube');
valor('rb-inv', 'kpis', 'inversion', F.gs); cambio('rb-inv-c', 'kpis', 'cambio_inversion', 'neutro');
valor('rb-alc', 'kpis', 'alcance', F.n);
dash.draw('rb-costo', (el) => {
  const f = filaDe('kpis'); const v = f ? f[C.tipo === 'ventas' ? 'costo_compra' : 'costo_mensaje'] : null;
  el.textContent = v == null ? '—' : F.gs(v);
});
dash.draw('rb-costo-c', (el) => {
  const f = filaDe('kpis'); const v = f ? f[C.tipo === 'ventas' ? 'cambio_costo_compra' : 'cambio_costo_mensaje'] : null;
  const linea = el.closest('.cv-chg'); if (linea) linea.hidden = v == null;
  el.textContent = v == null ? '' : F.cambio(v);
  el.className = v == null || Math.abs(v) < 0.005 ? 'neu' : v < 0 ? 'ok' : 'mal';
});

valor('v-roas', 'ventas_kpi', 'roas_real', F.x); valor('v-cpv', 'ventas_kpi', 'costo_venta', F.gs);
valor('v-ticket', 'ventas_kpi', 'ticket', F.gs); valor('v-max', 'ventas_kpi', 'venta_max', F.gs); valor('v-cierre', 'ventas_kpi', 'tasa_cierre', F.pct1);

valor('mm-vend', 'meta_mes', 'vendido', F.gs); valor('mm-vend2', 'meta_mes', 'vendido', F.gs); valor('mm-meta', 'meta_mes', 'meta_monto', F.gs);
valor('mm-pct', 'meta_mes', 'avance', F.frac); valor('mm-tiempo', 'meta_mes', 'tiempo', F.frac);
valor('mm-nv', 'meta_mes', 'ventas', F.n); valor('mm-nmeta', 'meta_mes', 'meta_ventas', F.n);

valor('a-nom', 'destacado', 'name', String); valor('a-camp', 'destacado', 'campaign_name', String);
valor('a-share', 'destacado', 'participacion', F.frac);
valor('a-res', 'destacado', 'resultados', F.n); valor('a-cpr', 'destacado', 'costo_por_resultado', F.gs);
valor('a-inv', 'destacado', 'amount_spent', F.gs); valor('a-ctr', 'destacado', 'ctr', F.pct);

dash.draw('semaforo', (el) => {
  const f = filaDe('meta_mes');
  const e = f ? f.estado : null;
  el.textContent = e || 'Sin meta definida';
  el.className = 'cv-semaforo' + (e === 'En camino' ? ' bien' : e === 'Atento' ? ' atento' : e === 'A mejorar' ? ' mejorar' : '');
});

dash.draw('anillo', (el) => {
  const f = filaDe('meta_mes');
  el.replaceChildren();
  const avance = f && f.avance != null ? f.avance : null;
  const tiempo = f ? f.tiempo : 0;
  const R = 86, L = 2 * Math.PI * R;
  const svg = d3.select(el).append('svg').attr('viewBox', '0 0 200 200').attr('role', 'img')
    .attr('aria-label', avance == null ? 'Sin meta definida para este mes' : `Avance de la meta del mes: ${F.frac(avance)}`);
  const defs = svg.append('defs').append('linearGradient').attr('id', 'grad-meta').attr('x1', '0').attr('y1', '0').attr('x2', '1').attr('y2', '1');
  defs.append('stop').attr('offset', '0').style('stop-color', '#9B72FF');
  defs.append('stop').attr('offset', '1').style('stop-color', 'var(--cl)');
  svg.append('circle').attr('cx', 100).attr('cy', 100).attr('r', R).attr('fill', 'none').attr('stroke', '#24242A').attr('stroke-width', 14);
  if (avance != null) {
    const arco = svg.append('circle').attr('cx', 100).attr('cy', 100).attr('r', R).attr('fill', 'none').attr('stroke', 'url(#grad-meta)')
      .attr('stroke-width', 14).attr('stroke-linecap', 'round').attr('transform', 'rotate(-90 100 100)')
      .attr('stroke-dasharray', `${L} ${L}`);
    const fin = L * (1 - Math.min(1, avance));
    if (movimiento && el.dataset.animado !== '1') { el.dataset.animado = '1'; arco.attr('stroke-dashoffset', L).transition().duration(1200).ease(d3.easeCubicOut).attr('stroke-dashoffset', fin); }
    else arco.attr('stroke-dashoffset', fin);
    const ang = tiempo * 2 * Math.PI - Math.PI / 2;
    svg.append('line').attr('x1', 100 + (R - 13) * Math.cos(ang)).attr('y1', 100 + (R - 13) * Math.sin(ang)).attr('x2', 100 + (R + 13) * Math.cos(ang)).attr('y2', 100 + (R + 13) * Math.sin(ang))
      .attr('stroke', '#FFFFFF').attr('stroke-width', 2).attr('opacity', 0.7);
  }
  const c = document.createElement('div'); c.className = 'centro';
  const p = document.createElement('div'); p.className = 'pct'; p.textContent = avance == null ? '—' : F.frac(avance);
  const s = document.createElement('div'); s.className = 'sub'; s.textContent = avance == null ? 'sin meta' : 'de la meta';
  c.append(p, s); el.append(c);
});

dash.draw('barra-ventas', (el) => {
  const f = filaDe('meta_mes');
  el.replaceChildren();
  if (!f || f.avance_ventas == null) return;
  const i = document.createElement('i'); i.style.width = Math.min(100, f.avance_ventas * 100) + '%';
  const b = document.createElement('b'); b.style.left = Math.min(100, f.tiempo * 100) + '%'; b.title = 'Parte del mes transcurrida';
  el.append(i, b);
});

dash.draw('embudo', (el) => {
  const k = dash.data('kpis');
  el.classList.toggle('dash-skeleton', k.status === 'loading');
  el.replaceChildren();
  const fk = filaDe('kpis'), fv = filaDe('ventas_kpi');
  const vacio = (t) => { const d = document.createElement('div'); d.className = 'cv-empty'; d.textContent = t; el.append(d); };
  if (k.status === 'error') return vacio('No se pudo cargar el recorrido.');
  if (!fk) return;
  const etapas = [
    {t: 'Personas alcanzadas', v: fk.alcance},
    {t: 'Clics para saber más', v: fk.clics_enlace, tasa: 'hizo clic'},
    C.tipo === 'ventas' ? {t: 'Compras web', v: fk.compras, tasa: 'compró en la web'} : {t: 'Conversaciones de WhatsApp', v: fk.mensajes, tasa: 'escribió por WhatsApp'},
    C.tipo !== 'ventas' && hayVentas() ? {t: 'Ventas por WhatsApp', v: fv ? fv.ventas : null, tasa: 'compró'} : null,
  ].filter((e) => e && e.v != null);
  if (!etapas.length || !(etapas[0].v > 0)) return vacio('Sin datos del recorrido en este período.');
  const base = etapas[0].v;
  etapas.forEach((e, i) => {
    if (i > 0) {
      const prev = etapas[i - 1].v;
      const t = document.createElement('div'); t.className = 'cv-emb-tasa';
      t.textContent = prev > 0 ? `↓ ${F.pct1((e.v / prev) * 100)} ${e.tasa}` : '↓';
      el.append(t);
    }
    const fila = document.createElement('div'); fila.className = 'cv-emb-fila' + (i === etapas.length - 1 ? ' ultima' : '');
    const top = document.createElement('div'); top.className = 'cv-emb-top';
    const n = document.createElement('span'); n.className = 'num cv-disp'; n.textContent = F.n(e.v);
    const l = document.createElement('span'); l.className = 'etq cv-mono'; l.textContent = e.t;
    top.append(n, l);
    const barra = document.createElement('div'); barra.className = 'cv-emb-bar';
    const relleno = document.createElement('i'); relleno.style.width = Math.max(4, Math.pow(Math.max(0, e.v) / base, 0.32) * 100) + '%';
    barra.append(relleno);
    fila.append(top, barra);
    el.append(fila);
  });
});

dash.draw('grafico', (el) => {
  const s = dash.data('serie');
  el.classList.toggle('dash-skeleton', s.status === 'loading');
  el.replaceChildren();
  const vacio = (t) => { const d = document.createElement('div'); d.className = 'cv-empty'; d.textContent = t; el.append(d); };
  if (s.status === 'error') return vacio('No se pudo cargar la evolución diaria.');
  if (s.status !== 'ok' || !s.data) { el.textContent = '—'; return; }
  const parse = d3.utcParse('%Y-%m-%d');
  const campo = C.tipo === 'ventas' ? 'compras' : 'mensajes';
  const nomRes = C.tipo === 'ventas' ? 'Compras web' : 'Conversaciones';
  const rows = s.data.map((r) => ({fecha: r.fecha, f: parse(r.fecha), inv: r.inversion, res: r[campo], vend: r.vendido})).filter((r) => r.f);
  if (!rows.length || !d3.sum(rows, (r) => r.inv)) return vacio('No hubo inversión en este período.');
  const W = Math.max(280, el.clientWidth || 600), H = W < 520 ? 240 : 290;
  const yI = d3.scaleLinear().domain([0, d3.max(rows, (r) => Math.max(r.inv, r.vend || 0)) || 1]).nice();
  const yR = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.res) || 1]).nice();
  const ticksI = yI.ticks(4), ticksR = yR.ticks(4).filter(Number.isInteger);
  const ancho = (arr, fmt) => d3.max(arr, (v) => fmt(v).length) * 7 + 14;
  const m = {t: 14, r: Math.max(30, ancho(ticksR, F.n)), b: 30, l: Math.max(44, ancho(ticksI, F.corta))};
  yI.range([H - m.b, m.t]); yR.range([H - m.b, m.t]);
  const x = d3.scaleBand().domain(rows.map((r) => r.fecha)).range([m.l, W - m.r]).padding(rows.length > 20 ? 0.22 : 0.35);
  const cxr = (r) => x(r.fecha) + x.bandwidth() / 2;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').attr('aria-label', `Inversión diaria en barras, lo vendido por WhatsApp y ${nomRes.toLowerCase()} por día en líneas`);
  svg.append('g').selectAll('line').data(ticksI).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', (d) => yI(d)).attr('y2', (d) => yI(d)).attr('stroke', '#1F1F24');
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(yI).tickValues(ticksI).tickFormat(F.corta).tickSize(0).tickPadding(8)).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${W - m.r},0)`).call(d3.axisRight(yR).tickValues(ticksR).tickFormat(F.n).tickSize(0).tickPadding(8)).call((g) => g.select('.domain').remove());
  const cada = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor((W - m.l - m.r) / 64))));
  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues(rows.filter((r, i) => i % cada === 0).map((r) => r.fecha))
      .tickFormat((t) => { const d = parse(t); return d.getUTCDate() + ' ' + MESES[d.getUTCMonth()]; }).tickSize(0).tickPadding(10))
    .call((g) => g.select('.domain').attr('stroke', '#232328'));
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.fecha)).attr('width', x.bandwidth()).attr('y', (r) => yI(r.inv)).attr('height', (r) => Math.max(0, yI(0) - yI(r.inv)))
    .attr('rx', Math.min(3, x.bandwidth() / 3)).attr('fill', '#9B72FF').attr('opacity', 0.85);
  svg.append('path').datum(rows).attr('d', d3.line().x(cxr).y((r) => yR(r.res))).attr('fill', 'none').attr('stroke', '#FFFFFF').attr('stroke-width', 1.6).attr('opacity', 0.8);
  const conVenta = rows.filter((r) => r.vend != null);
  if (conVenta.length) {
    svg.append('path').datum(rows).attr('d', d3.line().defined((r) => r.vend != null).x(cxr).y((r) => yI(r.vend))).attr('fill', 'none').style('stroke', 'var(--cl)').attr('stroke-width', 2.6);
    svg.append('g').selectAll('circle').data(conVenta).join('circle').attr('cx', cxr).attr('cy', (r) => yI(r.vend)).attr('r', 3.4).style('fill', 'var(--cl)');
  }
  const tip = document.createElement('div'); tip.className = 'cv-tip'; tip.hidden = true; el.append(tip);
  const foco = svg.append('rect').attr('fill', 'rgba(255,255,255,0.05)').attr('y', m.t).attr('height', H - m.t - m.b).attr('width', x.step()).style('display', 'none');
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.fecha) - (x.step() - x.bandwidth()) / 2).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
    .on('pointerenter', (ev, r) => {
      foco.style('display', null).attr('x', x(r.fecha) - (x.step() - x.bandwidth()) / 2);
      tip.replaceChildren();
      const lineas = [['t', F.fecha(r.fecha)], ['', 'Inversión: ' + F.gs(r.inv)], ['', 'Vendido: ' + (r.vend == null ? 'sin cargar' : F.gs(r.vend))], ['', nomRes + ': ' + F.n(r.res)]];
      for (const [c, t] of lineas) { const d = document.createElement('div'); if (c) d.className = c; d.textContent = t; tip.append(d); }
      tip.hidden = false;
      const esc = el.clientWidth / W, tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(0, cxr(r) * esc - tw / 2), el.clientWidth - tw) + 'px';
      tip.style.top = Math.max(0, Math.min(yI(r.inv), r.vend != null ? yI(r.vend) : H) * esc - tip.offsetHeight - 10) + 'px';
    })
    .on('pointerleave', () => { tip.hidden = true; foco.style('display', 'none'); });
});

// ===== Piezas (imagen o video de cada anuncio) =====
const nuevo = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
const minutos = (s) => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const iniciales = (n) => String(n || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'AD';

// Tarjeta visual de un anuncio: portada, botón de play si es video, duración y nombre encima.
function pieza(ad, {conNombre = true} = {}) {
  const b = nuevo('button', 'cv-pieza' + (ad.imagen ? '' : ' sin-img'));
  b.type = 'button';
  b.setAttribute('aria-label', `Ver el anuncio ${ad.name || ''}`);
  if (ad.imagen) {
    const img = nuevo('img'); img.src = ad.imagen; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => { img.remove(); b.classList.add('sin-img'); b.prepend(nuevo('span', 'ini cv-disp', iniciales(ad.name))); });
    b.append(img);
  } else b.append(nuevo('span', 'ini cv-disp', iniciales(ad.name)));
  b.append(nuevo('span', 'velo'));
  if (ad.es_video) {
    const play = nuevo('span', 'play'); play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'; b.append(play);
  }
  const chips = nuevo('span', 'chips');
  chips.append(nuevo('span', 'chip cv-mono', ad.es_video ? 'Video' : 'Imagen'));
  if (ad.duracion) chips.append(nuevo('span', 'chip cv-mono', minutos(ad.duracion)));
  b.append(chips);
  if (conNombre) b.append(nuevo('span', 'nombre', ad.name || 'Anuncio'));
  b.addEventListener('click', () => abrirAnuncio(ad));
  return b;
}

// Ventana para ver el anuncio: el video directo si Meta lo da, si no la vista previa oficial de Meta.
let visor = null;
function cerrarVisor() { if (!visor) return; visor.hidden = true; visor.querySelector('.cv-visor-media').replaceChildren(); document.body.classList.remove('cv-sin-scroll'); }
async function abrirAnuncio(ad) {
  if (!visor) {
    visor = nuevo('div', 'cv-visor'); visor.hidden = true; visor.setAttribute('role', 'dialog'); visor.setAttribute('aria-modal', 'true');
    visor.innerHTML = '<div class="cv-visor-caja"><button type="button" class="cv-visor-x" aria-label="Cerrar">×</button><div class="cv-visor-media"></div><div class="cv-visor-info"></div></div>';
    visor.addEventListener('click', (ev) => { if (ev.target === visor || ev.target.closest('.cv-visor-x')) cerrarVisor(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarVisor(); });
    document.querySelector('.cv').append(visor);
  }
  const media = visor.querySelector('.cv-visor-media'), info = visor.querySelector('.cv-visor-info');
  media.replaceChildren(); info.replaceChildren();
  info.append(nuevo('div', 'nom cv-disp', ad.name || 'Anuncio'), nuevo('div', 'camp cv-mono', ad.campaign_name || ''));
  const datos = nuevo('div', 'datos');
  const dato = (k, v) => { const d = nuevo('div'); d.append(nuevo('span', 'k cv-mono', k), nuevo('span', 'v cv-disp', v)); datos.append(d); };
  if (ad.resultados != null) dato(tipoResultado(ad.tipo_resultado), F.n(ad.resultados));
  if (ad.costo_por_resultado != null) dato('Costo por resultado', F.gs(ad.costo_por_resultado));
  if (ad.amount_spent != null) dato('Inversión', F.gs(ad.amount_spent));
  info.append(datos);
  visor.hidden = false; document.body.classList.add('cv-sin-scroll');
  const portada = () => { media.replaceChildren(); const p = pieza(ad, {conNombre: false}); p.disabled = true; media.append(p); };
  if (ad.video) {
    const v = nuevo('video'); v.src = ad.video; v.controls = true; v.autoplay = true; v.playsInline = true; if (ad.imagen) v.poster = ad.imagen;
    v.addEventListener('error', () => cargarVista(ad, media, portada));
    media.append(v);
  } else cargarVista(ad, media, portada);
}
async function cargarVista(ad, media, portada) {
  media.replaceChildren(nuevo('div', 'cv-visor-cargando', 'Cargando el anuncio…'));
  try {
    const r = await fetch(`/api/anuncio?t=${encodeURIComponent(codigo || '')}&ad=${encodeURIComponent(ad.id)}&formato=feed`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.src) throw new Error(j.error || 'Sin vista previa');
    const f = nuevo('iframe'); f.src = j.src; f.title = 'Vista previa del anuncio ' + (ad.name || ''); f.loading = 'lazy';
    f.setAttribute('scrolling', 'no'); f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
    media.replaceChildren(f);
  } catch (e) {
    portada();
    media.append(nuevo('p', 'cv-visor-nota', 'Meta no deja mostrar este anuncio acá. La portada es la del anuncio.'));
  }
}

dash.draw('a-media', (el) => {
  const ad = filaDe('destacado');
  el.replaceChildren();
  if (ad) el.append(pieza(ad, {conNombre: false}));
});

dash.draw('galeria', (el) => {
  const c = dash.data('anuncios');
  el.classList.toggle('dash-skeleton', c.status === 'loading');
  el.replaceChildren();
  if (c.status === 'error') return el.append(nuevo('div', 'cv-empty', 'No se pudieron cargar los anuncios.'));
  if (c.status !== 'ok') return;
  if (!c.data.length) return el.append(nuevo('div', 'cv-empty', 'Sin anuncios con inversión en este período.'));
  const abierta = el.dataset.abierta === '1';
  c.data.forEach((ad, i) => {
    const card = nuevo('article', 'cv-ad');
    if (!abierta && i >= 6) card.hidden = true;
    card.append(pieza(ad));
    const cuerpo = nuevo('div', 'cv-ad-cuerpo');
    const cab = nuevo('div', 'cv-ad-cab');
    cab.append(nuevo('span', 'camp cv-mono', ad.campaign_name || ''));
    if (ad.effective_status) { const sp = nuevo('span', 'cv-pill' + (ad.effective_status === 'ACTIVE' ? ' on' : ''), ESTADOS[ad.effective_status] || ad.effective_status); cab.append(sp); }
    cuerpo.append(cab);
    const datos = nuevo('div', 'cv-ad-datos');
    const dato = (k, v) => { const d = nuevo('div'); d.append(nuevo('span', 'k cv-mono', k), nuevo('span', 'v', v)); datos.append(d); };
    dato(tipoResultado(ad.tipo_resultado), ad.resultados == null ? '—' : F.n(ad.resultados));
    dato('Costo', ad.costo_por_resultado == null ? '—' : F.gs(ad.costo_por_resultado));
    dato('Inversión', ad.amount_spent == null ? '—' : F.gs(ad.amount_spent));
    cuerpo.append(datos);
    card.append(cuerpo);
    el.append(card);
  });
  if (!abierta && c.data.length > 6) {
    const b = nuevo('button', 'cv-mas', `Ver los ${c.data.length} anuncios`); b.type = 'button';
    b.addEventListener('click', () => { el.dataset.abierta = '1'; dash.dibujar(); });
    el.append(b);
  }
});

// ===== Todas las métricas =====
const objDe = (src) => { const d = dash.data(src); return d.status === 'ok' && d.data && !Array.isArray(d.data) ? d.data : null; };
const div0 = (a, b) => (a > 0 && b > 0 ? a / b : null);
const segundos = (v) => nf1.format(v) + ' s';
const svgNS = 'http://www.w3.org/2000/svg';
const ICONOS = {
  alcance: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
  interes: 'M4 3l7 18 2.5-7.5L21 11 4 3z',
  whatsapp: 'M21 11.5a8.4 8.4 0 01-12.5 7.4L3 21l2.1-5.3A8.4 8.4 0 1121 11.5z',
  web: 'M3 4h2l2.4 11h11.2L21 7H6.2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z',
  video: 'M4 5h11a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2zm13 5l5-3v10l-5-3',
  interaccion: 'M12 20s-7-4.4-9.3-8.6C1 8.3 2.9 5 6.2 5c2 0 3.3 1.1 3.8 2 .5-.9 1.8-2 3.8-2 3.3 0 5.2 3.3 3.5 6.4C19 15.6 12 20 12 20z',
};
const icono = (k) => {
  const s = document.createElementNS(svgNS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(svgNS, 'path'); p.setAttribute('d', ICONOS[k]); s.append(p); return s;
};
// Píldora con el cambio frente al período anterior: verde si mejora, rojo si empeora.
const pildora = (v, w, sentido) => {
  if (!(w > 0) || v == null) return null;
  const c = (v - w) / w;
  const plano = Math.abs(c) < 0.005;
  const bueno = sentido === 'neutro' || plano ? null : sentido === 'sube' ? c > 0 : c < 0;
  return nuevo('span', 'cv-pil ' + (bueno == null ? 'neu' : bueno ? 'ok' : 'mal'), (plano ? '= ' : c > 0 ? '↑ ' : '↓ ') + nf0.format(Math.abs(Math.round(c * 100))) + ' %');
};
// Mini gráfico del día a día del período.
const chispa = (valores) => {
  if (!valores.length || !valores.some((v) => v > 0)) return null;
  const W = 300, H = 56, max = Math.max(...valores) || 1, paso = valores.length > 1 ? W / (valores.length - 1) : W;
  const pts = valores.map((v, i) => [i * paso, H - 4 - (v / max) * (H - 10)]);
  const s = document.createElementNS(svgNS, 'svg'); s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('class', 'mx-chispa'); s.setAttribute('aria-hidden', 'true');
  const linea = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = document.createElementNS(svgNS, 'path'); area.setAttribute('d', `${linea} L${W} ${H} L0 ${H} Z`); area.setAttribute('class', 'a');
  const path = document.createElementNS(svgNS, 'path'); path.setAttribute('d', linea); path.setAttribute('class', 'l');
  s.append(area, path); return s;
};
const serieDe = (campo) => { const d = dash.data('serie'); return d.status === 'ok' && d.data ? d.data.map((r) => Number(r[campo]) || 0) : []; };

// Cada bloque: un número principal, una frase que lo explica y métricas de apoyo.
const BLOQUES_M = [
  {id: 'alcance', t: 'Alcance', ancho: true, serie: 'impresiones',
    principal: ['Personas alcanzadas', (m) => m.alcance, F.n, 'sube'],
    frase: (m) => m.frecuencia > 0 ? `Cada persona vio los anuncios ${F.uno(m.frecuencia)} veces en promedio.` : null,
    extras: [['Impresiones', (m) => m.impresiones, F.n, 'sube'], ['Frecuencia', (m) => m.frecuencia, F.uno, 'neutro'], ['Costo por mil impresiones', (m) => m.cpm, F.gs, 'baja']]},
  {id: 'interes', t: 'Interés', serie: 'clics',
    principal: ['Clics en el enlace', (m) => m.clics_enlace, F.n, 'sube'],
    frase: (m) => m.ctr_enlace > 0 ? `De cada 100 personas que vieron un anuncio, ${F.uno(m.ctr_enlace)} tocaron el enlace.` : null,
    extras: [['Costo por clic', (m) => m.cpc_enlace, F.gs, 'baja'], ['CTR del enlace', (m) => m.ctr_enlace, F.pct, 'sube'], ['Clics totales', (m) => m.clics, F.n, 'sube']]},
  {id: 'whatsapp', t: 'WhatsApp', serie: 'mensajes', cond: (m) => m.conversaciones > 0,
    principal: ['Conversaciones iniciadas', (m) => m.conversaciones, F.n, 'sube'],
    frase: (m) => div0(m.inversion, m.conversaciones) ? `Cada conversación costó ${F.gs(m.inversion / m.conversaciones)}.` : null,
    extras: [['Costo por conversación', (m) => div0(m.inversion, m.conversaciones), F.gs, 'baja'], ['Contactos nuevos', (m) => m.primeras_respuestas, F.n, 'sube'],
      ['Por cada 100 clics', (m) => div0(m.conversaciones * 100, m.clics_enlace), F.uno, 'sube']]},
  {id: 'web', t: 'Tienda web', ancho: true, tipo: 'embudo', cond: (m) => m.vistas_destino > 0 || m.compras > 0 || m.carrito > 0,
    principal: ['Compras', (m) => m.compras, F.n, 'sube'],
    frase: (m) => div0(m.valor_compras, m.inversion) ? `Cada ₲ 1 invertido volvió como ₲ ${nf1.format(m.valor_compras / m.inversion)} en compras web.` : null,
    pasos: [['Visitaron la página', (m) => m.vistas_destino], ['Agregaron al carrito', (m) => m.carrito], ['Iniciaron el pago', (m) => m.pagos_iniciados], ['Compraron', (m) => m.compras]],
    extras: [['Valor de las compras', (m) => m.valor_compras, F.gs, 'sube'], ['Retorno (ROAS)', (m) => div0(m.valor_compras, m.inversion), F.x, 'sube'], ['Costo por compra', (m) => div0(m.inversion, m.compras), F.gs, 'baja']]},
  {id: 'video', t: 'Video', ancho: true, tipo: 'retencion', cond: (m) => m.reproducciones_3s > 0 || m.thruplays > 0,
    principal: ['Reproducciones de 3 segundos', (m) => m.reproducciones_3s, F.n, 'sube'],
    frase: (m) => div0(m.reproducciones_3s, m.impresiones) ? `${F.pct1((m.reproducciones_3s / m.impresiones) * 100)} de las veces que apareció, la gente se quedó a mirar.` : null,
    pasos: [['Empezaron', (m) => m.reproducciones_3s], ['25 %', (m) => m.video_25], ['50 %', (m) => m.video_50], ['75 %', (m) => m.video_75], ['Final', (m) => m.video_100]],
    extras: [['ThruPlays', (m) => m.thruplays, F.n, 'sube'], ['Tiempo promedio', (m) => m.video_segundos, segundos, 'sube'], ['Retención al inicio', (m) => div0(m.reproducciones_3s * 100, m.impresiones), F.pct1, 'sube']]},
  {id: 'interaccion', t: 'Interacción', tipo: 'iconos', cond: (m) => m.interacciones > 0,
    principal: ['Interacciones', (m) => m.interacciones, F.n, 'sube'],
    frase: () => 'Reacciones, comentarios, compartidos y guardados.',
    extras: [['Reacciones', (m) => m.reacciones, F.n, 'sube'], ['Comentarios', (m) => m.comentarios, F.n, 'sube'], ['Compartidos', (m) => m.compartidos, F.n, 'sube'], ['Guardados', (m) => m.guardados, F.n, 'sube']]},
];

dash.draw('dias-periodo', (el) => { el.textContent = ({last_7d: 7, last_14d: 14, last_30d: 30})[dash.params().periodo] || 30; });
dash.draw('metricas', (el) => {
  const d = dash.data('totales');
  el.classList.toggle('dash-skeleton', d.status === 'loading');
  el.replaceChildren();
  if (d.status === 'error') return el.append(nuevo('div', 'cv-empty', 'No se pudieron cargar las métricas.'));
  const t = objDe('totales');
  if (!t || !t.actual) return d.status === 'ok' ? el.append(nuevo('div', 'cv-empty', 'Sin datos en este período.')) : null;
  const a = t.actual, b = t.anterior || null;
  for (const g of BLOQUES_M) {
    if (g.cond && !g.cond(a)) continue;
    const [pEtq, pFn, pFmt, pSent] = g.principal;
    const pv = pFn(a);
    if (!(pv > 0) && !g.pasos) continue;
    const card = nuevo('article', 'mx mx-' + g.id + (g.ancho ? ' ancho' : ''));
    const cab = nuevo('div', 'mx-cab'); const ic = nuevo('span', 'mx-ico'); ic.append(icono(g.id)); cab.append(ic, nuevo('span', 'mx-t cv-mono', g.t)); card.append(cab);
    const cuerpo = nuevo('div', 'mx-cuerpo');
    const hero = nuevo('div', 'mx-hero');
    const fila = nuevo('div', 'mx-num'); fila.append(nuevo('span', 'mx-v cv-disp', pv > 0 ? pFmt(pv) : '0')); const pp = pildora(pv, b && pFn(b), pSent); if (pp) fila.append(pp);
    hero.append(fila, nuevo('div', 'mx-lbl', pEtq));
    const fr = g.frase && g.frase(a); if (fr) hero.append(nuevo('p', 'mx-frase', fr));
    const ch = g.serie ? chispa(serieDe(g.serie)) : null; if (ch) hero.append(ch);
    cuerpo.append(hero);
    // Visual propio del bloque: embudo de la tienda o retención del video
    if (g.pasos) {
      const vals = g.pasos.map(([e, fn]) => ({e, v: fn(a) || 0})).filter((p, i) => p.v > 0 || i === 0);
      const max = Math.max(...vals.map((p) => p.v)) || 1;
      const vis = nuevo('div', 'mx-pasos ' + g.tipo);
      vals.forEach((p, i) => {
        const f = nuevo('div', 'paso');
        const top = nuevo('div', 'top'); top.append(nuevo('span', 'e', p.e), nuevo('span', 'n', F.n(p.v)));
        const bar = nuevo('div', 'bar'); const fill = nuevo('i'); fill.style.width = Math.max(2, (p.v / max) * 100) + '%'; bar.append(fill);
        f.append(top, bar);
        if (i > 0 && vals[i - 1].v > 0) f.append(nuevo('span', 'tasa cv-mono', g.tipo === 'retencion' ? F.frac(p.v / vals[0].v) + ' sigue' : F.frac(p.v / vals[i - 1].v) + ' avanzó'));
        vis.append(f);
      });
      cuerpo.append(vis);
    }
    card.append(cuerpo);
    const minis = g.extras.map(([e, fn, fmt, sent]) => ({e, v: fn(a), w: b ? fn(b) : null, fmt, sent})).filter((x) => x.v != null && x.v > 0);
    if (minis.length) {
      const grid = nuevo('div', 'mx-minis' + (g.tipo === 'iconos' ? ' iconos' : ''));
      for (const x of minis) {
        const m = nuevo('div', 'mx-mini');
        m.append(nuevo('span', 'e', x.e));
        const vv = nuevo('div', 'vv'); vv.append(nuevo('span', 'v', x.fmt(x.v))); const px = pildora(x.v, x.w, x.sent); if (px) vv.append(px);
        m.append(vv); grid.append(m);
      }
      card.append(grid);
    }
    el.append(card);
  }
});

// ===== Audiencia =====
const metricaAud = () => {
  const s = objDe('segmentos');
  const todos = s ? [...(s.edad_genero || []), ...(s.plataformas || [])] : [];
  const suma = (k) => todos.reduce((t, r) => t + (r[k] || 0), 0);
  if (C.tipo !== 'ventas' && suma('conversaciones') > 0) return ['conversaciones', 'conversaciones'];
  if (suma('compras') > 0) return ['compras', 'compras web'];
  if (suma('clics_enlace') > 0) return ['clics_enlace', 'clics en el enlace'];
  return ['impresiones', 'impresiones'];
};
const SINGULAR = {conversaciones: 'conversación', 'compras web': 'compra web', 'clics en el enlace': 'clic en el enlace', impresiones: 'impresión'};
const POR_UNO = {conversaciones: 'por conversación', compras: 'por compra', clics_enlace: 'por clic'};
const cantidad = (n, nombre) => `${F.n(n)} ${Math.round(n) === 1 ? SINGULAR[nombre] || nombre : nombre}`;
const ZONAS = {'asuncion': 'Asunción', 'alto parana': 'Alto Paraná', 'itapua': 'Itapúa', 'paraguari': 'Paraguarí', 'caaguazu': 'Caaguazú', 'caazapa': 'Caazapá',
  'concepcion': 'Concepción', 'guaira': 'Guairá', 'neembucu': 'Ñeembucú', 'boqueron': 'Boquerón', 'canindeyu': 'Canindeyú'};
const zona = (r) => { const base = String(r || '').replace(/ Department$/i, '').trim(); const k = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return ZONAS[k] || base; };
const COLORES_PLAT = {Instagram: '#B79BFF', Facebook: '#6E8BFF', Messenger: '#4FD1C5', 'Audience Network': '#F5C451', Threads: '#E9E6F2', WhatsApp: '#5BD69B'};
const vacioAud = (el) => el.append(nuevo('div', 'cv-empty chico', 'Meta no tiene este dato para el período.'));
const edadTxt = (e) => String(e).replace('-', ' a ').replace('65+', '65 o más');

dash.draw('aud-metrica', (el) => { el.textContent = 'Según ' + metricaAud()[1]; });

// Conclusiones rápidas arriba de la sección
dash.draw('aud-claves', (el) => {
  el.replaceChildren();
  const s = objDe('segmentos'); if (!s) return;
  const [k, nombre] = metricaAud();
  const claves = [];
  const eg = (s.edad_genero || []).filter((r) => (r.genero === 'female' || r.genero === 'male') && r[k] > 0);
  const totEg = eg.reduce((t, r) => t + r[k], 0);
  if (eg.length) {
    const top = eg.slice().sort((a, b) => b[k] - a[k])[0];
    claves.push(['Público que más respondió', `${top.genero === 'female' ? 'Mujeres' : 'Hombres'} de ${edadTxt(top.edad)}`, `${F.frac(top[k] / totEg)} de las ${nombre}`]);
  }
  const pl = (s.plataformas || []).filter((r) => r[k] > 0 && r.inversion > 0);
  if (pl.length > 1 && k !== 'impresiones') {
    const barata = pl.slice().sort((a, b) => a.inversion / a[k] - b.inversion / b[k])[0];
    claves.push(['Plataforma más rendidora', barata.plataforma, `${F.gs(barata.inversion / barata[k])} ${POR_UNO[k] || ''}`]);
  } else if (pl.length) claves.push(['Plataforma principal', pl[0].plataforma, `${F.frac(div0(pl[0].inversion, pl.reduce((t, r) => t + r.inversion, 0)) || 0)} de la inversión`]);
  const rg = (s.regiones || []).filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k]);
  const totRg = rg.reduce((t, r) => t + r[k], 0);
  if (rg.length) claves.push(['Zona principal', zona(rg[0].region), `${F.frac(rg[0][k] / totRg)} de las ${nombre}`]);
  for (const [t, v, sub] of claves) {
    const c = nuevo('div', 'cv-clave');
    c.append(nuevo('span', 't cv-mono', t), nuevo('span', 'v cv-disp', v), nuevo('span', 's', sub));
    el.append(c);
  }
});

// Pirámide: mujeres a la izquierda, hombres a la derecha, edades al centro
dash.draw('aud-edad', (el) => {
  el.replaceChildren();
  const s = objDe('segmentos'); if (!s) return;
  const [k] = metricaAud();
  const filas = (s.edad_genero || []).filter((r) => r.genero === 'female' || r.genero === 'male');
  const total = filas.reduce((t, r) => t + (r[k] || 0), 0);
  if (!total) return vacioAud(el);
  const edades = [...new Set(filas.map((r) => r.edad))].sort();
  const val = (e, g) => { const r = filas.find((x) => x.edad === e && x.genero === g); return r ? r[k] || 0 : 0; };
  const max = Math.max(...filas.map((r) => r[k] || 0)) || 1;
  const muj = filas.filter((r) => r.genero === 'female').reduce((t, r) => t + (r[k] || 0), 0);
  const cab = nuevo('div', 'pir-cab');
  const lado = (clase, nombre, v) => { const d = nuevo('div', 'lado ' + clase); d.append(nuevo('span', 'p cv-disp', F.frac(v / total)), nuevo('span', 'n cv-mono', nombre)); return d; };
  cab.append(lado('f', 'Mujeres', muj), lado('m', 'Hombres', total - muj));
  el.append(cab);
  const topV = max;
  const pir = nuevo('div', 'cv-pir');
  for (const e of edades.slice().reverse()) {
    const fila = nuevo('div', 'pir-fila');
    for (const [g, clase] of [['female', 'f'], ['male', 'm']]) {
      const v = val(e, g);
      const lado = nuevo('div', 'pir-lado ' + clase);
      const bar = nuevo('span', 'pir-bar' + (v === topV ? ' top' : '')); bar.style.width = Math.max(v > 0 ? 3 : 0, (v / max) * 100) + '%';
      const n = nuevo('span', 'pir-n', v > 0 ? F.frac(v / total) : '');
      if (clase === 'f') lado.append(n, bar); else lado.append(bar, n);
      fila.append(lado);
      if (clase === 'f') fila.append(nuevo('span', 'pir-edad cv-mono', e));
    }
    pir.append(fila);
  }
  el.append(pir);
});

// Plataformas: una barra repartida y una tarjeta por plataforma
dash.draw('aud-plat', (el) => {
  el.replaceChildren();
  const s = objDe('segmentos'); if (!s) return;
  const [k, nombre] = metricaAud();
  const filas = (s.plataformas || []).filter((r) => r.inversion > 0 || r[k] > 0);
  const inv = filas.reduce((t, r) => t + r.inversion, 0);
  if (!filas.length || !inv) return vacioAud(el);
  const costos = filas.map((r) => div0(r.inversion, r[k])).filter(Boolean);
  const minCosto = k !== 'impresiones' && costos.length > 1 ? Math.min(...costos) : null;
  const reparto = nuevo('div', 'plat-reparto');
  for (const r of filas) { const seg = nuevo('span'); seg.style.flex = String(r.inversion / inv); seg.style.background = COLORES_PLAT[r.plataforma] || '#8E8E96'; seg.title = r.plataforma; reparto.append(seg); }
  el.append(reparto);
  const lista = nuevo('div', 'plat-lista');
  for (const r of filas) {
    const c = nuevo('div', 'plat');
    const cab = nuevo('div', 'cab');
    const punto = nuevo('i'); punto.style.background = COLORES_PLAT[r.plataforma] || '#8E8E96';
    const nom = nuevo('span', 'nom'); nom.append(punto, document.createTextNode(r.plataforma));
    cab.append(nom, nuevo('span', 'pct cv-disp', F.frac(r.inversion / inv)));
    c.append(cab);
    const datos = nuevo('div', 'datos');
    datos.append(nuevo('span', '', cantidad(r[k] || 0, nombre)));
    const costo = div0(r.inversion, r[k]);
    if (costo && k !== 'impresiones') datos.append(nuevo('span', costo === minCosto ? 'mejor' : '', `${F.gs(costo)} ${POR_UNO[k] || ''}`));
    c.append(datos);
    if (costo && costo === minCosto) c.append(nuevo('span', 'sello cv-mono', 'Más rendidora'));
    lista.append(c);
  }
  el.append(lista);
});

// Zonas: ranking con posición, barra y porcentaje
dash.draw('aud-reg', (el) => {
  el.replaceChildren();
  const s = objDe('segmentos'); if (!s) return;
  const [k] = metricaAud();
  const todas = (s.regiones || []).filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k]);
  const filas = todas.slice(0, 7);
  if (!filas.length) return vacioAud(el);
  const max = filas[0][k], total = todas.reduce((t, r) => t + r[k], 0);
  filas.forEach((r, i) => {
    const fila = nuevo('div', 'reg' + (i === 0 ? ' uno' : ''));
    fila.append(nuevo('span', 'pos cv-mono', String(i + 1)));
    const medio = nuevo('div', 'medio');
    const cab = nuevo('div', 'cab'); cab.append(nuevo('span', 'nom', zona(r.region)), nuevo('span', 'pct cv-disp', F.frac(r[k] / total)));
    const bar = nuevo('div', 'bar'); const fill = nuevo('i'); fill.style.width = Math.max(2, (r[k] / max) * 100) + '%'; bar.append(fill);
    medio.append(cab, bar);
    fila.append(medio);
    el.append(fila);
  });
  if (todas.length > filas.length) el.append(nuevo('p', 'reg-resto', `Y ${todas.length - filas.length} zonas más con el ${F.frac(todas.slice(7).reduce((t, r) => t + r[k], 0) / total)} restante.`));
});

// ===== Descargar en PDF =====
document.querySelectorAll('#btn-pdf').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.cv-galeria').forEach((g) => { g.dataset.abierta = '1'; });
  dash.dibujar();
  setTimeout(() => window.print(), 300);
}));

// ===== Lectura del equipo =====
const notaActual = () => { const d = dash.data('notas'); return d.status === 'ok' && Array.isArray(d.data) && d.data[0] ? d.data[0] : null; };
const BLOQUES = [['hicimos', 'Lo que hicimos'], ['aprendimos', 'Lo que aprendimos'], ['proximos', 'Próximos pasos']];
const notaTiene = (n) => !!n && BLOQUES.some(([k]) => (n[k + '_titulo'] || '').trim() || (n[k + '_texto'] || '').trim());
dash.draw('notas', (el) => {
  const n = notaActual();
  el.replaceChildren();
  if (!notaTiene(n)) return;
  for (const [k, nombre] of BLOQUES) {
    const titulo = (n[k + '_titulo'] || '').trim(), texto = (n[k + '_texto'] || '').trim();
    if (!titulo && !texto) continue;
    const card = document.createElement('div'); card.className = 'cv-nota';
    const kk = document.createElement('div'); kk.className = 'k cv-mono'; kk.textContent = nombre; card.append(kk);
    if (titulo) { const h = document.createElement('h3'); h.textContent = titulo; card.append(h); }
    for (const parrafo of texto.split(/\n+/).filter(Boolean)) { const p = document.createElement('p'); p.textContent = parrafo; card.append(p); }
    el.append(card);
  }
  el.dataset.cantidad = el.children.length;
});
dash.draw('notas-mes', (el) => {
  const n = notaActual();
  const [y, m] = n ? String(n.mes).split('-').map(Number) : [];
  el.textContent = m ? ` · ${MESES_LARGOS[m - 1]} ${y}` : '';
});

// ===== Tablas =====
const celda = (tr, texto, clase, etiqueta) => { const td = document.createElement('td'); if (clase) td.className = clase; if (etiqueta) td.dataset.label = etiqueta; td.textContent = texto; tr.append(td); return td; };
const filaMensaje = (tb, cols, texto) => { const tr = document.createElement('tr'); const td = celda(tr, texto, 'msg'); td.colSpan = cols; tb.append(tr); };
const estado = (tr, st) => { const td = document.createElement('td'); td.className = 'est'; const sp = document.createElement('span'); sp.className = 'cv-pill' + (st === 'ACTIVE' ? ' on' : ''); sp.textContent = ESTADOS[st] || st || '—'; td.append(sp); tr.append(td); };

// En tablas largas se muestran las primeras 5 filas y un botón para ver el resto.
const recortar = (tb, total) => {
  const wrap = tb.closest('.cv-tablewrap');
  wrap.querySelector('.cv-mas')?.remove();
  if (total <= 6 || wrap.dataset.abierta === '1') return;
  [...tb.children].slice(5).forEach((tr) => { tr.hidden = true; });
  const b = document.createElement('button'); b.type = 'button'; b.className = 'cv-mas';
  b.textContent = `Ver las ${total} filas`;
  b.addEventListener('click', () => { wrap.dataset.abierta = '1'; [...tb.children].forEach((tr) => { tr.hidden = false; }); b.remove(); });
  wrap.append(b);
};

// La columna "Estado" se oculta si Meta no devolvió el estado de ninguna fila.
const columnaEstado = (tb, filas) => {
  const hay = filas.some((r) => r.effective_status);
  tb.closest('table').classList.toggle('sin-estado', !hay);
  return hay;
};

dash.draw('tb-anuncios', (tb) => {
  const c = dash.data('anuncios');
  tb.replaceChildren();
  if (c.status === 'error') return filaMensaje(tb, 6, 'No se pudieron cargar los anuncios.');
  if (c.status !== 'ok') return filaMensaje(tb, 6, 'Cargando anuncios…');
  if (!c.data.length) return filaMensaje(tb, 6, 'Sin anuncios con inversión en este período.');
  const conEstado = columnaEstado(tb, c.data);
  for (const r of c.data) {
    const tr = document.createElement('tr'); tr.dataset.key = r.id;
    celda(tr, r.name || '—', 'nom'); if (conEstado) estado(tr, r.effective_status);
    celda(tr, r.amount_spent == null ? '—' : F.gs(r.amount_spent), 'n', 'Inversión');
    celda(tr, r.resultados == null ? '—' : F.n(r.resultados), 'n', 'Resultados');
    celda(tr, r.costo_por_resultado == null ? '—' : F.gs(r.costo_por_resultado), 'n', 'Costo por resultado');
    celda(tr, r.ctr == null ? '—' : F.pct(r.ctr), 'n', 'CTR');
    tb.append(tr);
  }
  recortar(tb, c.data.length);
});

dash.draw('tb-campanas', (tb) => {
  const c = dash.data('campanas');
  tb.replaceChildren();
  if (c.status === 'error') return filaMensaje(tb, 6, 'No se pudieron cargar las campañas.');
  if (c.status !== 'ok') return filaMensaje(tb, 6, 'Cargando campañas…');
  if (!c.data.length) return filaMensaje(tb, 6, 'Sin campañas con inversión en este período.');
  const conEstado = columnaEstado(tb, c.data);
  for (const r of c.data) {
    const tr = document.createElement('tr'); tr.dataset.key = r.id;
    celda(tr, r.name || '—', 'nom'); if (conEstado) estado(tr, r.effective_status);
    celda(tr, r.amount_spent == null ? '—' : F.gs(r.amount_spent), 'n', 'Inversión');
    celda(tr, r.resultados == null ? '—' : F.n(r.resultados), 'n', 'Resultados');
    celda(tr, tipoResultado(r.tipo_resultado), 'sub', 'Tipo');
    celda(tr, r.costo_por_resultado == null ? '—' : F.gs(r.costo_por_resultado), 'n', 'Costo por resultado');
    tb.append(tr);
  }
  recortar(tb, c.data.length);
});

// ===== Controles y qué se muestra =====
document.querySelectorAll('#sel-periodo').forEach((s) => s.addEventListener('change', () => dash.setParams({periodo: s.value})));
dash.onData(() => {
  const p = dash.params();
  document.querySelectorAll('#sel-periodo').forEach((s) => { if (document.activeElement !== s && p.periodo) s.value = p.periodo; });
  document.querySelectorAll('.cv [data-tipo]').forEach((e) => { e.hidden = e.dataset.tipo !== C.tipo; });
  const fk = filaDe('kpis'), fv = filaDe('ventas_kpi'), fm = filaDe('meta_mes');
  let frase = null;
  if (fk && !(fk.inversion > 0)) frase = 'vacio';
  else if (fv && fv.roas_real != null) frase = 'roas';
  else if (C.tipo === 'ventas' && fk && fk.roas > 0) frase = 'web';
  else if (fk && fk.costo_mensaje != null) frase = 'mensajes';
  document.querySelectorAll('.cv [data-frase]').forEach((e) => { e.hidden = e.dataset.frase !== frase; });
  const conMeta = !!(fm && fm.meta_monto);
  document.querySelectorAll('.cv [data-con-meta]').forEach((e) => { e.hidden = !conMeta; });
  document.querySelectorAll('.cv [data-con-meta-n]').forEach((e) => { e.hidden = !(fm && fm.meta_ventas); });
  document.querySelectorAll('.cv [data-sin-meta]').forEach((e) => { e.hidden = conMeta || !fm; });
  const conVentas = hayVentas();
  const ventasListas = dash.data('ventas').status !== 'loading';
  document.querySelectorAll('.cv [data-ventas]').forEach((e) => { e.hidden = ventasListas && !conVentas; });
  document.querySelectorAll('.cv [data-sin-ventas]').forEach((e) => { e.hidden = !ventasListas || conVentas; });
  document.querySelectorAll('.cv-meta').forEach((e) => e.classList.toggle('sin-meta', !conMeta));
  const tarjetas = {'v-retorno': 'roas_real', 'v-costo': 'costo_venta', 'v-ticket': 'ticket', 'v-maxima': 'venta_max', 'v-cierre': 'tasa_cierre'};
  for (const [id, campo] of Object.entries(tarjetas)) document.querySelectorAll('#' + id).forEach((e) => { e.hidden = !!fv && fv[campo] == null; });
  document.querySelectorAll('#lectura-equipo').forEach((e) => { e.hidden = !notaTiene(notaActual()); });
  const seg = objDe('segmentos');
  const haySeg = !!seg && ['edad_genero', 'plataformas', 'regiones'].some((k) => (seg[k] || []).length);
  document.querySelectorAll('#audiencia').forEach((e) => { e.hidden = dash.data('segmentos').status === 'ok' && !haySeg; });
  if (seg) {
    document.querySelectorAll('#aud-regiones').forEach((e) => { e.hidden = !(seg.regiones || []).length; });
    document.querySelectorAll('#aud-edad').forEach((e) => { e.hidden = !(seg.edad_genero || []).length; });
  }
  let num = 0;
  document.querySelectorAll('.cv-sec').forEach((sec) => { const n = sec.querySelector('.cv-num'); if (n && !sec.hidden) n.textContent = String(++num).padStart(2, '0'); });
  document.querySelectorAll('#lectura-equipo .cv-label').forEach((e) => { if (e.firstChild && e.firstChild.nodeType === 3) e.firstChild.textContent = String(num + 1).padStart(2, '0') + ' · Lectura del equipo'; });
  const d = dash.data('destacado');
  document.querySelectorAll('#anuncio-estrella').forEach((e) => { e.hidden = d.status === 'ok' && Array.isArray(d.data) && d.data.length === 0; });
});

// ===== Carga de datos =====
const codigo = (() => {
  const q = new URLSearchParams(location.search).get('t');
  if (q) return q;
  const partes = location.pathname.split('/').filter(Boolean);
  return partes[0] === 'r' ? partes[1] : null;
})();
const avisar = (texto) => document.querySelectorAll('#aviso').forEach((e) => { e.textContent = texto || ''; e.hidden = !texto; });
const META = ['diario', 'resumen', 'campanas', 'anuncios', 'totales', 'segmentos'];

window.cargarDatos = async () => {
  const periodo = dash.params().periodo;
  META.forEach((id) => dash.poner(id, {status: 'loading', data: []}));
  dash.dibujar();
  try {
    const r = await fetch(`/api/reporte?t=${encodeURIComponent(codigo || '')}&periodo=${periodo}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo cargar el reporte.');
    if (periodo !== dash.params().periodo) return;
    Object.assign(C, {nombre: j.cliente.nombre, tipo: j.cliente.tipo, logo: j.cliente.logo || null});
    aplicarCliente();
    META.forEach((id) => dash.poner(id, {status: 'ok', data: j[id] || []}));
    avisar('');
  } catch (e) {
    META.forEach((id) => dash.poner(id, {status: 'error', data: []}));
    avisar(e.message);
  }
  dash.dibujar();
};

const cargarVentas = async () => {
  try {
    const r = await fetch(`/api/ventas?t=${encodeURIComponent(codigo || '')}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudieron cargar las ventas.');
    dash.poner('ventas', {status: 'ok', data: j.ventas || []});
    dash.poner('metas', {status: 'ok', data: j.metas || []});
    dash.poner('notas', {status: 'ok', data: j.notas || []});
  } catch (e) {
    dash.poner('ventas', {status: 'error', data: []});
    dash.poner('metas', {status: 'error', data: []});
    dash.poner('notas', {status: 'error', data: []});
  }
  dash.dibujar();
};

if (!codigo) avisar('Este link de reporte no es válido. Pedile a swipe digital el link correcto.');
else { window.cargarDatos(); cargarVentas(); }
