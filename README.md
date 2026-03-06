# j26-cli

Local development environment CLI for J26 microservices.

Sets up a full local dev environment by generating a [Caddy](https://caddyserver.com/) reverse proxy and a Docker Compose stack that mirrors the production routing on `https://local.j26.se`.

## Requirements

- **Node.js ≥ 24** — the CLI runs TypeScript directly using Node's built-in type stripping (no compilation step)
- **Docker** with the Compose plugin

## Installation

```sh
npm install -g j26-cli
```

## Commands

| Command | Description |
|---|---|
| `j26 up` | Generate config files and start the stack (streams logs) |
| `j26 up -d` | Same but runs in the background (detached) |
| `j26 down` | Stop and remove the stack |
| `j26 config` | Interactively configure how each service runs |
| `j26 status` | Show current mode for all services |
| `j26 trust-ca` | Install the local Caddy CA so browsers trust the HTTPS certificate |

## Workflow

```sh
# First time
j26 up          # initialises .j26.local.yaml with defaults and starts the stack

# Change which services run locally
j26 config      # pick modes, add/remove local-only services
j26 up          # apply changes

# Daily use
j26 up          # pull latest images and restart
j26 down        # shut everything down
```

## Service modes

| Mode | Description |
|---|---|
| `cloud` | Proxy requests to the live cloud URL (default) |
| `docker` | Run the service's Docker image locally |
| `local` | Forward to a dev server running on your machine (e.g. `npm run dev`) |
| `skip` | Exclude the service entirely — no route is generated |

## `services.yaml`

Each project that uses `j26-cli` ships a `services.yaml` manifest describing its microservices. Place it at the root of the repository and run commands with `--config path/to/services.yaml` if it's not in the current directory.

```yaml
services:
  - name: auth
    path: /auth
    cloudUrl: https://app.example.com/auth
    dockerImage: ghcr.io/your-org/your-auth:latest
    port: 80

  - name: app
    path: /
    cloudUrl: https://app.example.com/
    dockerImage: ghcr.io/your-org/your-app:latest
    port: 3000
    rewritePath: false
```

### Service fields

| Field | Required | Description |
|---|---|---|
| `name` | ✅ | Identifier, used as the Docker Compose service name |
| `path` | ✅ | URL path prefix on `https://local.j26.se` (must start with `/`) |
| `cloudUrl` | ✅ | Full HTTPS URL of the cloud-hosted service |
| `dockerImage` | ✅ | Docker image to run in `docker` mode |
| `port` | ✅ | Port the service listens on inside its container |
| `rewritePath` | | Strip path prefix before forwarding (default: `true`) |
| `env` | | Base env vars passed to the container in `docker` mode |

## Local configuration

Personal configuration is stored in `.j26.local.yaml` at the project root. This file is gitignored — each developer maintains their own copy.

```yaml
services:
  auth:
    mode: local
    hostPort: 3001
  app:
    mode: cloud

# Services defined only on your machine (not in services.yaml)
localServices:
  my-feature:
    path: /my-feature
    port: 5173
```
