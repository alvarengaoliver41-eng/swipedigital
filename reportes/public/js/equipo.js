// Panel del equipo de swipe digital: inicio de sesión, clientes, ventas por día y metas.
// Escribe directo en Supabase con la sesión del usuario; la base solo deja pasar a quienes están en la tabla "equipo".

const $ = (s) => document.querySelector(s);
const nf0 = new Intl.NumberFormat('es-PY', {maximumFractionDigits: 0});
const gs = (v) => '₲ ' + nf0.format(Math.round(Number(v) || 0));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const mesActual = () => hoyISO().slice(0, 7);
const fechaCorta = (s) => { const [y, m, d] = String(s).split('-').map(Number); return y ? `${d} ${MESES[m - 1].slice(0, 3)} ${y}` : '—'; };
const entero = (s) => { const t = String(s ?? '').trim(); if (t === '') return null; const n = Math.round(Number(t)); return Number.isFinite(n) && n >= 0 ? n : NaN; };
const mostrar = (id, si) => { const e = document.getElementById(id); if (e) e.hidden = !si; };
const msg = (id, texto, tipo) => { const e = document.getElementById(id); if (!e) return; e.textContent = texto || ''; e.className = 'cv-msg' + (tipo ? ' ' + tipo : ''); e.hidden = !texto; };
const avisar = (texto) => { const e = $('#aviso'); e.textContent = texto || ''; e.hidden = !texto; };
const el = (tag, attrs = {}, ...hijos) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null) n.append(h);
  return n;
};
const linkReporte = (c) => `${location.origin}/r/${c.token}`;

let sb = null;
let clientes = [];
let clienteSel = null;
let editando = null;
let logoNuevo; // undefined: sin cambios · null: quitar · File: subir este archivo
const LOGO_MAX = 2 * 1024 * 1024;
const LOGO_TIPOS = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'};

async function iniciar() {
  try {
    const cfg = await (await fetch('/api/config')).json();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Faltan las variables de Supabase en el servidor.');
    // Sin el candado entre pestañas del navegador: si una pestaña queda trabada, no bloquea a las demás.
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth: {lock: async (_nombre, _espera, fn) => fn()}});
  } catch (e) {
    avisar('No se pudo conectar con la base de datos: ' + e.message);
    return;
  }
  // Supabase no deja hacer consultas dentro de este aviso (se traba), por eso se difiere con setTimeout.
  sb.auth.onAuthStateChange((_ev, sesion) => { setTimeout(() => mostrarVista(sesion), 0); });
  const {data} = await sb.auth.getSession();
  mostrarVista(data.session);
}

let vistaUsuario; // undefined al inicio, para que la primera vista siempre se dibuje (también sin sesión)
async function mostrarVista(sesion) {
  const uid = sesion?.user?.id || null;
  if (uid === vistaUsuario) return;
  vistaUsuario = uid;
  ['vista-login', 'vista-sin-permiso', 'vista-panel'].forEach((v) => mostrar(v, false));
  mostrar('sesion', !!sesion);
  if (!sesion) { mostrar('vista-login', true); return; }
  $('#usuario').textContent = sesion.user.email || '';
  const {data, error} = await sb.from('equipo').select('user_id').eq('user_id', uid).maybeSingle();
  if (error || !data) { mostrar('vista-sin-permiso', true); return; }
  mostrar('vista-panel', true);
  $('#mes-actual').textContent = MESES[new Date().getMonth()];
  await cargarClientes();
}

// ===== Inicio y cierre de sesión =====
$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  msg('msg-login', '');
  const f = ev.target;
  const {error} = await sb.auth.signInWithPassword({email: f.elements.email.value.trim(), password: f.elements.password.value});
  if (error) msg('msg-login', 'Correo o contraseña incorrectos.', 'mal');
  else f.reset();
});
$('#btn-salir').addEventListener('click', () => sb.auth.signOut());

