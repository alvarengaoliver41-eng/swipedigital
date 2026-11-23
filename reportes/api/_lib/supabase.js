// Lecturas de Supabase desde el servidor, con la clave de servicio (nunca se expone al navegador).

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  return {url: url.replace(/\/$/, ''), key};
}

export async function consultar(tabla, filtros) {
  const {url, key} = config();
  const r = await fetch(`${url}/rest/v1/${tabla}?${new URLSearchParams(filtros)}`, {
    headers: {apikey: key, Authorization: `Bearer ${key}`},
  });
  if (!r.ok) throw new Error(`Supabase respondió ${r.status}`);
  return r.json();
}

// Busca el cliente por el código secreto de su link. Solo devuelve clientes activos.
export async function clientePorToken(token) {
  if (!/^[a-zA-Z0-9]{16,64}$/.test(String(token || ''))) return null;
  const filas = await consultar('clientes', {token: `eq.${token}`, activo: 'eq.true', select: 'id,nombre,tipo,logo_url,meta_ad_account_id'});
  return filas[0] || null;
}
