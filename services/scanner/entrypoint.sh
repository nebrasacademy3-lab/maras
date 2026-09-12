#!/bin/sh
set -eu
freshclam --config-file=/etc/clamav/freshclam.conf
freshclam --daemon --foreground --config-file=/etc/clamav/freshclam.conf &
clamd --foreground --config-file=/etc/clamav/clamd.conf &
exec node server.mjs
