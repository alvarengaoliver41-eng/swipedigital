// GET /api/ventas?t=<código del cliente>
// Ventas por día (últimos 180 días), metas mensuales y la última lectura del equipo. Sin caché: se ve al instante.
import {clientePorToken, consultar} from './_lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cliente = await clientePorToken(req.query.t);
    if (!cliente) return res.status(404).json({error: 'Reporte no encontrado.'});
    const desde = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
    const mes = new Date().toISOString().slice(0, 7);
    const [ventas, metas, notas] = await Promise.all([
      consultar('ventas_dia', {cliente_id: `eq.${cliente.id}`, fecha: `gte.${desde}`, select: 'fecha,ventas,monto,maximo', order: 'fecha.asc'}),
      consultar('metas', {cliente_id: `eq.${cliente.id}`, select: 'mes,monto,ventas', order: 'mes.desc', limit: '24'}),
      consultar('notas', {cliente_id: `eq.${cliente.id}`, mes: `lte.${mes}`, order: 'mes.desc', limit: '1',
        select: 'mes,hicimos_titulo,hicimos_texto,aprendimos_titulo,aprendimos_texto,proximos_titulo,proximos_texto'}),
    ]);
    return res.status(200).json({
      ventas: ventas.map((v) => ({id: v.fecha, ...v})),
      metas: metas.map((m) => ({id: m.mes, ...m})),
      notas,
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({error: 'No se pudieron leer las ventas.'});
  }
}
