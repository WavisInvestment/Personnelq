# Production Deployment Guide

Deploys the whole platform on one Linux server with Docker: HTTPS proxy (Caddy, automatic certificates), website, API and PostgreSQL.

Files involved: `docker-compose.prod.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `deploy/Caddyfile`, `.env.production.example`.
Credentials you need first are listed in [PROGRESS.md](./PROGRESS.md#2-third-party-credentials-and-accounts-needed).

## What you need before starting

- A Linux server (Ubuntu 22.04+ is fine), **2 GB RAM minimum, 4 GB recommended** (PDF rendering uses Chromium), 20 GB disk.
- A domain name you control (for example `app.example.com`).
- Accounts and keys: Paystack, Anthropic, Resend (with a verified sending domain). The app still starts without them, but those features show "not available".

## Step 1: Point the domain at the server

Create a DNS **A record** for your domain (`app.example.com`) pointing at the server's public IP. Wait until it resolves (`nslookup app.example.com`). Caddy cannot get a certificate until this works. If you use the bare domain (`example.com`), the Host field is `@`; for `app.example.com` it is `app`. To also support `www`, add a second A record with Host `www` and the same IP: Caddy then redirects `www.<domain>` to `<domain>`.

## Step 2: Prepare the server

```bash
# Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # log out and in again afterwards

# Firewall: only SSH and web traffic
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

The database is deliberately not exposed to the internet; only the API container can reach it.

## Step 3: Get the code onto the server

```bash
git clone <your-repository-url> personnelq
cd personnelq
```

## Step 4: Create the production settings

```bash
cp .env.production.example .env.production
nano .env.production
```

Fill in at least:

| Setting | Value |
|---|---|
| `DOMAIN` | `app.example.com` (no `https://`) |
| `POSTGRES_PASSWORD` | long random password: `openssl rand -base64 32` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | two different values from `openssl rand -base64 48` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | your first platform admin (strong password) |

Then the third-party settings, when you have them (you can add them later and redeploy):
`PAYSTACK_SECRET_KEY`, `CLAUDE_API_KEY`, `RESEND_API_KEY` + `FROM_EMAIL`, and prices: `FULL_ASSESSMENT_PRICE`, `SUBSCRIPTION_PLANS`.

