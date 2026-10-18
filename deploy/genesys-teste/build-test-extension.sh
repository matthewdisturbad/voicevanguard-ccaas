#!/usr/bin/env bash
# Gera uma cópia da extensão apontando para o relay de TESTE, sem alterar o código-fonte.
# Uso: ./build-test-extension.sh wss://SEU-RELAY-DE-TESTE.up.railway.app
set -euo pipefail
RELAY="${1:?informe a URL wss:// do relay de teste}"
case "$RELAY" in wss://*) ;; *) echo "A URL deve começar com wss://" >&2; exit 1;; esac
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/dist/extensao-teste"
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r "$ROOT/03_Chrome_Edge_Extension/." "$OUT/"
# Troca os dois endereços fixos do background (principal e fallback) pelo relay de teste.
sed -i -E "s#^let RELAY_SERVER = \"[^\"]*\";#let RELAY_SERVER = \"$RELAY\";#; s#^let FALLBACK_RELAY_SERVER = \"[^\"]*\";#let FALLBACK_RELAY_SERVER = \"$RELAY\";#" "$OUT/background.js"
grep -n "RELAY_SERVER =" "$OUT/background.js"
echo "Pronto: $OUT  (Chrome/Edge > chrome://extensions > Modo desenvolvedor > Carregar sem compactação)"
