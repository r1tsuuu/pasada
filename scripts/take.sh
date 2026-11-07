#!/bin/zsh
# Waits for the demo server, then records one take.
for i in $(seq 1 60); do curl -s -m 3 localhost:8080/api/health >/dev/null && break; python3 -c "import time;time.sleep(5)"; done
npx tsx scripts/record-demo.ts 2>&1 | tail -14
