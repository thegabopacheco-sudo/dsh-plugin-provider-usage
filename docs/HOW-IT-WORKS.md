# How dsh-plugin-provider-usage works

Uso y rendimiento por proveedor/modelo en DeepSeek Harness: agrega tokens de entrada/salida/cache, cache hit rate, velocidad de decodificacion y TTFT por sesion y modelo.

## Architecture

```
DSH ──MCP stdio──► server.mjs (single-file bundle)
                    └─ local plugin logic
```

## Safety

- Read by default; actions require `confirm:true`.
- `read-only` mode via environment variable.
- Allowlists where applicable.
- Audit at `<DSH_HOME>\cache\provider-usage\audit.jsonl`.
- Action rate limit.

## Validation

End-to-end tests with the official MCP client (`@modelcontextprotocol/client@2.2.0`)
and the packaged artifact (`npm pack` → `postinstall` → deployed server).
