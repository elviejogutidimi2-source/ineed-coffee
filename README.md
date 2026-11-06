# I Need Coffee — Carta digital

Carta del café (Plaza del Realejo 5, Granada) en 4 idiomas, con panel de administración.

## Cómo funciona

| Pieza | Dónde vive | Para qué |
|---|---|---|
| `index.html` | GitHub Pages **y** Cloudflare Pages | La carta. Los QR de las mesas apuntan a `https://elviejogutidimi2-source.github.io/ineed-coffee/` |
| `admin.html` | Los mismos sitios | Editar precios, textos, productos |
| `functions/api/menu.js` | Cloudflare Pages Functions | API: `GET /api/menu` (público) y `PUT /api/menu` (con contraseña) |
| Datos | Cloudflare Workers KV (`MENU`) | La carta editada + copias de seguridad de 90 días |
| `config.js` | — | `INC_API_BASE`: dirección de Cloudflare. Vacía = se usa JSONBin (modo antiguo) |

Cada `git push` a `main` publica automáticamente en GitHub Pages y en Cloudflare Pages.
Si la API no responde, la carta muestra los datos de respaldo y nunca se queda en blanco.

## Puesta en marcha de Cloudflare (una sola vez)

1. Crear cuenta gratis en https://dash.cloudflare.com
2. **Workers & Pages → Create → Pages → Connect to Git** → elegir `ineed-coffee`.
   - Production branch: `main`
   - Framework preset: *None* · Build command: *(vacío)* · Build output directory: `/`
3. **Storage & Databases → KV → Create namespace** → nombre `ineed-coffee-menu`.
4. En el proyecto de Pages → **Settings → Bindings → Add → KV namespace**:
   variable `MENU` → `ineed-coffee-menu`.
5. **Settings → Variables and Secrets → Add** → tipo *Secret*, nombre `ADMIN_PASSWORD`, valor: la contraseña del admin.
6. **Deployments → Retry deployment** (para que coja el KV y el secreto).
7. Poner la dirección del proyecto (p. ej. `https://ineed-coffee.pages.dev`) en `config.js` → `INC_API_BASE`.
8. Entrar al admin con la nueva contraseña: la primera vez importa solo los datos de JSONBin.

Después de comprobar que todo va bien: quitar la clave de JSONBin del código y regenerarla en jsonbin.io.

## Contraseña del admin

- Quien gestione la carta puede cambiarla desde el admin (botón **🔑 Contraseña**). Se guarda cifrada en el KV (clave `auth`).
- La contraseña puesta en Cloudflare (`ADMIN_PASSWORD`) sigue funcionando siempre como **llave de emergencia** del dueño.
- Para anular la contraseña del gestor: en Cloudflare → Workers KV → `ineed-coffee-menu` → borrar la clave `auth`.

## Productos no disponibles

Cada producto tiene en el admin un interruptor **No disponible**: si está activado, el producto no aparece en la carta.
Si todos los productos de un grupo están ocultos, también se oculta el título del grupo.
