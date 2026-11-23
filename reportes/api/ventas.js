// GET /api/ventas?t=<código del cliente>
// Ventas por día (últimos 180 días) y metas mensuales que carga el equipo. Sin caché: se ve al instante.
import {clientePorToken, consultar} from './_lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cliente = await clientePorToken(req.query.t);
    if (!cliente) return res.status(404).json({error: 'Reporte no encontrado.'});
    const desde = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
    const [ventas, metas] = await Promise.all([
      consultar('ventas_dia', {cliente_id: `eq.${cliente.id}`, fecha: `gte.${desde}`, select: 'fecha,ventas,monto,maximo', order: 'fecha.asc'}),
      consultar('metas', {cliente_id: `eq.${cliente.id}`, select: 'mes,monto,ventas', order: 'mes.desc', limit: '24'}),
    ]);
    return res.status(200).json({
      ventas: ventas.map((v) => ({id: v.fecha, ...v})),
      metas: metas.map((m) => ({id: m.mes, ...m})),
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({error: 'No se pudieron leer las ventas.'});
  }
}
