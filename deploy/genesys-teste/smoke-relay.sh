#!/usr/bin/env bash
# Verifica o relay publicado. Uso: SUPERVISOR_KEY=... ./smoke-relay.sh https://SEU-RELAY
set -euo pipefail
BASE="${1:?informe a URL https:// do relay}"
echo "== /api/health";           curl -fsS "$BASE/api/health"; echo
echo "== raiz serve a landing";  curl -fsS "$BASE/" | grep -qi "<html" && echo ok
echo "== chave inválida (esperado: valid=false)"
curl -sS -H "X-Tenant-Key: chave-errada" "$BASE/api/validate-tenant"; echo
if [ -n "${SUPERVISOR_KEY:-}" ]; then
  echo "== chave de supervisor (esperado: valid=true)"
  curl -sS -H "X-Tenant-Key: $SUPERVISOR_KEY" "$BASE/api/validate-tenant"; echo
fi