// ===== Clientes =====
async function cargarClientes() {
  const mes = mesActual();
  const [c, v, m] = await Promise.all([
    sb.from('clientes').select('*').order('nombre'),
    sb.from('ventas_dia').select('cliente_id,ventas,monto').gte('fecha', mes + '-01'),
    sb.from('metas').select('cliente_id,monto,ventas').eq('mes', mes),
  ]);
  if (c.error) { avisar('No se pudieron leer los clientes: ' + c.error.message); return; }
  avisar('');
  clientes = c.data || [];
  const vendido = {}, metas = {};
  for (const r of v.data || []) { const x = (vendido[r.cliente_id] ||= {monto: 0, ventas: 0}); x.monto += Number(r.monto) || 0; x.ventas += Number(r.ventas) || 0; }
  for (const r of m.data || []) metas[r.cliente_id] = r;
  dibujarClientes(vendido, metas);
  const sel = $('#sel-cliente');
  sel.replaceChildren(...clientes.filter((x) => x.activo).map((x) => el('option', {value: x.id}, x.nombre)));
  if (!clienteSel || !clientes.some((x) => x.id === clienteSel)) clienteSel = sel.options[0]?.value || null;
  if (clienteSel) sel.value = clienteSel;
  mostrar('carga', !!clienteSel);
  await cargarDias();
}

function dibujarClientes(vendido, metas) {
  const lista = $('#lista-clientes');
  if (!clientes.length) { lista.replaceChildren(el('p', {class: 'cv-intro'}, 'Todavía no hay clientes. Agregá el primero.')); return; }
  lista.replaceChildren(...clientes.map((c) => {
    const v = vendido[c.id] || {monto: 0, ventas: 0};
    const meta = metas[c.id];
    const avance = meta ? Math.round((v.monto / meta.monto) * 100) : null;
    const copiar = el('button', {type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(linkReporte(c)); copiar.textContent = 'Link copiado'; } catch { prompt('Copiá el link del reporte:', linkReporte(c)); }
      setTimeout(() => { copiar.textContent = 'Copiar link'; }, 2000);
    }}, 'Copiar link');
    return el('div', {class: 'eq-cli' + (c.activo ? '' : ' inactivo')},
      el('div', {class: 'top'}, el('div', {}, c.logo_url ? el('img', {class: 'logo', src: c.logo_url, alt: c.nombre}) : el('div', {class: 'nom'}, c.nombre), el('div', {class: 'tipo'}, c.tipo === 'ventas' ? 'Ventas web' : 'Conversaciones de WhatsApp')),
        c.activo ? null : el('span', {class: 'tipo'}, 'Inactivo')),
      el('div', {class: 'cifra'}, 'Vendido este mes: ', el('b', {}, gs(v.monto)), ` en ${nf0.format(v.ventas)} ventas`),
      el('div', {class: 'cifra'}, meta ? ['Meta: ', el('b', {}, gs(meta.monto)), ` · ${avance} % cumplido`] : 'Sin meta para este mes'),
      el('div', {class: 'acc'},
        el('button', {type: 'button', onclick: () => elegirCliente(c.id)}, 'Cargar ventas'),
        copiar,
        el('a', {href: linkReporte(c), target: '_blank', rel: 'noopener'}, 'Ver reporte'),
        el('button', {type: 'button', onclick: () => abrirEditor(c)}, 'Editar')));
  }));
}

function elegirCliente(id) {
  clienteSel = id;
  $('#sel-cliente').value = id;
  cargarDias();
  $('#carga').scrollIntoView({behavior: 'smooth', block: 'start'});
}
$('#sel-cliente').addEventListener('change', (ev) => { clienteSel = ev.target.value; cargarDias(); });

// ===== Ventas por día =====
async function cargarDias() {
  const tb = $('#tabla-dias');
  msg('msg-dia', ''); msg('msg-meta', '');
  if (!clienteSel) { tb.replaceChildren(); return; }
  const {data, error} = await sb.from('ventas_dia').select('*').eq('cliente_id', clienteSel).order('fecha', {ascending: false}).limit(60);
  if (error) { tb.replaceChildren(el('tr', {}, el('td', {class: 'msg', colspan: 6}, 'No se pudieron leer las ventas.'))); return; }
  if (!data.length) { tb.replaceChildren(el('tr', {}, el('td', {class: 'msg', colspan: 6}, 'Todavía no hay días cargados para este cliente.'))); }
  else {
    tb.replaceChildren(...data.map((r) => {
      const borrar = el('button', {type: 'button', class: 'cv-link mal', onclick: async () => {
        if (borrar.dataset.seguro !== '1') { borrar.dataset.seguro = '1'; borrar.textContent = '¿Seguro? Borrar'; return; }
        borrar.disabled = true;
        const {error: e} = await sb.from('ventas_dia').delete().eq('cliente_id', clienteSel).eq('fecha', r.fecha);
        if (e) { borrar.disabled = false; borrar.textContent = 'No se pudo borrar'; } else cargarClientes();
      }}, 'Borrar');
      return el('tr', {},
        el('td', {class: 'nom'}, fechaCorta(r.fecha)), el('td', {class: 'n'}, nf0.format(r.ventas)), el('td', {class: 'n'}, gs(r.monto)),
        el('td', {class: 'n'}, r.maximo ? gs(r.maximo) : '—'), el('td', {class: 'sub'}, r.nota || ''),
        el('td', {class: 'n'}, el('button', {type: 'button', class: 'cv-link', onclick: () => editarDia(r)}, 'Editar'), borrar));
    }));
  }
  const fm = $('#form-meta');
  const {data: meta} = await sb.from('metas').select('*').eq('cliente_id', clienteSel).eq('mes', fm.elements.mes.value || mesActual()).maybeSingle();
  fm.elements.monto.value = meta?.monto ?? ''; fm.elements.ventas.value = meta?.ventas ?? '';
}