Keep `ASSESSMENT_PAYMENT_REQUIRED=false` until Step 8. To launch completely free (no payments and no company plans), set `PAYMENTS_ENABLED=false`; see [PROGRESS.md](PROGRESS.md#payments-master-switch) for exactly what it changes.
Protect the file: `chmod 600 .env.production`. Never commit it (it is git-ignored). Never paste it into a chat or ticket: it holds your database password, signing secrets and API keys. If it leaks, replace every value in it.

Rules for the values:
- Check the first line says `DOMAIN=` (a missing letter means nothing starts).
- Don't use `$` in a value (Compose reads `$name` as a variable and drops it), and wrap any value with spaces or `#` in single quotes. Passwords made with `openssl rand -hex 24` are always safe.
- Every `docker compose` command needs `--env-file .env.production` (the file isn't named `.env`), otherwise Compose reports required variables as missing.

## Step 5: Build and start

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

The first build takes several minutes. On start, the API automatically applies database migrations, creates the roles, permissions and assessment catalogue (safe to repeat), and creates your platform admin.

Check it:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps          # all should be "healthy"/running
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api # look for "Personnelq API running"
curl https://app.example.com/api/health
```

Open `https://app.example.com`. Sign in with the admin email and password; the admin console is at `/admin`.

## Step 6: Remove the one-time admin settings

Delete `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `.env.production` and redeploy (Step 9). The account stays; the password is no longer sitting in the file.

## Step 7: Connect the third-party services

1. **Paystack:** Settings, API Keys & Webhooks. Set the webhook URL to `https://app.example.com/api/webhooks/paystack`. Put the secret key in `.env.production`.
2. **Resend:** verify your sending domain (add the DNS records it gives you), then set `FROM_EMAIL` to an address on that domain. Test with "Forgot password".
3. **Anthropic:** create the key, set a monthly spending limit in the console.

Redeploy after changing settings: `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`.

## Step 8: Test a payment before going live

1. Use Paystack **test** keys (`sk_test_...`) first. Set a price, e.g. `FULL_ASSESSMENT_PRICE=5000`, and `ASSESSMENT_PAYMENT_REQUIRED=true`, redeploy.
2. As a normal user: take the free snapshot, open the full assessment, pay with a Paystack test card, confirm you land back on the site, the receipt email arrives, and the assessment starts.
3. Finish it, write insights, download the PDF, share a badge.
4. Check the payment appears in the admin console under Payments.
5. When happy, swap in the live `sk_live_...` key and redeploy.

## Step 9: Updating later

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Migrations run automatically on start. The website's API address is baked in at build time, so changing `DOMAIN` needs `--build`.

## Backups (do this before real users)

`deploy/backup.sh` dumps the database, checks the file is valid, optionally copies it off the server, and deletes old local copies.

```bash
chmod +x deploy/backup.sh
./deploy/backup.sh            # run once now and look at the output
```

**How often.** Pick by how much you can afford to lose. A backup only protects what existed when it ran.

| Schedule | Cron line (`crontab -e`) | You could lose |
|---|---|---|
| Daily, 02:30 (recommended once real people use it) | `30 2 * * * ~/personnelq/deploy/backup.sh >> ~/backup.log 2>&1` | up to a day |
| Weekly, Sunday 02:30 (quiet period or small user base) | `30 2 * * 0 ~/personnelq/deploy/backup.sh >> ~/backup.log 2>&1` | up to a week |
| Only before changes | run `./deploy/backup.sh` by hand before each update | everything since the last run |

Also run it by hand before any update that changes the database. Backups are small, so frequency costs almost nothing; the real cost is forgetting.

**Settings (optional).** Create `~/.personnelq-backup.env`:

```
BACKUP_REMOTE=b2:personnelq-backups
HEALTHCHECK_URL=https://hc-ping.com/xxxx
KEEP_DAYS=30
```

- `BACKUP_REMOTE`: an rclone `remote:bucket` that each backup is copied to.
- `HEALTHCHECK_URL`: a free dead-man's-switch (for example Healthchecks.io) that emails you if backups stop arriving.
- `KEEP_DAYS`: how long local copies are kept (default 30).

**Keep a copy off the server.** Install rclone, run `rclone config` for a private bucket (Backblaze B2, Cloudflare R2 or S3), and set `BACKUP_REMOTE`. A backup that lives only on the same server is not a backup. The files contain everyone's results, so keep the bucket private.

**Restore into an empty database.** Stop the app first:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop api web
gunzip -c ~/backups/personnelq-2026-10-01-0230.sql.gz | docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db psql -U personnelq personnelq
docker compose --env-file .env.production -f docker-compose.prod.yml start api web
```

Try one restore on a spare machine before launch, and again every few months.

## The API address and versions

The website talks to the API at `https://<your domain>/api/v1`; `docker-compose.prod.yml` sets that for you (`NEXT_PUBLIC_API_URL`). The health check (`/api/health`) and the Paystack webhook (`/api/webhooks/paystack`) are deliberately not versioned, so the Paystack webhook address above stays valid when a new version is added later. How versions change, and how integrators should retry safely, is in [docs/api-versioning.md](docs/api-versioning.md).

## Background housekeeping

In production the API runs a small job every hour (nothing to set up): it emails company administrators 7 days and 1 day before their plan ends, marks ended plans as expired, closes invitations and retake approvals that ran out, and clears old sign-in sessions and links. It is safe if you run more than one API container. Set `JOBS_ENABLED=false` in the API settings to switch it off, or `JOBS_INTERVAL_MS` to change how often it runs. It needs email (Resend) to be configured for the warnings to be delivered.

## Useful commands

| Task | Command |
|---|---|
| Logs | `docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api` (or `web`, `proxy`, `db`) |
| Restart API | `docker compose --env-file .env.production -f docker-compose.prod.yml restart api` |
| Stop everything | `docker compose --env-file .env.production -f docker-compose.prod.yml down` (data is kept; add `-v` only to delete it) |
| Create another admin | `docker compose --env-file .env.production -f docker-compose.prod.yml exec -e ADMIN_PASSWORD='...' api npm run admin:create -- name@company.com First Last` |
| Database shell | `docker compose --env-file .env.production -f docker-compose.prod.yml exec db psql -U personnelq personnelq` |

## Troubleshooting

- **Browser shows a certificate error / site not loading:** the DNS record isn't live yet, or ports 80/443 are blocked. Check `docker compose ... logs proxy`.
- **"We couldn't reach the server" on the website:** `DOMAIN` changed after building; rebuild with `--build`.
- **API keeps restarting:** `logs api`. Usually a missing required variable (`POSTGRES_PASSWORD`, `JWT_SECRET`) or a wrong database password. If you changed `POSTGRES_PASSWORD` after the first start, the database still has the old one; reset it with `ALTER USER` or recreate the volume (only if no data matters).
- **PDF fails:** the server is out of memory; use at least 2 GB (add swap if needed).
- **Payments stay "pending":** webhook URL wrong in Paystack, or the secret key doesn't match the mode (test vs live). The success page also verifies directly, so customers are not stuck.
- **"required variable … is missing a value" or `DOMAIN` is not set:** the command lacks `--env-file .env.production`, or a name in the file is misspelled.
- **A password or secret has the wrong value / a variable "is not set" warning naming part of it:** the value contains `$`. Replace it with one that doesn't.
- **Build fails at `COPY packages`:** you are on an old checkout. `git pull` (the line was removed in commit `0ac92d1`).
- **Emails don't arrive:** sending domain not verified in Resend, or `FROM_EMAIL` isn't on it.

## Security notes

- In production the API **will not start** if `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing, shorter than 32 characters, still an example value, or the same as the other; if `FRONTEND_URL` is not https; or if `SEED_ADMIN_PASSWORD` is weak. The message in `docker compose logs api` says which. Generate secrets with `openssl rand -hex 48`.
- `npm audit` lists some findings that cannot be reached by how the product runs; they are explained in [PROGRESS.md](PROGRESS.md#week-8-testing-hardening-launch-preparation). Check it again before launch and after any dependency change.

- Only ports 80/443 (and SSH) are open; Postgres, the API and the website are not published directly.
- Containers run as unprivileged users; secrets live only in `.env.production`.
- Rate limiting uses real client IPs (`TRUST_PROXY=1` behind Caddy).
- Not included yet: automated backups, uptime monitoring and error alerts. Add them before heavy traffic.

## Continuous deployment (GitHub Actions)

`.github/workflows/deploy.yml` tests every pull request, and on every push to `main` it tests, then logs in to the server over SSH, pulls the code, rebuilds with Docker and checks `/api/health`. Do Steps 1 to 5 by hand once first; after that, pushing to `main` deploys.

1. **Deploy key:** on your computer run `ssh-keygen -t ed25519 -f deploy_key -N ""`. Append `deploy_key.pub` to `~/.ssh/authorized_keys` of a server user that can run Docker and owns the project folder. On the server, make the repository readable without a password (a read-only GitHub deploy key, or a public repo) so `git fetch` works.
2. **Repository secrets:** GitHub, Settings, Environments, New environment `production`, then add:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | server IP or hostname |
| `DEPLOY_USER` | the SSH user |
| `DEPLOY_PATH` | the project folder on the server, e.g. `/home/deploy/personnelq` |
| `DEPLOY_KEY` | the full contents of the private file `deploy_key` |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <server ip>` run from your computer |
| `DEPLOY_DOMAIN` | your domain, e.g. `app.example.com` |

3. Delete `deploy_key` from your computer afterwards. Optionally add "required reviewers" to the `production` environment to approve each deploy, and protect `main` so it needs the test check to pass.

`.env.production` stays only on the server; the workflow never sees it. The workflow resets the server's checkout to `origin/main`, so don't edit tracked files on the server.
