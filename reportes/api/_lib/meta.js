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

const sumaLista = (lista) => (lista || []).reduce((t, a) => t + num(a.value), 0);
const primero = (...vals) => vals.find((v) => v > 0) || 0;

// Todas las métricas de un período, con nombres en castellano.
const CAMPOS_TOTALES = ['spend', 'impressions', 'reach', 'frequency', 'cpm', 'clicks', 'ctr', 'inline_link_clicks', 'inline_link_click_ctr',
  'cost_per_inline_link_click', 'actions', 'action_values', 'video_play_actions', 'video_thruplay_watched_actions', 'video_p25_watched_actions',
  'video_p50_watched_actions', 'video_p75_watched_actions', 'video_p100_watched_actions', 'video_avg_time_watched_actions'].join(',');
function metricasDe(r) {
  if (!r) return null;
  const a = r.actions, v = r.action_values;
  return {
    inversion: num(r.spend), impresiones: num(r.impressions), alcance: num(r.reach), frecuencia: num(r.frequency), cpm: num(r.cpm),
    clics: num(r.clicks), ctr: num(r.ctr), clics_enlace: num(r.inline_link_clicks), ctr_enlace: num(r.inline_link_click_ctr),
    cpc_enlace: num(r.cost_per_inline_link_click),
    reproducciones_3s: accion(a, 'video_view'), reproducciones: sumaLista(r.video_play_actions), thruplays: sumaLista(r.video_thruplay_watched_actions),
    video_25: sumaLista(r.video_p25_watched_actions), video_50: sumaLista(r.video_p50_watched_actions), video_75: sumaLista(r.video_p75_watched_actions),
    video_100: sumaLista(r.video_p100_watched_actions), video_segundos: sumaLista(r.video_avg_time_watched_actions),
    conversaciones: accion(a, ACCION_MENSAJE), primeras_respuestas: accion(a, 'onsite_conversion.messaging_first_reply'),
    vistas_destino: primero(accion(a, 'omni_landing_page_view'), accion(a, 'landing_page_view')),
    carrito: primero(accion(a, 'omni_add_to_cart'), accion(a, 'add_to_cart')),
    pagos_iniciados: primero(accion(a, ACCION_PAGO), accion(a, 'initiate_checkout')),
    compras: accion(a, ACCION_COMPRA), valor_compras: accion(v, ACCION_COMPRA),
    interacciones: accion(a, 'post_engagement'), reacciones: accion(a, 'post_reaction'), comentarios: accion(a, 'comment'),
    compartidos: accion(a, 'post'), guardados: primero(accion(a, 'onsite_conversion.post_save'), accion(a, 'post_save')),
    seguidores: accion(a, 'onsite_conversion.instagram_profile_follow') || accion(a, 'like'),
  };
}

