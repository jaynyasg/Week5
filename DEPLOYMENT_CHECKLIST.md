# Ship - Deployment Checklist

Quick reference for deploying Ship to AWS.

## Render Public Submission Checklist

Use this path for the public submission deployment.

- [ ] Confirm `main` is pushed to the Git provider connected to Render.
- [ ] Create a Render Blueprint from `render.yaml`.
- [ ] Confirm the Blueprint will create:
  - [ ] Web service: `ship`
  - [ ] PostgreSQL database: `ship-db`
- [ ] Deploy the Blueprint.
- [ ] Verify Render generated `SESSION_SECRET`.
- [ ] Verify Render injected `DATABASE_URL` from `ship-db`.
- [ ] Confirm `/health` returns `{"status":"ok"}` at the Render URL.
- [ ] Open the app in a browser and complete setup or login.
- [ ] Create or open a document and confirm collaboration reconnect UI stays healthy.
- [ ] Confirm `/events` and `/collaboration/*` use `wss` in the browser network panel.
- [ ] Configure the `ship-security-probe` cron job:
  - [ ] Set `SHIP_SECURITY_WEB_URL` to the public Render app URL.
  - [ ] Set `SHIP_SECURITY_API_URL` to the public Render app URL.
  - [ ] Set `SHIP_SECURITY_EMAIL` and `SHIP_SECURITY_PASSWORD` for authenticated checks.
- [ ] Open `ship-security-probe` in Render and use **Trigger Run**.
- [ ] Confirm the generated markdown report appears in the Render job logs.
- [ ] Update `SUBMISSION.md` with the public Render URL and verification evidence.

Notes:

- The Vite frontend is built as static files and served by the Express web service on Render.
- Same-origin serving is intentional so session cookies, API requests, and authenticated WebSockets work together.
- Render security-probe job results appear in Render logs; run `pnpm security:audit -- --mode remote ...` locally when report files need to land in `eval/results/` on this machine.
- File attachments still require `S3_UPLOADS_BUCKET`, `CDN_DOMAIN`, and AWS credentials if that workflow is included in the demo.

Current public submission evidence, captured 2026-05-23:

- Public app URL: `https://ship-wf2i.onrender.com`
- Render services: `ship`, `ship-db`, and `ship-security-probe`
- Security probe trigger: deployed admin Operations dashboard
- Security probe report: printed in Render cron logs and ended with `--- End Ship Security Probe Markdown Report ---`
- Authenticated coverage: the cron job used `SHIP_SECURITY_EMAIL` and `SHIP_SECURITY_PASSWORD`; authenticated `/events` and `/collaboration/*` WebSocket checks passed
- Browser WebSocket evidence: Chrome DevTools Network `ws` filter confirmed `/events` and `/collaboration/wiki:<document-id>` connections to `ship-wf2i.onrender.com` with status `101` and the browser lock indicator
- Security summary: `0` high/critical dependency CVEs, untrusted CORS origin rejected, CSP present, no secret-like values found on common accidental exposure paths, rate-limit coverage present by code review, malformed JSON did not leak internals, unauthenticated WebSockets rejected, oversized collaboration payload rejected, and `/health` remained `200` after WebSocket probes

## Initial Setup (One-time)

- [ ] Install tools: `terraform`, `awscli`, `awsebcli`, `postgresql@16`
- [ ] Configure AWS credentials: `aws configure`
- [ ] Copy `terraform/terraform.tfvars.example` to `terraform/terraform.tfvars`
- [ ] Edit `terraform/terraform.tfvars` with your configuration
- [ ] Deploy infrastructure: `./scripts/deploy-infrastructure.sh` (10-15 min)
- [ ] Initialize Elastic Beanstalk: `cd api && eb init`
- [ ] Create EB environment: See DEPLOYMENT.md for full `eb create` command (10-15 min)
- [ ] Initialize database: `./scripts/init-database.sh` (2-3 min)
- [ ] Deploy API: `./scripts/deploy-api.sh` (3-5 min)
- [ ] Deploy frontend: `./scripts/deploy-frontend.sh` (2-3 min)

**Total setup time:** ~30-45 minutes

## Regular Deployments (Frequent)

### Deploy API Changes
```bash
./scripts/deploy-api.sh
```
**Time:** 3-5 minutes

