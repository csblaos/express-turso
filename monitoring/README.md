# Beszel production monitoring

The hub is bound to `127.0.0.1:8090`. The agent profile is intentionally
disabled until the administrator creates the system key and token in Beszel.

## Start the private hub

```sh
cp .env.example .env
docker compose -f compose.beszel.yml config --quiet
docker compose -f compose.beszel.yml up -d beszel
```

## Enable the agent

Create `secrets/agent-key` and `secrets/agent-token` with mode `600`, using the
values produced by Beszel's Add System dialog. Do not commit these files.

```sh
docker compose -f compose.beszel.yml --profile agent up -d
```

In the Add System dialog, use `/beszel_socket/beszel.sock` as the host/IP.

## Validate

```sh
docker compose -f compose.beszel.yml ps
docker stats --no-stream beszel-hub beszel-agent beszel-docker-proxy
curl --fail http://127.0.0.1:8090/api/health
ss -lnt
```

## Roll back monitoring only

```sh
docker compose -f compose.beszel.yml --profile agent down
```

This does not remove the Beszel data directory, the backend container, backend
networks, or any database volume.

