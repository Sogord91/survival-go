#!/bin/bash
# ÉJFÉLI FRISSÍTÉS (v0.1.36)
# A cron óránként elindítja, de csak magyar idő szerint éjfélkor (00 óra) csinál bármit.
# Ha a GitHubon van újabb verzió, lefuttatja a szokásos frissítést (/usr/local/bin/frissit).
# Ha nincs új verzió, nem csinál semmit: a játék nem indul újra.
# Napló: /var/log/ejfeli-frissites.log
[ "$(TZ=Europe/Budapest date +%H)" = "00" ] || exit 0
cd /opt/survival-go || exit 1
git fetch -q origin main || { echo "$(date '+%F %T') hiba: nem érem el a GitHubot"; exit 1; }
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
    echo "$(TZ=Europe/Budapest date '+%F %T') nincs új verzió"
    exit 0
fi
echo "$(TZ=Europe/Budapest date '+%F %T') új verzió: $(git log -1 --format='%h %s' origin/main) – frissítés indul"
/usr/local/bin/frissit
echo "$(TZ=Europe/Budapest date '+%F %T') kész"
