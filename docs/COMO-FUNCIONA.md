# Cómo funciona dsh-plugin-provider-usage

Uso y rendimiento por proveedor/modelo en DeepSeek Harness: agrega tokens de entrada/salida/cache, cache hit rate, velocidad de decodificacion y TTFT por sesion y modelo.

## Arquitectura

```
DSH ──MCP stdio──► server.mjs (bundle single-file)
                    └─ lógica local del plugin
```

## Herramientas reales

- `status`: Estado global
- `sessions`: Sesiones por consumo
- `session`: Detalle de sesión

## Seguridad

- Lectura por defecto; acciones con `confirm:true`.
- Modo `read-only` por variable de entorno.
- Listas blancas cuando aplique.
- Auditoría en `<DSH_HOME>\cache\provider-usage\audit.jsonl`.
- Rate limit de acciones.

## Verificación

Tests end-to-end con el cliente MCP oficial (`@modelcontextprotocol/client@2.2.0`)
y artefacto empaquetado (`npm pack` → `postinstall` → servidor desplegado).
