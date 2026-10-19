#!/bin/sh
# Build and switch to a new LinkPulse release on the server.
#
#   sudo sh deploy/release.sh /path/to/linkpulse-<sha>.tar.gz
#
# Layout:  /opt/linkpulse/releases/<timestamp>   one directory per release
#          /opt/linkpulse/current                symlink to the live release
#          /etc/linkpulse/linkpulse.env          secrets and settings (see .env.example)
set -eu

ARCHIVE=${1:?usage: release.sh <archive.tar.gz>}
ROOT=/opt/linkpulse
ENV_FILE=/etc/linkpulse/linkpulse.env
STAMP=$(date +%Y%m%d%H%M%S)
DIR=$ROOT/releases/$STAMP

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE — copy .env.example there and fill it in."; exit 1; }
id linkpulse >/dev/null 2>&1 || useradd --system --home-dir $ROOT --shell /usr/sbin/nologin linkpulse

mkdir -p "$DIR"
tar xzf "$ARCHIVE" -C "$DIR"
cd "$DIR"

set -a; . "$ENV_FILE"; set +a
echo "==> installing dependencies"
npm ci --no-audit --no-fund --loglevel=error
echo "==> database migrations"
npm run --silent db:generate
npm run --silent db:migrate
echo "==> core tests"
npm test --silent
echo "==> building dashboard"
NEXT_PUBLIC_BASE_PATH="$BASE_PATH" npm run --silent build:web
echo "==> packing browser extension"
python3 -c "import shutil; shutil.make_archive('apps/web/out/linkpulse-extension', 'zip', 'apps/extension')"

chown -R linkpulse:linkpulse "$DIR"
ln -sfn "$DIR" $ROOT/current.new && mv -T $ROOT/current.new $ROOT/current

install -m 644 deploy/systemd/linkpulse-*.service /etc/systemd/system/
systemctl daemon-reload
for s in api redirect worker; do systemctl enable --quiet linkpulse-$s; systemctl restart linkpulse-$s; done

# Keep the five most recent releases.
ls -1dt $ROOT/releases/* | tail -n +6 | xargs -r rm -rf
echo "==> live: $DIR"
