// GET /api/config: datos públicos que necesita el panel del equipo para iniciar sesión en Supabase.
// La "anon key" es pública por diseño; los permisos los controla la seguridad por filas de la base.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  });
}