// Reparto del período por edad y género, por plataforma y por región.
const NOMBRES_PLATAFORMA = {facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network', threads: 'Threads', whatsapp: 'WhatsApp'};
async function segmentosDe(act, rango) {
  const pedirSeg = (breakdowns) => todas(`${act}/insights`, {level: 'account', time_range: rango, breakdowns,
    fields: 'spend,impressions,reach,inline_link_clicks,actions,action_values'}).catch((e) => { console.error('segmentos', breakdowns, e.message); return []; });
  const base = (r) => ({inversion: num(r.spend), impresiones: num(r.impressions), alcance: num(r.reach), clics_enlace: num(r.inline_link_clicks),
    conversaciones: accion(r.actions, ACCION_MENSAJE), compras: accion(r.actions, ACCION_COMPRA)});
  const [edad, plataformas, regiones] = await Promise.all([pedirSeg('age,gender'), pedirSeg('publisher_platform'), pedirSeg('region')]);
  return {
    edad_genero: edad.filter((r) => r.age && r.age !== 'Unknown').map((r) => ({edad: r.age, genero: r.gender, ...base(r)})),
    plataformas: plataformas.map((r) => ({plataforma: NOMBRES_PLATAFORMA[r.publisher_platform] || r.publisher_platform, ...base(r)}))
      .filter((r) => r.impresiones > 0).sort((a, b) => b.inversion - a.inversion),
    regiones: regiones.filter((r) => r.region && r.region !== 'Unknown').map((r) => ({region: r.region, ...base(r)}))
      .filter((r) => r.impresiones > 0).sort((a, b) => b.impresiones - a.impresiones).slice(0, 12),
  };
}

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
  const rangoAnterior = {since: sumarDias(desde, -dias), until: sumarDias(desde, -1)};

  const [diarias, resumen, campanas, anuncios, totalAnterior, segmentos] = await Promise.all([
    todas(`${act}/insights`, {level: 'account', time_increment: 1, time_range: {since: inicio90, until: hasta},
      fields: 'spend,impressions,clicks,inline_link_clicks,actions,action_values'}),
    pedir(`${act}/insights`, {level: 'account', time_range: rango, fields: CAMPOS_TOTALES}),
    todas(`${act}/insights`, {level: 'campaign', time_range: rango,
      fields: 'campaign_id,campaign_name,spend,impressions,inline_link_clicks,ctr,actions,action_values'}),
    pedir(`${act}/insights`, {level: 'ad', time_range: rango, sort: 'spend_descending', limit: 10,
      fields: 'ad_id,ad_name,campaign_name,spend,impressions,inline_link_clicks,ctr,actions'}),
    pedir(`${act}/insights`, {level: 'account', time_range: rangoAnterior, fields: CAMPOS_TOTALES}).catch((e) => { console.error('anterior', e.message); return {}; }),
    segmentosDe(act, rango),
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
  const {estados, medios} = await estadosDe(act, campanas.map((c) => c.campaign_id), (anuncios.data || []).map((a) => a.ad_id));
  const videos = await videosDe((anuncios.data || []).map((a) => medios[a.ad_id]?.video_id));

  return {
    cuenta: {nombre: info.name, moneda: info.currency, zona: info.timezone_name},
    rango: {desde, hasta},
    diario,
    resumen: r0 ? [{reach: num(r0.reach), frequency: num(r0.frequency)}] : [],
    totales: {actual: metricasDe(r0), anterior: metricasDe(totalAnterior.data?.[0])},
    segmentos,
    campanas: campanas
      .map((c) => ({id: c.campaign_id, name: c.campaign_name, effective_status: estados[c.campaign_id] || null, amount_spent: num(c.spend), ...resultado(c)}))
      .filter((c) => c.amount_spent > 0)
      .sort((a, b) => b.amount_spent - a.amount_spent),
    anuncios: (anuncios.data || [])
      .map((a) => {
        const m = medios[a.ad_id] || {};
        const v = (m.video_id && videos[m.video_id]) || {};
        return {id: a.ad_id, name: a.ad_name, campaign_name: a.campaign_name, effective_status: estados[a.ad_id] || null,
          amount_spent: num(a.spend), ctr: a.ctr == null ? null : num(a.ctr), ...resultado(a),
          es_video: !!m.es_video, imagen: (v.portada && !/p(64|160)x/.test(v.portada) ? v.portada : null) || m.imagen || v.portada || null,
          video: v.video || null, duracion: v.duracion || null};
      })
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

// Estado actual (activa, pausada…) de campañas y anuncios, y la pieza de cada anuncio (imagen o video),
// pedidos a la cuenta filtrando por sus IDs.
const CAMPOS_ANUNCIO = 'id,effective_status,creative.thumbnail_width(720).thumbnail_height(720){thumbnail_url,image_url,object_type,video_id}';
const CAMPOS_ANUNCIO_SIMPLE = 'id,effective_status,creative{thumbnail_url,image_url,object_type,video_id}';
async function estadosDe(act, campanas, anuncios) {
  const estados = {}, medios = {};
  const buscar = async (tipo, ids, campos, alternativa) => {
    const unicos = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < unicos.length; i += 50) {
      const lote = unicos.slice(i, i + 50);
      const pedirCon = (f) => pedir(`${act}/${tipo}`, {fields: f, limit: '100', filtering: [{field: 'id', operator: 'IN', value: lote}]});
      const j = await pedirCon(campos)
        .catch((e) => { console.error('estados', tipo, e.message); return alternativa ? pedirCon(alternativa) : {}; })
        .catch((e) => { console.error('estados (simple)', tipo, e.message); return {}; });
      for (const f of j.data || []) {
        estados[f.id] = f.effective_status || null;
        const c = f.creative;
        if (c) medios[f.id] = {es_video: c.object_type === 'VIDEO' || !!c.video_id, video_id: c.video_id || null, imagen: c.image_url || c.thumbnail_url || null};
      }
    }
  };
  await Promise.all([buscar('campaigns', campanas, 'id,effective_status'), buscar('ads', anuncios, CAMPOS_ANUNCIO, CAMPOS_ANUNCIO_SIMPLE)]);
  return {estados, medios};
}

// Dirección del archivo de video (si Meta la da para esta clave) y una portada grande.
async function videosDe(ids) {
  const salida = {};
  await Promise.all([...new Set(ids.filter(Boolean))].slice(0, 6).map(async (id) => {
    const j = await pedir(id, {fields: 'source,picture,length,thumbnails{uri,width,is_preferred}'})
      .catch(() => pedir(id, {fields: 'picture,length'}))
      .catch(() => null);
    if (!j) return;
    const miniaturas = (j.thumbnails?.data || []).slice().sort((a, b) => (b.is_preferred - a.is_preferred) || ((b.width || 0) - (a.width || 0)));
    salida[id] = {video: j.source || null, portada: miniaturas[0]?.uri || j.picture || null, duracion: j.length ? num(j.length) : null};
  }));
  return salida;
}

// Vista previa oficial de Meta de un anuncio (un iframe que muestra el anuncio tal cual, con el video).
export async function vistaPrevia(cuenta, anuncioId, formato) {
  const act = `act_${String(cuenta).replace(/^act_/, '')}`;
  const ad = await pedir(anuncioId, {fields: 'account_id,name'});
  if (`act_${ad.account_id}` !== act) throw new ErrorMeta('El anuncio no es de esta cuenta.');
  const j = await pedir(`${anuncioId}/previews`, {ad_format: formato});
  const html = j.data?.[0]?.body || '';
  const src = (html.match(/src="([^"]+)"/) || [])[1];
  return src ? src.replace(/&amp;/g, '&') : null;
}
