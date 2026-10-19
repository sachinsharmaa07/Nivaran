---
trigger: glob
globs: "infra/**, **/Dockerfile*, .github/**, Makefile, **/*.tf, **/*.yml, **/*.yaml"
description: "Docker, Compose, CI, Helm, Terraform, Ansible and AWS safety rules."
---

# Infrastructure rules (full detail: @docs/SPEC.md sections 10 and 11, @docs/PHASES.md P0, P11, P12)

1. Images: pinned tags (never `latest`), multi-stage, non-root user, no secrets baked in, healthcheck defined.
2. Compose: `core` and `app` profiles, `depends_on` with `service_healthy`, resource limits set (these become Kubernetes requests and limits later).
3. Config only from environment variables. `.env.example` has no real secrets. Never commit `.env`, `*.tfstate` or `*.tfvars`.
4. The Makefile is the human interface. Every target is documented in README and idempotent where possible.
5. CI: least-privilege `permissions:` block, pinned third-party action versions, no secrets in logs, AWS access via GitHub OIDC only (no long-lived keys).
6. Terraform and AWS: the agent writes code and runs `terraform fmt`, `validate` and `plan` only. **The agent never runs `terraform apply`, `terraform destroy`, or any AWS command that creates, changes or deletes billable resources.** Print the plan and ask the human to run it (AGENTS.md N9).
7. Every AWS resource is tagged (`project=nivaran`, `env`, `owner`). Budgets and alarms are part of the first apply.
8. Least privilege: no wildcard IAM actions or resources without a written justification in the PR.
9. Private resources (EKS nodes, RDS, MongoDB host) live in private subnets with no public IP. Administration through SSM Session Manager, no public SSH.
10. Document honestly that private subnets in AWS are network segmentation inside a public cloud, not a private cloud.
11. Cost claims use current pricing verified at the time. Say "verify current pricing" instead of quoting stale numbers.
