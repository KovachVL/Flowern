# Flowern

Flowern analyzes a Python, JavaScript, or Java project with [Joern](https://joern.io) and shows the interfile / interprocedural data-flow paths from tainted sources (request input, environment variables, ...) into every call in the project. It also browses the full project call graph, and renders flows as an interactive graph, not just a flat step list.

## How it works

- **`scripts/joern/flow_all.sc`** — a Joern script that imports the project, matches a fixed set of regex source patterns (`request.args`, `os.environ`, ...), and runs a single global `reachableByFlows` pass against every call argument in the project. It also emits every project-defined method with its callers and callees, independent of taint.
- **Go backend** (`cmd/server`, `internal/`) — accepts a project (git URL or ZIP upload), clones/extracts it, runs the Joern script (either a local `joern` binary or, in Docker, via `docker exec` into a long-lived `joern` container), and serves the parsed result over a small JSON API. Results are kept in memory only — there's no database.
- **React frontend** (`web/`) — lets you submit a project, then browse the results as either a searchable list of tainted flows or the full method/call-graph, with a [React Flow](https://reactflow.dev)-based diagram view for individual flows.

## Running it

```sh
cp .env.example .env   # adjust DOCKER_SOCK if your Docker context isn't the default
docker compose up -d --build
```

This starts three containers:

| service  | what it does                                              | port |
|----------|------------------------------------------------------------|------|
| `joern`  | `ghcr.io/joernio/joern:nightly`, kept alive for `docker exec` | —    |
| `server` | Go API, shells out to the `joern` container per analysis   | 8080 |
| `web`    | React SPA, served by nginx, proxies `/api` to `server`     | 5173 |

Open `http://localhost:5173`, submit a git URL or a ZIP, and browse the result once analysis finishes.

### Local development (without Docker)

```sh
go run ./cmd/server        # requires a local `joern` binary on PATH
npm run dev --prefix web   # proxies /api to localhost:8080
```

### Configuration

The server reads its config from environment variables — see `config/config.go`. The notable ones:

- `JOERN_EXEC_MODE` — `binary` (default, runs `JOERN_BINARY` directly) or `docker` (runs via `docker exec` into `JOERN_CONTAINER_NAME`).
- `JOERN_TIMEOUT` — max seconds for a single analysis run.
- `WORKDIR` — scratch directory for cloned/extracted projects.
- `DOCKER_SOCK` (compose only, see `.env.example`) — host path to the Docker socket, mounted into `server` so it can talk to the `joern` container.

## License

MIT — see [LICENSE](LICENSE). Forks and redistributions must keep the copyright notice and may not represent this code as their own original work.
