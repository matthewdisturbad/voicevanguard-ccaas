#!/usr/bin/env bash
# Verifica o relay publicado. Uso: SUPERVISOR_KEY=... ./smoke-relay.sh https://SEU-RELAY
set -euo pipefail
BASE="${1:?informe a URL https:// do relay}"
echo "== /api/health";           curl -fsS "$BASE/api/health"; echo
echo "== raiz serve a landing"
PAGE="$(curl -fsS "$BASE/")"
case "$PAGE" in *"<html"*) echo ok;; *) echo "FALHOU: raiz nao devolveu HTML"; exit 1;; esac
echo "== chave inválida (esperado: valid=false)"
curl -sS -H "X-Tenant-Key: chave-errada" "$BASE/api/validate-tenant"; echo
if [ -n "${SUPERVISOR_KEY:-}" ]; then
  echo "== chave de supervisor (esperado: valid=true)"
  curl -sS -H "X-Tenant-Key: $SUPERVISOR_KEY" "$BASE/api/validate-tenant"; echo
fi
