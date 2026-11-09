# I Need Coffee — Carta digital

Carta del café (Plaza del Realejo 5, Granada) en 4 idiomas, con panel de administración.

## Cómo funciona

| Pieza | Dónde vive | Para qué |
|---|---|---|
| `index.html` | GitHub Pages **y** Cloudflare Pages | La carta. Los QR de las mesas apuntan a `https://elviejogutidimi2-source.github.io/ineed-coffee/` |
| `admin.html` | Los mismos sitios | Editar precios, textos, productos |
| `functions/api/menu.js` | Cloudflare Pages Functions | API: `GET /api/menu` (público) y `PUT /api/menu` (con contraseña) |
| Datos | Cloudflare Workers KV (`MENU`) | La carta editada + copias de seguridad de 90 días |
| `config.js` | — | `INC_API_BASE`: dirección de la API en Cloudflare |
| `fonts/` | — | Fuentes alojadas en la propia web (sin Google Fonts) |
| `og.jpg`, `favicon.png` | — | Vista previa al compartir el enlace e icono |

Cada `git push` a `main` publica automáticamente en GitHub Pages y en Cloudflare Pages.
Si la API no responde, cada móvil muestra la última carta que descargó (o la carta por defecto): nunca se queda en blanco.

## Cloudflare (ya configurado)

- Proyecto Pages `ineed-coffee` conectado a este repo (rama `main`, sin build, salida `/`).
- KV `ineed-coffee-menu` enlazado como `MENU`.
- Secreto `ADMIN_PASSWORD`: contraseña del dueño / llave de emergencia.

## Historial

En el admin, **🕘 Historial** muestra las copias automáticas (una por cada guardado, 90 días) y permite restaurar cualquiera.
Restaurar también guarda una copia de la versión actual, así que se puede deshacer.

## Contraseña del admin

- Quien gestione la carta puede cambiarla desde el admin (botón **🔑 Contraseña**). Se guarda cifrada en el KV (clave `auth`).
- La contraseña puesta en Cloudflare (`ADMIN_PASSWORD`) sigue funcionando siempre como **llave de emergencia** del dueño.
- Para anular la contraseña del gestor: en Cloudflare → Workers KV → `ineed-coffee-menu` → borrar la clave `auth`.

## Productos no disponibles

Cada producto tiene en el admin un interruptor **No disponible**: si está activado, el producto no aparece en la carta.
Si todos los productos de un grupo están ocultos, también se oculta el título del grupo.
