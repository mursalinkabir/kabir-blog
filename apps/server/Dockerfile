# smkabir-site-server: nginx + the content-sync sidecar in ONE image. The pod runs it twice:
#   container `nginx`        default command (nginx)
#   native sidecar `content-sync`   command: content-sync
# No site content is baked in; releases come from R2 at runtime (docs/PLAN.md, "Site server image").
#
# Base is the stable-branch unprivileged nginx (uid 101, port 8080). Bump it by hand and note it in docs/versions.md.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine

USER root
# rclone talks S3 to R2; jq renders redirects. Versions come from the pinned Alpine release of the base image.
RUN apk add --no-cache 'rclone~=1.74' 'jq~=1.8' \
 && rm -f /etc/nginx/conf.d/default.conf \
 && mkdir -p /etc/nginx/snippets /srv/site \
 && chown 101:101 /srv/site

COPY nginx/nginx.conf               /etc/nginx/nginx.conf
COPY nginx/site.conf                /etc/nginx/conf.d/site.conf
COPY nginx/security-headers.conf    /etc/nginx/snippets/security-headers.conf
COPY content-sync/content-sync.sh   /usr/local/bin/content-sync
RUN chmod 0755 /usr/local/bin/content-sync

# Numeric: the kubelet cannot prove a *named* user is non-root.
USER 101:101
EXPOSE 8080