function editarDia(r) {
  const f = $('#form-dia');
  f.elements.fecha.value = r.fecha; f.elements.ventas.value = r.ventas; f.elements.monto.value = r.monto; f.elements.maximo.value = r.maximo ?? ''; f.elements.nota.value = r.nota || '';
  msg('msg-dia', 'Editando el ' + fechaCorta(r.fecha) + '.');
  f.scrollIntoView({behavior: 'smooth', block: 'center'});
}

$('#form-dia').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const ventas = entero(f.elements.ventas.value), monto = entero(f.elements.monto.value), maximo = entero(f.elements.maximo.value);
  if (!clienteSel || !/^\d{4}-\d{2}-\d{2}$/.test(f.elements.fecha.value) || ventas == null || Number.isNaN(ventas) || monto == null || Number.isNaN(monto) || Number.isNaN(maximo)) {
    msg('msg-dia', 'Revisá la fecha y los números.', 'mal'); return;
  }
  const {error} = await sb.from('ventas_dia').upsert({cliente_id: clienteSel, fecha: f.elements.fecha.value, ventas, monto, maximo: maximo || null,
    nota: f.elements.nota.value.trim() || null, actualizado: new Date().toISOString()}, {onConflict: 'cliente_id,fecha'});
  if (error) { msg('msg-dia', 'No se pudo guardar: ' + error.message, 'mal'); return; }
  f.reset(); f.elements.fecha.value = hoyISO();
  await cargarClientes();
  msg('msg-dia', 'Día guardado.', 'ok');
});

// ===== Meta del mes =====
$('#form-meta').elements.mes.addEventListener('change', () => cargarDias());
$('#form-meta').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const monto = entero(f.elements.monto.value), ventas = entero(f.elements.ventas.value);
  if (!clienteSel || !/^\d{4}-\d{2}$/.test(f.elements.mes.value) || !(monto > 0) || Number.isNaN(ventas)) { msg('msg-meta', 'Revisá el mes y el monto.', 'mal'); return; }
  const {error} = await sb.from('metas').upsert({cliente_id: clienteSel, mes: f.elements.mes.value, monto, ventas: ventas || null, actualizado: new Date().toISOString()}, {onConflict: 'cliente_id,mes'});
  if (error) { msg('msg-meta', 'No se pudo guardar: ' + error.message, 'mal'); return; }
  await cargarClientes();
  msg('msg-meta', 'Meta guardada.', 'ok');
});

// ===== Alta y edición de clientes =====
function abrirEditor(c) {
  editando = c || null;
  const f = $('#form-cliente');
  f.reset();
  $('#titulo-editor').textContent = c ? `Editar ${c.nombre}` : 'Agregar cliente';
  if (c) {
    f.elements.nombre.value = c.nombre; f.elements.slug.value = c.slug; f.elements.meta_ad_account_id.value = c.meta_ad_account_id;
    f.elements.tipo.value = c.tipo; f.elements.activo.checked = !!c.activo;
  }
  logoNuevo = undefined;
  verLogo(c?.logo_url || null);
  mostrar('btn-rotar', !!c);
  const borrar = $('#btn-borrar-cliente');
  borrar.dataset.seguro = ''; borrar.textContent = 'Borrar cliente';
  mostrar('btn-borrar-cliente', !!c);
  msg('msg-cliente', '');
  mostrar('editor-cliente', true);
  $('#editor-cliente').scrollIntoView({behavior: 'smooth', block: 'start'});
}
$('#btn-nuevo-cliente').addEventListener('click', () => abrirEditor(null));
$('#btn-cancelar-cliente').addEventListener('click', () => { editando = null; mostrar('editor-cliente', false); });