### Deploy Frontend Changes
```bash
./scripts/deploy-frontend.sh
```
**Time:** 2-3 minutes

### Deploy Both
```bash
./scripts/deploy-api.sh && ./scripts/deploy-frontend.sh
```
**Time:** 5-8 minutes

## Verification Steps

After deployment, verify:

- [ ] API health check: `curl https://api.example.gov/health`
- [ ] Frontend loads: Open `https://app.example.gov` in browser
- [ ] WebSocket works: Create a new document and test real-time collaboration
- [ ] Database connected: Check API logs for database connection messages
- [ ] CORS configured: Frontend can call API endpoints

## Common Tasks

### View Logs
```bash
cd api
eb logs                # Recent logs
eb logs --stream       # Stream logs
```

### Check Status
```bash
cd api
eb status              # Environment status
eb health              # Detailed health
```

### Update Environment Variables
```bash
# Update SSM parameter
aws ssm put-parameter --name "/ship/dev/DATABASE_URL" --type "SecureString" --value "..." --overwrite

# Restart EB to pick up changes
cd api
eb deploy --staged
```

### Apply Database Migration
```bash
DATABASE_URL=$(aws ssm get-parameter --name "/ship/dev/DATABASE_URL" --with-decryption --query "Parameter.Value" --output text)
psql "$DATABASE_URL" -f api/src/db/schema.sql
```

### SSH to Instance
```bash
cd api
eb ssh
```

## Rollback Procedure

### Rollback API
```bash
cd api
eb deploy --version <previous-version>
```

### Rollback Frontend
```bash
# Find previous version
aws s3api list-object-versions --bucket ship-frontend-dev --prefix index.html

# Restore specific version
aws s3api get-object --bucket ship-frontend-dev --key index.html --version-id <VERSION_ID> index.html
aws s3 cp index.html s3://ship-frontend-dev/index.html

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
```

## Monitoring Dashboards

- **CloudWatch Logs:**
  - `/aws/elasticbeanstalk/ship-api/application`
  - `/aws/elasticbeanstalk/ship-api/nginx`
  - `/aws/rds/cluster/ship-aurora/postgresql`

- **AWS Console:**
  - Elastic Beanstalk: Health and metrics
  - RDS: Aurora cluster performance
  - CloudFront: Cache statistics and errors

## Cost Monitoring

Check current month's costs:
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -v1d +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

Older estimates, retained for audit trail:
- `~$80/month` was the earlier dev-environment checklist estimate.
- `~$113/month` was the earlier Terraform README estimate after adding NAT Gateway.

Those estimates are out of date for the reviewed submission plan because they did not include the corrected full-plan cost drivers: Kinesis-backed CloudFront real-time logs, 180-day retention, WAF Bot Control, public IPv4 charges, CloudWatch/VPC flow logs, and other always-on resources.

Current expected costs for the full Terraform plan:
- Elastic Beanstalk (t3.small): ~$15-$17/month
- Aurora Serverless v2 (0.5 ACU floor): ~$45-$55/month
- Application Load Balancer: ~$17-$25/month at low traffic
- NAT Gateway: ~$33/month plus data processing
- Kinesis real-time CloudFront logs: ~$100+/month with 4 shards and 180-day retention
- WAF + Bot Control: ~$22+/month plus request volume
- Public IPv4 addresses: about ~$11/month
- S3, CloudFront, and CloudWatch logs: variable
- **Total: roughly ~$220-$300/month at low traffic**

For the public submission deployment, this cost finding is why Ship is moving to Render instead of applying the AWS stack. See `DEPLOYMENT_DECISION.md`.

## Emergency Contacts

When things go wrong:

1. **Database issues:** Check Aurora cluster health in RDS console
2. **API not responding:** Check EB environment health and logs
3. **Frontend not loading:** Check CloudFront distribution status
4. **WebSocket failing:** Check ALB target group health and sticky sessions

## Disaster Recovery

### Create Manual Backup
```bash
# Database snapshot
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier ship-aurora \
  --db-cluster-snapshot-identifier ship-manual-backup-$(date +%Y%m%d)

# Frontend backup (already versioned in S3)
aws s3 sync s3://ship-frontend-dev s3://ship-frontend-backup/$(date +%Y%m%d)/
```

### Restore from Backup
See DEPLOYMENT.md "Disaster Recovery" section for detailed restore procedures.
