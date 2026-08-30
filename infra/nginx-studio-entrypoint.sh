#!/bin/sh
set -e
PORT="${PORT:-80}"
API_UPSTREAM="${API_UPSTREAM:-http://127.0.0.1:4031}"
cat > /etc/nginx/conf.d/default.conf <<EOF
server {
  listen ${PORT};
  root /usr/share/nginx/html;
  # SPA routes (no on-disk dir) must hit index.html, not a static folder clash.
  location = /pitch {
    try_files /index.html =404;
  }
  location = /verified {
    try_files /index.html =404;
  }
  location / {
    try_files \$uri \$uri/ /index.html;
  }
  location /v1/ {
    proxy_pass ${API_UPSTREAM}/v1/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 3600s;
  }
  location = /health {
    proxy_pass ${API_UPSTREAM}/health;
  }
}
EOF
exec nginx -g 'daemon off;'
