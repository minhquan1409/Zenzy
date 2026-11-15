# Deploying the Zenzy API on AWS

This guide takes you from an empty AWS account to a public HTTPS URL such as
`https://zenzy-api.duckdns.org/v1/` that the Android app can call. Follow it top to bottom; every
step says where to click or what to type. Budget about 1 to 1.5 hours the first time.

## What you will build

```
Android app ──HTTPS / WSS──▶ Elastic IP ─▶ EC2 t3.micro (Docker)
                                            ├─ Caddy  : TLS certificate (Let's Encrypt), :443 → api:3000
                                            └─ api    : this NestJS server (REST /v1 + Socket.IO)
                                                 │  secrets from SSM Parameter Store
                                                 ├────────▶ MongoDB Atlas M0 (free, Singapore)
                                                 └────────▶ S3 bucket ─▶ CloudFront (photos)
```

| Piece | AWS service | Why this one |
|---|---|---|
| API server | **EC2** (one `t3.micro`) running Docker Compose | Free-tier eligible, and it keeps long-lived WebSocket connections, which Socket.IO needs. App Runner does not support WebSockets; ECS + a load balancer costs about $16+/month for the load balancer alone. |
| Stable address | **Elastic IP** | The IP never changes, so the DNS name always points to the server. |
| HTTPS | **Caddy** container on the instance | Gets and renews a free Let's Encrypt certificate automatically (TLS 1.2+, NFR-07). No load balancer needed. |
| Image registry | **ECR** | Holds the API image; the stack keeps the newest 5 images. |
| Secrets | **SSM Parameter Store** (SecureString) | Free for standard parameters; the database string and JWT secret never sit in the repo or the app (NFR-15). |
| Media | **S3 + CloudFront** | Signed uploads straight from the phone; images served through the CDN (spec 4.1). Optional. |
| Database | **MongoDB Atlas M0** (not AWS, but hosted on AWS) | The spec's chosen database (section 4.4). M0 is free and supports the transactions the API uses. |
| Shell access | **SSM Session Manager** | A browser terminal on the instance; no SSH key or open port 22. |

Everything is created by one CloudFormation template, [`deploy/aws/zenzy-stack.yaml`](../deploy/aws/zenzy-stack.yaml).
Region: **ap-southeast-1 (Singapore)**, the AWS region closest to Vietnam (NFR-02). Use the same
region in every step.

## Expected cost

