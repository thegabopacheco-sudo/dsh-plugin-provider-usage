# dsh-plugin-provider-usage — Provider Usage

Uso y rendimiento por proveedor/modelo en DeepSeek Harness: agrega tokens de entrada/salida/cache, cache hit rate, velocidad de decodificacion y TTFT por sesion y modelo.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado global |
| `sessions` | Sesiones por consumo |
| `session` | Detalle de sesión |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-provider-usage` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-provider-usage
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_PROVIDER_USAGE_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\provider-usage\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
