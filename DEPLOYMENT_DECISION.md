# Deployment Decision: Render over AWS

**Date:** 2026-05-22
**Status:** Decision recorded; public deployment target changed from AWS to Render.

## Decision

Ship will not proceed with the full AWS Terraform deployment for the submission environment. The improved fork should be deployed to Render instead.

The AWS infrastructure remains useful as a government/compliance reference architecture, but the estimated steady-state cost is too high for a short-lived public submission demo.

## Current AWS State

No Ship application stack has been deployed to AWS.

The only AWS resources created during setup were the Terraform remote-state bootstrap resources:

- S3 bucket: `ship-terraform-state-211026994624`
- S3 bucket encryption, versioning, and public access block
- SSM parameter: `/ship/terraform-state-bucket`
- SSM configuration parameters used for Terraform setup
- IAM Identity Center / SSO profile and AdministratorAccess role assignment

Those bootstrap and identity resources have effectively no meaningful monthly run cost at the current empty/low-usage state. The full application plan was reviewed but not applied.

## AWS Plan Reviewed

The corrected Terraform plan showed:

```text
Plan: 74 to add, 0 to change, 0 to destroy.
```

The planned stack included:

- VPC with two public subnets, two private subnets, Internet Gateway, NAT Gateway, and VPC Flow Logs
- Elastic Beanstalk Docker environment for the Express/WebSocket API
- Application Load Balancer
- Aurora PostgreSQL Serverless v2, min `0.5 ACU`, max `4 ACU`
- S3 buckets for frontend and uploads
- CloudFront distribution for the frontend/API routing
- CloudFront real-time logs delivered to Kinesis
- Kinesis Data Stream with `4` provisioned shards and `180` day retention
- AWS WAF WebACL with managed rule groups and Bot Control
- CloudWatch log groups and SSM parameters

Relevant Terraform references:

- `terraform/vpc.tf`
- `terraform/elastic-beanstalk.tf`
- `terraform/database.tf`
- `terraform/s3-cloudfront.tf`
- `terraform/cloudfront-logging.tf`
- `terraform/waf.tf`
- `terraform/variables.tf`

## Cost Finding

Earlier documentation carried two lower AWS estimates:

| Older estimate | Where it appeared | Why it is out of date |
|---|---|---|
| `~$80/month` | Deployment guide/checklist dev-environment estimate | Covered only the basic EB `t3.small`, Aurora `0.5 ACU`, ALB, and S3/CloudFront path. |
| `~$113/month` | Terraform README estimate | Added NAT Gateway, but still omitted the later full-plan cost drivers. |

Those estimates are now out of date for the reviewed submission plan because the corrected Terraform plan also includes Kinesis-backed CloudFront real-time logs, 180-day stream retention, WAF Bot Control, public IPv4 charges, CloudWatch/VPC flow logs, and other always-on production-style resources.

The low-traffic estimate for leaving the current AWS plan running 24/7 is approximately:

```text
$220-$300/month, with about $250/month as the working budget estimate.
```

Primary fixed or near-fixed cost drivers:

| Component | Terraform basis | Rough monthly estimate |
|---|---|---:|
| Kinesis real-time CloudFront logs | `4` provisioned shards, `180` day retention | `$100+` |
| Aurora Serverless v2 | min `0.5 ACU`, max `4 ACU` | `$45-$55` at minimum capacity |
| NAT Gateway | one gateway enabled for private subnets | `$33+` plus data processing |
| Application Load Balancer | EB load-balanced environment | `$17-$25` at low traffic |
| Elastic Beanstalk EC2 | min `1`, max `4`, `t3.small` | `$15-$17` minimum |
| AWS WAF + Bot Control | WebACL, managed rule groups, Bot Control Common | `$22+` plus requests |
| Public IPv4 addresses | NAT/ALB-related public IPv4 usage | about `$11` |
| CloudWatch, S3, CloudFront | logs, storage, requests, transfer | variable, usually low at demo traffic |

The estimate can increase materially if traffic rises, CloudFront/WAF request volume grows, NAT processes more data, VPC flow logs become noisy, or Aurora scales above the `0.5 ACU` floor. At the configured `4 ACU` maximum, Aurora database compute alone can add several hundred dollars per month during sustained load.

## Rationale for Render

Render is the better submission target because it lowers the fixed monthly cost and reduces deployment complexity while still supporting the application shape:

- Express API as a long-running web service
- Persistent WebSocket collaboration server
- Managed PostgreSQL
- Static React frontend
- Public URL suitable for grader/demo access

Implementation note: the Render submission deployment serves the static React build from the same Express web service. This keeps Ship's session cookies, REST API calls, `/events`, and `/collaboration/*` WebSockets on one origin while preserving the static Vite frontend build.

The submission does not require proving the full government AWS architecture in a live account. It requires an improved fork running publicly. Render satisfies that requirement with lower operational overhead and a more appropriate cost profile for a demo deployment.

## AWS Revisit Criteria

AWS should be revisited if the deployment target changes from public demo to production/government hosting, or if a compliance environment specifically requires AWS/GovCloud controls.

Before applying the AWS stack later, reduce or make optional the expensive observability/security features for non-production environments:

1. Disable or downsize CloudFront real-time Kinesis logging for demo/staging.
2. Reduce Kinesis retention from `180` days unless long retention is required.
3. Consider disabling WAF Bot Control outside production.
4. Re-check NAT Gateway need and consider VPC endpoints where useful.
5. Re-run the AWS Pricing Calculator using the exact Terraform plan and expected traffic.
