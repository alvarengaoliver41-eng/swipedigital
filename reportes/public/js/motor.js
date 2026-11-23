// Motor mínimo de datos y dibujos del reporte.
// Guarda las fuentes (Meta, ventas, metas), calcula los totales y redibuja cada parte de la página.
(() => {
  const fuentes = {};
  const calcs = {};
  const dibujos = new Map();
  const alCambiar = [];
  const memo = {};
  let params = {periodo: 'last_30d'};

  const estado = (id) => fuentes[id] || {status: 'loading', data: []};

  function data(id) {
    const c = calcs[id];
    if (!c) return estado(id);
    if (memo[id]) return memo[id];
    const entradas = c.inputs.map(estado);
    if (entradas.some((e) => e.status === 'error')) return {status: 'error', data: null};
    if (entradas.some((e) => e.status !== 'ok')) return {status: 'loading', data: null};
    try {
      memo[id] = {status: 'ok', data: c.fn(...entradas.map((e) => e.data))};
    } catch (e) {
      console.error('Cálculo', id, e);
      memo[id] = {status: 'error', data: null};
    }
    return memo[id];
  }

  function dibujar() {
    for (const k of Object.keys(memo)) delete memo[k];
    for (const f of alCambiar) {
      try { f(); } catch (e) { console.error(e); }
    }
    dibujos.forEach((fn, nombre) => {
      document.querySelectorAll(`[data-draw="${nombre}"]`).forEach((el) => {
        if (el.closest('[hidden]')) return;
        try { fn(el); } catch (e) { console.error('Dibujo', nombre, e); }
      });
    });
  }

  let espera;
  window.addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(dibujar, 150);
  });

  window.dash = {
    calc: (id, o) => { calcs[id] = o; },
    loader: () => {},
    draw: (nombre, fn) => { dibujos.set(nombre, fn); },
    onData: (fn) => { alCambiar.push(fn); },
    data,
    params: () => ({...params}),
    setParams: (p) => {
      params = {...params, ...p};
      if (typeof window.cargarDatos === 'function') window.cargarDatos();
    },
    poner: (id, valor) => { fuentes[id] = valor; },
    dibujar,
  };
})();
