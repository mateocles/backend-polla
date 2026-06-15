#!/usr/bin/env bash
# Sube las variables del .env local a Vercel (production, preview, development).
# Requiere haber hecho antes: vercel login && vercel link
set -e

ENV_FILE="${1:-.env}"
TARGETS="production preview development"

if [ ! -f "$ENV_FILE" ]; then
  echo "No existe $ENV_FILE"; exit 1
fi

while IFS= read -r line || [ -n "$line" ]; do
  # saltar comentarios y líneas vacías
  case "$line" in
    \#*|"") continue ;;
  esac
  key="${line%%=*}"
  val="${line#*=}"
  # quitar comillas envolventes
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  [ -z "$key" ] && continue

  for t in $TARGETS; do
    vercel env rm "$key" "$t" -y >/dev/null 2>&1 || true
    printf '%s' "$val" | vercel env add "$key" "$t" >/dev/null 2>&1 && echo "  ✓ $key -> $t"
  done
done < "$ENV_FILE"

echo "Listo. Variables subidas a Vercel."