function verLogo(src) {
  const caja = $('#logo-vista');
  caja.replaceChildren(src ? el('img', {src, alt: 'Logo'}) : el('span', {}, 'Sin logo'));
  mostrar('btn-quitar-logo', !!src);
}
$('#form-cliente').elements.logo.addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  if (!LOGO_TIPOS[f.type]) { msg('msg-cliente', 'El logo tiene que ser PNG, JPG o WEBP.', 'mal'); return; }
  if (f.size > LOGO_MAX) { msg('msg-cliente', 'El logo pesa más de 2 MB. Achicalo y probá de nuevo.', 'mal'); return; }
  logoNuevo = f;
  msg('msg-cliente', '');
  verLogo(URL.createObjectURL(f));
});
$('#btn-quitar-logo').addEventListener('click', () => { logoNuevo = null; verLogo(null); });

// Sube el logo a Supabase Storage y devuelve su dirección pública.
async function subirLogo(slug, archivo) {
  const ruta = `${slug}-${Date.now()}.${LOGO_TIPOS[archivo.type]}`;
  const {error} = await sb.storage.from('logos').upload(ruta, archivo, {contentType: archivo.type, cacheControl: '31536000'});
  if (error) throw error;
  return sb.storage.from('logos').getPublicUrl(ruta).data.publicUrl;
}
// Borra del almacenamiento un logo que se subió desde el panel (los demás se dejan).
async function borrarLogoViejo(url) {
  const marca = '/storage/v1/object/public/logos/';
  if (!url || !url.includes(marca)) return;
  await sb.storage.from('logos').remove([decodeURIComponent(url.split(marca)[1])]);
}

$('#btn-borrar-cliente').addEventListener('click', async (ev) => {
  const b = ev.target;
  if (!editando) return;
  if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = `¿Seguro? Se borran ${editando.nombre}, sus ventas y metas`; return; }
  b.disabled = true;
  const {error} = await sb.from('clientes').delete().eq('id', editando.id);
  b.disabled = false;
  if (error) { msg('msg-cliente', 'No se pudo borrar: ' + error.message, 'mal'); return; }
  await borrarLogoViejo(editando.logo_url).catch(() => {});
  if (clienteSel === editando.id) clienteSel = null;
  editando = null;
  mostrar('editor-cliente', false);
  await cargarClientes();
});

$('#form-cliente').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const fila = {
    nombre: f.elements.nombre.value.trim(),
    slug: f.elements.slug.value.trim().toLowerCase(),
    meta_ad_account_id: f.elements.meta_ad_account_id.value.trim().replace(/^act_/, ''),
    tipo: f.elements.tipo.value,
    activo: f.elements.activo.checked,
  };
  const logoAnterior = editando?.logo_url || null;
  if (logoNuevo === null) fila.logo_url = null;
  else if (logoNuevo) {
    msg('msg-cliente', 'Subiendo logo…');
    try { fila.logo_url = await subirLogo(fila.slug, logoNuevo); }
    catch (e) { msg('msg-cliente', 'No se pudo subir el logo: ' + e.message, 'mal'); return; }
  }
  const q = editando ? sb.from('clientes').update(fila).eq('id', editando.id) : sb.from('clientes').insert(fila);
  const {error} = await q;
  if (error) { msg('msg-cliente', error.code === '23505' ? 'Ese identificador ya existe.' : 'No se pudo guardar: ' + error.message, 'mal'); return; }
  if (logoNuevo !== undefined && logoAnterior && logoAnterior !== fila.logo_url) await borrarLogoViejo(logoAnterior).catch(() => {});
  logoNuevo = undefined;
  editando = null;
  mostrar('editor-cliente', false);
  msg('msg-cliente', '');
  await cargarClientes();
});

$('#btn-rotar').addEventListener('click', async (ev) => {
  const b = ev.target;
  if (!editando) return;
  if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = '¿Seguro? El link anterior deja de funcionar'; return; }
  b.dataset.seguro = ''; b.textContent = 'Generar link nuevo';
  const {error} = await sb.from('clientes').update({token: crypto.randomUUID().replace(/-/g, '')}).eq('id', editando.id);
  if (error) { msg('msg-cliente', 'No se pudo generar el link: ' + error.message, 'mal'); return; }
  msg('msg-cliente', 'Link nuevo generado. Copialo desde la tarjeta del cliente.', 'ok');
  await cargarClientes();
});

$('#form-dia').elements.fecha.value = hoyISO();
$('#form-meta').elements.mes.value = mesActual();
iniciar();
