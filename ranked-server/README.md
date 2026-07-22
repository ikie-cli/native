# Native Ranked service

Small Node and SQLite race coordinator for the Native Ranked Fabric client.

## Local run

```bash
npm test
NATIVE_RANKED_DB=/tmp/native-ranked.db node src/index.mjs
```

The service binds to `127.0.0.1:3847` by default. Production exposes it through the launcher's existing nginx host at `/ranked/`; the database and downloadable mod artifact live under `/var/lib/native-ranked`.

## Race lifecycle

Two players join the same mode, receive one signed 64-bit seed, prepare isolated local worlds, and send readiness. The server publishes a shared start timestamp only after both are ready. Progress is monotonic, the first accepted dragon-kill finish wins, and ranked results apply Elo with a K-factor of 32.
