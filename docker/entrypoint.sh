#!/bin/sh
set -e

DATA="${CANVASZ_DATA:-/app/data}"
BACKUP="${CANVASZ_BACKUP:-/app/backups}"
mkdir -p "$DATA" "$BACKUP"

# Qual usuário deve ser dono dos dados?
#
# Um bind mount chega com o dono que o diretório tem no host, e esse é o dono
# certo: herdando-o, seus arquivos continuam seus qualquer que seja o seu uid —
# sem ninguém precisar configurar nada. Só recorremos a PUID/PGID quando o
# diretório chega pertencendo ao root, o que significa que foi o próprio Docker
# que acabou de criá-lo (volume nomeado, ou ./data que não existia).
OWNER_UID="$(stat -c %u "$DATA")"
OWNER_GID="$(stat -c %g "$DATA")"

if [ "$OWNER_UID" = "0" ]; then
  OWNER_UID="${PUID:-1000}"
  OWNER_GID="${PGID:-1000}"
  chown -R "$OWNER_UID:$OWNER_GID" "$DATA" 2>/dev/null ||
    echo "[canvasz] aviso: não consegui ajustar a posse de $DATA"
fi

# Os backups vão para outro volume montado, que precisa da mesma posse.
chown "$OWNER_UID:$OWNER_GID" "$BACKUP" 2>/dev/null || true

echo "[canvasz] dados em $DATA, rodando como ${OWNER_UID}:${OWNER_GID}"

# O app nunca roda como root.
exec setpriv --reuid="$OWNER_UID" --regid="$OWNER_GID" --clear-groups "$@"
