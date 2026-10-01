# Loom

A brain space for goals, deadlines and motivation, built around **Goals**, **Activities** and
**Occurrences**. It does not ask you to log your life: nothing in it needs sleep, work or commuting
entered, and nothing computes a wrong answer when they are missing. The calendar is a visualization and
a fast way to add things, not a planner.

- `spec.md` describes what the app does and its domain rules.
- `design.md` describes the visual language.
- `CLAUDE.md` is the working guide for contributors (file map, conventions, gotchas).

**Stack:** ASP.NET Core (.NET 10) minimal APIs, EF Core, SQLite; React 19, Vite, TypeScript, Tailwind CSS v4,
TanStack Query. An optional Android shell is built with Capacitor.

## Run it with Docker

```bash
cp .env.example .env        # then edit .env
docker compose up --build   # http://localhost:8080
```

Set these in `.env`:

| Variable | Meaning |
|---|---|
| `JWT_SECRET` | **Required.** A random string of at least 32 bytes, e.g. `openssl rand -base64 48`. The app refuses to start without it. Changing it signs everyone out. |
| `COOKIE_SECURE` | `true` (default) when the app is served over HTTPS. Set `false` only for plain-HTTP local use, otherwise the browser drops the refresh cookie and you are signed out after 15 minutes. |
| `BEHIND_PROXY` | `true` when a reverse proxy in front of the app sets `X-Forwarded-For` and `X-Forwarded-Proto`. Leave `false` when the port is exposed directly, because the headers can then be forged. |

The database is a single SQLite file at `/data/loom.db`, on the `loom_data` volume. Migrations are applied
automatically on startup.

### Behind a reverse proxy

Terminate TLS at the proxy, forward to port 8080, and set `BEHIND_PROXY=true` and `COOKIE_SECURE=true`.
Without forwarded headers the app sees every request as coming from the proxy, so the login rate limit
below would apply to all users together instead of per client.

## Security defaults

- **Login and register are rate limited** per client IP: 10 attempts per 60 seconds, then `429` with a
  `Retry-After` header. Tune with `RateLimit__Auth__PermitLimit` and `RateLimit__Auth__WindowSeconds`.
- Responses carry `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
  and (outside Development) a same-origin `Content-Security-Policy` and HSTS on HTTPS requests.
- Passwords are hashed with BCrypt. Access tokens live 15 minutes, in memory only. The 6-month refresh
  token is stored hashed, sent as an httpOnly cookie, and rotated on every use.

## Develop

```bash
dotnet build
dotnet test                                  # backend unit + integration tests
dotnet run --project src/Loom.Api            # API on :5200

cd client
npm install
npm run dev                                  # UI on :5173, proxies /api to :5200
npm run build                                # type-check + production build
```

Local runs need a JWT secret of at least 32 bytes and a non-secure cookie over plain HTTP. For example, with
user secrets or environment variables:

```bash
export Jwt__Secret="$(openssl rand -base64 48)"
export Auth__RefreshCookie__Secure=false
```

### Configuration keys

Standard ASP.NET configuration: environment variables use `__` for `:`.

| Key | Default | Meaning |
|---|---|---|
| `Jwt:Secret` | none, required | Signing key, at least 32 bytes. |
| `Auth:RefreshCookie:Secure` | `true` | `Secure` flag on the refresh cookie. |
| `ConnectionStrings:Default` | `Data Source=loom.db` | SQLite file. |
| `Database:MigrateOnStartup` | off unless set | Apply EF migrations when the API starts. Docker sets it to `true`. |
| `Cors:Origins` | none | Origins allowed to call the API cross-origin (the Android app and the Vite dev server). |
| `RateLimit:Auth:PermitLimit` | `10` | Login/register attempts per window, per IP. |
| `RateLimit:Auth:WindowSeconds` | `60` | Length of that window. |

### Migrations

```bash
dotnet ef migrations add <Name> --project src/Loom.Core --startup-project src/Loom.Api --output-dir Migrations
```

## Data

Export your data any time from Settings (a JSON download). To back up the database itself, copy the SQLite
file from the `loom_data` volume while the app is stopped, or use `sqlite3 loom.db ".backup 'copy.db'"`.

## Releasing from the homeserver

`./loom-build.sh` builds the signed Android APK inside Docker (`tools/android-builder`), publishes
`loom.apk` and `loom-v<name>-<code>.apk` to `/data/loom/releases`, then redeploys the web app with
`docker compose -f /opt/homeserver/apps/loom/compose.yml up -d --build`. `--no-web` skips the redeploy,
`--web-only` skips the APK. The keystore and its generated password are created once in `~/.loom`;
back that directory up, because a new keystore forces a reinstall on every device. The version in
`client/android/app/build.gradle` is bumped by the script; commit it afterwards.