Prices are for Singapore, checked against my knowledge as of 2026; confirm on the
[AWS Free Tier page](https://aws.amazon.com/free/) for your account, because the rules depend on when the account was created.

| Item | Inside free tier | After free tier |
|---|---|---|
| EC2 t3.micro, 24/7 | 750 h/month free | ≈ $9.60/month |
| EBS 16 GB gp3 | 30 GB free | ≈ $1.50/month |
| Public IPv4 (Elastic IP, attached) | 750 h/month free | ≈ $3.60/month |
| ECR (≈ 5 images × 100 MB compressed) | 500 MB free | < $0.10/month |
| S3 (photos, a few GB) | 5 GB free | ≈ $0.025/GB/month |
| CloudFront | 1 TB/month free (always) | — |
| SSM Parameter Store (standard) | free | free |
| MongoDB Atlas M0 | free | free |
| DNS name from DuckDNS | free | free |
| **Total** | **≈ $0/month** | **≈ $15/month** |

- Accounts created **before 15 July 2025** get the classic 12-month free tier shown in the middle column.
- Accounts created **on or after 15 July 2025** use the newer free plan: sign-up credits (up to $200
  at the time of writing) that are spent on the items above, valid for 6 months on the free plan. At
  about $15/month the credits cover the whole period. On the free plan the account is closed when the
  credits or the 6 months run out unless you upgrade, so note the date.
- **Set a budget alarm first** (step 1) so a mistake can never surprise you.
- To stop all charges later: delete the CloudFormation stack (step 12).

## Before you start

On your Windows PC:

1. **AWS account** with a payment method (required even for the free tier).
2. **AWS CLI v2**: install from <https://aws.amazon.com/cli/>, then check with `aws --version`.
3. **Docker Desktop**, running (you already use it for local development).
4. This repository checked out (the commands below are run from the repository root,
   `C:\Users\Duc\AndroidStudioProjects\zenzy`).

## Step 1. Protect yourself: budget alarm and an admin user

1. Sign in to the AWS console as the root user. Top-right menu → **Billing and Cost Management** →
   **Budgets** → **Create budget** → **Use a template** → **Zero spend budget** → your e-mail → Create.
   You get an e-mail as soon as anything costs money.
2. Do not use the root user day to day. Console → **IAM Identity Center** is the recommended way,
   but the simplest way for a single student account is: **IAM** → **Users** → **Create user**
   (`zenzy-deployer`) → **Attach policies directly** → `AdministratorAccess` → Create. Open the user
   → **Security credentials** → **Create access key** → *Command Line Interface (CLI)* → copy both keys.
3. In PowerShell:

   ```powershell
   aws configure
   # AWS Access Key ID:     (paste)
   # AWS Secret Access Key: (paste)
   # Default region name:   ap-southeast-1
   # Default output format: json
   aws sts get-caller-identity
   ```

   Keep the access keys only on your PC; never put them in the repo or in the app.

## Step 2. Get a registered host name (free)

The app needs a fixed name, not an IP, so that HTTPS works. Pick one:

- **Free: DuckDNS.** Go to <https://www.duckdns.org>, sign in, create a sub-domain such as
  `zenzy-api` → you own `zenzy-api.duckdns.org`. Leave the IP empty for now; you fill it in step 5.
- **Own domain** (≈ $10–15/year) from any registrar, or Route 53 → **Registered domains**. You will
  create an `A` record such as `api.yourdomain.com` in step 5.

The spec's example URL `https://api.zenzy.app/v1` only works if you own `zenzy.app`; any name works
the same way.

Below, `DOMAIN` means the name you chose, for example `zenzy-api.duckdns.org`.

## Step 3. Create the MongoDB Atlas database (free)

1. Sign up at <https://www.mongodb.com/cloud/atlas/register>.
2. **Create** a cluster → **M0 (Free)** → provider **AWS** → region **Singapore (ap-southeast-1)**
   (or the closest free region offered) → name `zenzy` → Create.
3. **Database Access** → **Add new database user** → *Password* → user `zenzy_api`, click
   *Autogenerate Secure Password* and copy it → role **Read and write to any database** → Add.
4. **Network Access**: leave it for now; you add the server's IP in step 5.
5. **Database** → **Connect** → **Drivers** → copy the connection string. It looks like
   `mongodb+srv://zenzy_api:<password>@zenzy.abcde.mongodb.net/?retryWrites=true&w=majority&appName=zenzy`.
   Replace `<password>` with the password from step 3 (if it contains `@ : / ? # [ ]`, URL-encode
   those characters). This full string is your `MONGODB_URI`.

M0 is a 3-node replica set, so the multi-document transactions the API uses work. Limits worth
knowing: 512 MB storage and 500 connections, plenty for the ~50-user prototype (NFR-12).

## Step 4. Create the AWS stack

From the repository root in PowerShell (replace the two values):

```powershell
aws cloudformation deploy `
  --region ap-southeast-1 `
  --stack-name zenzy `
  --template-file zenzy_backend/deploy/aws/zenzy-stack.yaml `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides DomainName=zenzy-api.duckdns.org AcmeEmail=you@example.com
```

It takes about 5–8 minutes (the CloudFront distribution is the slow part). Options:
`EnableMedia=false` skips S3/CloudFront (uploads then return `503 UPLOADS_NOT_CONFIGURED`);
`InstanceType=t2.micro` if `t3.micro` is not free-tier eligible in your account.

Then print the outputs:

```powershell
aws cloudformation describe-stacks --region ap-southeast-1 --stack-name zenzy --query "Stacks[0].Outputs" --output table
```

Note `ElasticIp`, `ApiBaseUrl` and `InstanceId`.

## Step 5. Point the name at the server, and let it reach Atlas

1. **DNS.** DuckDNS: paste the `ElasticIp` into the IP field of your sub-domain → *update ip*.
   Own domain: create an `A` record `api` → the `ElasticIp`, TTL 300.
   Check from PowerShell: `Resolve-DnsName zenzy-api.duckdns.org` shows the Elastic IP.
2. **Atlas.** **Network Access** → **Add IP address** → the `ElasticIp` with `/32`
   (for example `13.250.10.20/32`) → Confirm. Only the server can connect to the database.

## Step 6. Store the secrets in SSM Parameter Store

Generate a JWT secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create the parameters (SecureString = encrypted). Use single quotes so PowerShell leaves `&` and `$` alone:

```powershell
aws ssm put-parameter --region ap-southeast-1 --type SecureString --name /zenzy/prod/MONGODB_URI --value 'mongodb+srv://zenzy_api:PASSWORD@zenzy.abcde.mongodb.net/?retryWrites=true&w=majority&appName=zenzy'
aws ssm put-parameter --region ap-southeast-1 --type SecureString --name /zenzy/prod/JWT_SECRET  --value 'PASTE-THE-GENERATED-SECRET'
aws ssm put-parameter --region ap-southeast-1 --type String       --name /zenzy/prod/MONGODB_DB  --value 'zenzy'
```

Optional, when you have them (step 10):

```powershell
aws ssm put-parameter --region ap-southeast-1 --type String       --name /zenzy/prod/GOOGLE_CLIENT_IDS          --value 'ANDROID_CLIENT_ID.apps.googleusercontent.com,WEB_CLIENT_ID.apps.googleusercontent.com'
aws ssm put-parameter --region ap-southeast-1 --type SecureString --name /zenzy/prod/FCM_SERVICE_ACCOUNT_BASE64 --value 'BASE64-OF-THE-FIREBASE-JSON'
```

Every parameter under `/zenzy/prod/` becomes an environment variable of the API with the same name
(see the table in the [README](../README.md#environment-variables)). To change one later, run the same
command with `--overwrite`, then deploy again (step 7). Development uses `.env` on your PC, so the two
environments never share secrets (spec 4.8).

## Step 7. Build and deploy the API

```powershell
powershell -ExecutionPolicy Bypass -File server\deploy\aws\deploy.ps1
```

The script builds the Docker image, pushes it to ECR, runs `/opt/zenzy/update.sh` on the instance
through SSM (which reloads the secrets, pulls the image and restarts the containers) and finally waits
for `https://DOMAIN/health` to return `{"status":"ok"}`. On the very first run Caddy needs up to a
minute to obtain the certificate, which needs the DNS record from step 5 to be in place.

Check in a browser: `https://DOMAIN/health`.

Run the same command for every new version of the server.

## Step 8. Create the admin account and the banned-keyword list

The schema and indexes are applied automatically when the API starts. To create the first admin
(UC-17) and seed the BR-01 keyword list, open a shell on the instance: console → **EC2** → the
`zenzy-api` instance → **Connect** → **Session Manager** → **Connect**, then:

```bash
cd /opt/zenzy
sudo docker compose --env-file stack.env run --rm \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='a-long-admin-password' \
  -e BANNED_KEYWORDS='word1,word2,word3' \
  api node dist/scripts/db-init.js
```

The admin then logs in through `POST /v1/auth/login` like any user; the response contains
`"role":"ADMIN"`. Running the command again is safe (it only adds what is missing).

## Step 9. Connect the Android app

The base URL setting the app needs:

```
API_BASE_URL = https://DOMAIN/v1/
SOCKET_URL   = https://DOMAIN        (Socket.IO path /socket.io/, auth: { token: <access_token> })
```

See [the API reference](API.md) for the endpoints.

## Step 10. Optional integrations

- **Google sign-in.** In Google Cloud console → APIs & Services → Credentials, create an *OAuth
  client ID* of type **Web application** (the Android app requests the ID token for this client) and
  one of type **Android** (package `com.example.zenzy` + your SHA-1). Put both client IDs in
  `/zenzy/prod/GOOGLE_CLIENT_IDS` (comma-separated) and deploy. Until then `POST /auth/google` returns 401.
- **Push notifications (FCM).** Firebase console → your project → Project settings → Service accounts →
  *Generate new private key*. Convert the JSON to base64 in PowerShell:
  `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\service-account.json"))`
  and store it in `/zenzy/prod/FCM_SERVICE_ACCOUNT_BASE64`. Delete the JSON file afterwards. Without
  it, notifications still appear in the in-app list and arrive over the socket.

## Step 11. Operating it

- **Logs:** Session Manager shell → `cd /opt/zenzy && sudo docker compose --env-file stack.env logs -f api`.
- **Restart:** `sudo /opt/zenzy/update.sh`.
- **Uptime monitor (NFR-11):** add `https://DOMAIN/health` to a free monitor such as UptimeRobot.
- **Reboots:** containers restart automatically (`restart: unless-stopped`).
- **Backups:** M0 has no automated backups. For the prototype, export occasionally with
  `mongodump --uri "<MONGODB_URI>"` from a machine whose IP you temporarily allow in Atlas.
- **Updating the OS:** Session Manager → `sudo dnf upgrade -y && sudo reboot`.

## Step 12. Tear down (stop all AWS charges)

```powershell
aws cloudformation delete-stack --region ap-southeast-1 --stack-name zenzy
```

If deletion stops at the media bucket because it still contains photos, empty it first:
`aws s3 rm s3://BUCKET-NAME --recursive` (the name is the `MediaBucketName` output), then delete
again. Also delete the parameters (`aws ssm delete-parameter --name /zenzy/prod/...`) and, if you
want, the Atlas cluster.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `deploy.ps1` says *update.sh finished with status Failed* and mentions SSM | A required parameter is missing: create `/zenzy/prod/MONGODB_URI` and `/zenzy/prod/JWT_SECRET` (step 6). |
| `https://DOMAIN/health` never loads | DNS not pointing at the Elastic IP yet (`Resolve-DnsName DOMAIN`), or ports 80/443 blocked by a network you are on. Caddy logs: `sudo docker compose --env-file stack.env logs caddy`. |
| API logs show `MongoServerSelectionError` | Atlas Network Access does not contain the Elastic IP, or the password in `MONGODB_URI` is wrong or not URL-encoded. |
| `docker build` fails on your PC | Docker Desktop is not running. |
| `send-command` says the instance is not registered | Wait 2–3 minutes after the stack is created for the SSM agent to come online. |
