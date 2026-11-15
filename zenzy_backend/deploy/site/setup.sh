#!/bin/bash
# Chạy trên EC2 (qua SSM, do deploy-site.ps1 gọi): giải nén gói site, cập nhật Caddyfile và mount
# /opt/zenzy/site -> /srv cho container caddy, rồi khởi động lại caddy.
set -euo pipefail
cd /opt/zenzy
PKG=/tmp/zenzy-site.tgz
rm -rf site.new && mkdir site.new && tar -xzf "$PKG" -C site.new

# Ghi đè nội dung (giữ nguyên inode) vì container mount trực tiếp file này.
cat site.new/Caddyfile > Caddyfile

# Thêm mount thư mục tĩnh một lần.
if ! grep -q '/srv:ro' docker-compose.yml; then
  sed -i 's#^\( *\)- ./Caddyfile:/etc/caddy/Caddyfile:ro$#&\n\1- ./site:/srv:ro#' docker-compose.yml
fi
grep -q '/srv:ro' docker-compose.yml || { echo "Could not add the ./site:/srv mount to docker-compose.yml" >&2; exit 1; }

mkdir -p site
find site -mindepth 1 -delete
cp -a site.new/srv/. site/
chmod -R a+rX site
rm -rf site.new "$PKG"

docker compose --env-file stack.env up -d --force-recreate caddy
sleep 3
docker compose --env-file stack.env ps caddy
docker compose --env-file stack.env logs --tail 20 caddy
