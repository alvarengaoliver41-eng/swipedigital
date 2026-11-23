# swipe digital · reportes de clientes

Reportes de resultados de tráfico pago para los clientes de swipe digital, con dominio propio y sin depender de Claude.

- **Reporte del cliente:** `https://TU-DOMINIO/r/<código>`. Muestra los datos de Meta Ads en vivo, las ventas por WhatsApp, la meta del mes, el recorrido del anuncio a la venta y los anuncios destacados. No necesita usuario: el código del link es secreto y se puede cambiar desde el panel.
- **Panel del equipo:** `https://TU-DOMINIO/equipo`. Se entra con correo y contraseña. Desde ahí se cargan las ventas del día, se fijan las metas, se agregan clientes y se copian los links.

## Cómo está armado

| Parte | Dónde | Qué hace |
| --- | --- | --- |
| `public/` | Vercel (archivos estáticos) | Páginas, estilos, fuentes y logos |
| `api/reporte.js` | Vercel (función) | Consulta Meta con la clave de la agencia. Guarda el resultado 10 minutos |
| `api/ventas.js` | Vercel (función) | Lee ventas y metas del cliente en Supabase, sin caché |
| `api/config.js` | Vercel (función) | Le pasa al panel la dirección pública de Supabase |
| `supabase/schema.sql` | Supabase | Tablas, permisos y clientes iniciales |

Las claves secretas (Meta y la clave de servicio de Supabase) viven solo en las variables de entorno de Vercel. Nunca van en el código.

---

## Puesta en marcha

### 1. Meta: clave permanente de la agencia

1. Entrá a [business.facebook.com](https://business.facebook.com) → **Configuración del negocio** de swipe digital.
2. **Cuentas → Apps → Agregar → Crear una app nueva** (te lleva a developers.facebook.com). Tipo **Negocio**, conectada al portafolio de swipe digital. En la app, agregá el producto **Marketing API**.
3. Volvé a **Configuración del negocio → Usuarios → Usuarios del sistema → Agregar**. Nombre: `Reportes`, rol: **Empleado**.
4. Con el usuario creado: **Asignar activos → Cuentas publicitarias**, elegí cada cuenta de cliente y dale el permiso de **ver rendimiento** (solo lectura).
5. **Generar token**: elegí la app del paso 2, caducidad **Nunca** y el permiso `ads_read`. Copiá el token: es el valor de `META_ACCESS_TOKEN`.

**Cada cliente nuevo:** el cliente entra a su Business Manager → **Configuración → Socios → Agregar socio** y comparte su cuenta publicitaria con el ID de negocio de swipe digital. Después, en el Business Manager de swipe digital, asignás esa cuenta al usuario del sistema `Reportes` (paso 4). No hace falta generar otro token.

Si Meta limita la cantidad de consultas, se puede pedir más acceso desde la app (**Marketing API Access Tier**).

### 2. Supabase: base de datos y usuarios del equipo

1. Creá un proyecto en [supabase.com](https://supabase.com) (región São Paulo, la más cercana).
2. **SQL Editor → New query**, pegá todo `supabase/schema.sql` y tocá **Run**. Crea las tablas y carga VECAB y A un Click.
3. **Authentication → Users → Add user**: creá un usuario por persona del equipo, con correo y contraseña.
4. Para habilitarlos en el panel, en el SQL Editor:
   ```sql
   insert into public.equipo (user_id, nombre)
   select id, 'Nombre Apellido' from auth.users where email = 'correo@ejemplo.com';
   ```
5. **Authentication → Sign In / Providers → Email**: desactivá **Allow new users to sign up**, así nadie más puede crearse un usuario.
6. **Project Settings → API**: copiá la **Project URL**, la clave **anon** y la clave **service_role**.

### 3. Vercel: publicar el sitio

1. En [vercel.com](https://vercel.com): **Add New → Project** e importá el repositorio `swipedigital`.
2. **Root Directory:** `reportes`. **Framework Preset:** Other. No hace falta comando de build.
3. **Environment Variables** (ver `.env.example`):
   - `META_ACCESS_TOKEN`: el token del paso 1
   - `META_API_VERSION`: `v26.0`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: los del paso 2
4. **Deploy**.

### 4. Dominio propio

1. En el proyecto de Vercel: **Settings → Domains → Add** → por ejemplo `reportes.swipedigital.com`.
2. En el proveedor del dominio, creá el registro que indica Vercel (normalmente un **CNAME** `reportes` → `cname.vercel-dns.com`). En unos minutos queda con HTTPS.

---

## Uso diario

1. Entrá a `/equipo` con tu usuario.
2. **Cargar ventas:** elegí el cliente, poné la fecha, la cantidad de ventas, el monto total y la venta más alta del día. Si cargás un día que ya existe, se reemplaza.
3. **Meta del mes:** al principio de cada mes, fijá la meta en guaraníes y, si querés, en cantidad de ventas.
4. **Link del cliente:** en la tarjeta del cliente, **Copiar link**. Si un link se filtró, en **Editar → Generar link nuevo**: el anterior deja de funcionar.

**Cliente nuevo:** en el panel, **Agregar cliente** con el nombre, un identificador corto (`ej. ferreteria-lopez`), el ID de la cuenta publicitaria de Meta y el objetivo principal. Para el logo, subí el archivo a `public/clientes/` del repositorio y poné `/clientes/archivo.svg`, o pegá una dirección `https://`.

## Notas

- El período incluye el día de hoy (en la zona horaria de cada cuenta publicitaria): las ventas que se cargan hoy aparecen al instante en el reporte. Los números de Meta de hoy son parciales y se actualizan cada 10 minutos.
- El reporte guarda la respuesta de Meta 10 minutos para no consultar Meta en cada visita. Las ventas y metas se ven al instante.
- Para probar en tu computadora: `npm i -g vercel`, `vercel link`, `vercel env pull .env` y `vercel dev` dentro de esta carpeta.
