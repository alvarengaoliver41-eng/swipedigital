// Consultas a la API de Marketing de Meta con la clave del usuario del sistema de la agencia.
// La clave vive en la variable de entorno META_ACCESS_TOKEN (nunca en el código).

const VERSION = process.env.META_API_VERSION || 'v26.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

const ACCION_MENSAJE = 'onsite_conversion.messaging_conversation_started_7d';
const ACCION_COMPRA = 'omni_purchase';
const ACCION_PAGO = 'omni_initiated_checkout';

export class ErrorMeta extends Error {}

function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new ErrorMeta('Falta la variable META_ACCESS_TOKEN en el servidor.');
  return t;
}

async function pedir(ruta, params = {}) {
  const url = new URL(`${BASE}/${ruta}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  url.searchParams.set('access_token', token());
  return pedirUrl(url.toString());
}

async function pedirUrl(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new ErrorMeta(j.error?.message || `Meta respondió ${r.status}`);
  return j;
}

// Recorre todas las páginas de una respuesta (máximo 20 páginas).
async function todas(ruta, params) {
  let j = await pedir(ruta, {limit: 500, ...params});
  const filas = [...(j.data || [])];
  for (let i = 0; i < 20 && j.paging?.next; i++) {
    j = await pedirUrl(j.paging.next);
    filas.push(...(j.data || []));
  }
  return filas;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const accion = (lista, tipo) => num((lista || []).find((a) => a.action_type === tipo)?.value);

// Fecha de ayer en la zona horaria de la cuenta publicitaria (Meta cierra el día en esa zona).
function ayerEn(zona) {
  const hoy = new Intl.DateTimeFormat('en-CA', {timeZone: zona || 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  return sumarDias(hoy, -1);
}
export function sumarDias(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const DIAS_PERIODO = {last_7d: 7, last_14d: 14, last_30d: 30};

// Arma todo lo que el reporte necesita de Meta para una cuenta y un período.
export async function reporteMeta(cuenta, periodo) {
  const act = `act_${String(cuenta).replace(/^act_/, '')}`;
  const dias = DIAS_PERIODO[periodo] || 30;
  const info = await pedir(act, {fields: 'name,currency,timezone_name'});
  const hasta = ayerEn(info.timezone_name);
  const desde = sumarDias(hasta, -(dias - 1));
  const inicio90 = sumarDias(hasta, -89);
  const rango = {since: desde, until: hasta};

  const [diarias, resumen, campanas, anuncios] = await Promise.all([
    todas(`${act}/insights`, {level: 'account', time_increment: 1, time_range: {since: inicio90, until: hasta},
      fields: 'spend,impressions,clicks,inline_link_clicks,actions,action_values'}),
    pedir(`${act}/insights`, {level: 'account', time_range: rango, fields: 'reach,frequency,spend,impressions'}),
    todas(`${act}/insights`, {level: 'campaign', time_range: rango,
      fields: 'campaign_id,campaign_name,spend,impressions,inline_link_clicks,ctr,actions,action_values'}),
    pedir(`${act}/insights`, {level: 'ad', time_range: rango, sort: 'spend_descending', limit: 10,
      fields: 'ad_id,ad_name,campaign_name,spend,impressions,inline_link_clicks,ctr,actions'}),
  ]);

  // Meta omite los días sin actividad: se completa el calendario con ceros.
  const porFecha = new Map(diarias.map((r) => [r.date_start, r]));
  const diario = [];
  for (let i = 0; i < 90; i++) {
    const fecha = sumarDias(inicio90, i);
    const r = porFecha.get(fecha);
    diario.push({
      date_start: fecha,
      amount_spent: r ? num(r.spend) : 0,
      impressions: r ? num(r.impressions) : 0,
      clicks: r ? num(r.clicks) : 0,
      link_click: r ? num(r.inline_link_clicks) : 0,
      mensajes: r ? accion(r.actions, ACCION_MENSAJE) : 0,
      omni_purchase: r ? accion(r.actions, ACCION_COMPRA) : 0,
      omni_purchase_values: r ? accion(r.action_values, ACCION_COMPRA) : 0,
    });
  }

  const r0 = resumen.data?.[0];
  const estados = await estadosDe(act, campanas.map((c) => c.campaign_id), (anuncios.data || []).map((a) => a.ad_id));

  return {
    cuenta: {nombre: info.name, moneda: info.currency, zona: info.timezone_name},
    rango: {desde, hasta},
    diario,
    resumen: r0 ? [{reach: num(r0.reach), frequency: num(r0.frequency)}] : [],
    campanas: campanas
      .map((c) => ({id: c.campaign_id, name: c.campaign_name, effective_status: estados[c.campaign_id] || null, amount_spent: num(c.spend), ...resultado(c)}))
      .filter((c) => c.amount_spent > 0)
      .sort((a, b) => b.amount_spent - a.amount_spent),
    anuncios: (anuncios.data || [])
      .map((a) => ({id: a.ad_id, name: a.ad_name, campaign_name: a.campaign_name, effective_status: estados[a.ad_id] || null,
        amount_spent: num(a.spend), ctr: a.ctr == null ? null : num(a.ctr), ...resultado(a)}))
      .filter((a) => a.amount_spent > 0),
  };
}

// El resultado principal de una campaña o anuncio: conversaciones, compras, pagos iniciados o clics.
function resultado(r) {
  const gasto = num(r.spend);
  const opciones = [
    [accion(r.actions, ACCION_MENSAJE), 'actions:onsite_conversion.messaging_conversation_started_7d'],
    [accion(r.actions, ACCION_COMPRA), 'actions:omni_purchase'],
    [accion(r.actions, ACCION_PAGO), 'actions:offsite_conversion.fb_pixel_initiate_checkout'],
    [num(r.inline_link_clicks), 'actions:link_click'],
  ];
  const [cant, tipo] = opciones.find(([n]) => n > 0) || [0, null];
  return {resultados: cant || null, tipo_resultado: tipo, costo_por_resultado: cant > 0 ? gasto / cant : null};
}

// Estado actual (activa, pausada…) de campañas y anuncios, pedido a la cuenta filtrando por sus IDs.
async function estadosDe(act, campanas, anuncios) {
  const salida = {};
  const buscar = async (tipo, ids) => {
    const unicos = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < unicos.length; i += 50) {
      const lote = unicos.slice(i, i + 50);
      const j = await pedir(`${act}/${tipo}`, {fields: 'id,effective_status', limit: '100',
        filtering: [{field: 'id', operator: 'IN', value: lote}]}).catch((e) => { console.error('estados', tipo, e.message); return {}; });
      for (const f of j.data || []) salida[f.id] = f.effective_status || null;
    }
  };
  await Promise.all([buscar('campaigns', campanas), buscar('ads', anuncios)]);
  return salida;
}
