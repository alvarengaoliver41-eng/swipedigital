// GET /api/reporte?t=<código del cliente>&periodo=last_7d|last_14d|last_30d
// Devuelve los datos de Meta del cliente. Se guarda en caché 10 minutos para no consultar Meta en cada visita.
import {reporteMeta, DIAS_PERIODO, ErrorMeta} from './_lib/meta.js';
import {clientePorToken} from './_lib/supabase.js';

export default async function handler(req, res) {
  try {
    const periodo = DIAS_PERIODO[req.query.periodo] ? req.query.periodo : 'last_30d';
    const cliente = await clientePorToken(req.query.t);
    if (!cliente) return res.status(404).json({error: 'Reporte no encontrado.'});
    const meta = await reporteMeta(cliente.meta_ad_account_id, periodo);
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({
      cliente: {nombre: cliente.nombre, tipo: cliente.tipo, logo: cliente.logo_url},
      periodo,
      ...meta,
    });
  } catch (e) {
    console.error(e);
    res.setHeader('Cache-Control', 'no-store');
    const msg = e instanceof ErrorMeta ? `No se pudieron traer los datos de Meta: ${e.message}` : 'No se pudo armar el reporte.';
    return res.status(502).json({error: msg});
  }
}
