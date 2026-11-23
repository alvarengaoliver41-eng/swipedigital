// GET /api/anuncio?t=<código del cliente>&ad=<id del anuncio>&formato=feed|historia
// Devuelve la dirección de la vista previa oficial de Meta para ver el anuncio (con su video) desde el reporte.
import {vistaPrevia, ErrorMeta} from './_lib/meta.js';
import {clientePorToken} from './_lib/supabase.js';

const FORMATOS = {feed: 'MOBILE_FEED_STANDARD', historia: 'INSTAGRAM_STORY', reel: 'INSTAGRAM_REELS'};

export default async function handler(req, res) {
  try {
    const ad = String(req.query.ad || '');
    if (!/^[0-9]{5,30}$/.test(ad)) return res.status(400).json({error: 'Anuncio no válido.'});
    const cliente = await clientePorToken(req.query.t);
    if (!cliente) return res.status(404).json({error: 'Reporte no encontrado.'});
    const src = await vistaPrevia(cliente.meta_ad_account_id, ad, FORMATOS[req.query.formato] || FORMATOS.feed);
    if (!src) return res.status(404).json({error: 'Meta no tiene vista previa para este anuncio.'});
    res.setHeader('Cache-Control', 'private, max-age=600');
    return res.status(200).json({src});
  } catch (e) {
    console.error(e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({error: e instanceof ErrorMeta ? e.message : 'No se pudo cargar la vista previa.'});
  }
}
