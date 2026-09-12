FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends clamav-daemon clamav-freshclam ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/meras-scanner
COPY server.mjs entrypoint.sh ./
COPY clamd.conf /etc/clamav/clamd.conf
COPY freshclam.conf /etc/clamav/freshclam.conf
RUN mkdir -p /run/clamav /var/log/clamav && chown -R clamav:clamav /run/clamav /var/log/clamav /var/lib/clamav && chmod +x entrypoint.sh
USER clamav
ENV CLAMD_SOCKET=/run/clamav/clamd.ctl PORT=3001
EXPOSE 3001
ENTRYPOINT ["/opt/meras-scanner/entrypoint.sh"]
