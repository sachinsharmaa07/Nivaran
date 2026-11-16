# CivicPulse: A MERN Stack Civic Issue Reporting Platform with DevOps Automation

> **Lovely Professional University — School of Computer Science**  
> **Course:** INT333 — DevOps Advance Configuration Management  
> **Submitted by:** Sachin Kumar (Registration No: 12316496)  
> **Submitted to:** Dr. Harpreet Kaur  
> **AWS Region:** Mumbai (`ap-south-1`)

---

## 1. Project Overview & Topology

**CivicPulse** is an automated civic issue reporting and redressal platform. Citizens report civic issues (potholes, garbage, water leaks) with photos and geolocation. Municipal staff review, assign, and mark them resolved with verification.

### Multi-Server DevOps Topology (VPC: `vpc-081589d1cdadacdf0`)

The infrastructure operates in AWS Mumbai (`ap-south-1`) inside a single existing VPC (`vpc-081589d1cdadacdf0`) and subnet (`subnet-09431ac51099cb628`), utilizing the existing key pair `aws`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AWS VPC: vpc-081589d1cdadacdf0                   │
│                                                                             │
│  ┌──────────────────────┐              ┌──────────────────────┐             │
│  │   Terraform Server   │              │    Ansible Server    │             │
│  │ (i-0f6f7fed7bdac92c6)│              │(i-0bfa8a14371a82e18) │             │
│  │ Public: 65.0.122.143 │              │Public: 15.252.108.248│             │
│  │ Private: 172.31.3.124│              │Private: 172.31.4.105 │             │
│  └──────────┬───────────┘              └──────────┬───────────┘             │
│             │ terraform apply                     │ SSH / Ansible           │
│             ▼                                     ▼                         │
│  ┌────────────────────────────────────────────────────────────┐             │
│  │            CivicPulse Target Application Server             │             │
│  │      (t3.small: 2 vCPU, 2 GB RAM, 20 GB gp3, 2GB Swap)      │             │
│  │      Private: 172.31.X.X  |  Public: X.X.X.X (via DuckDNS) │             │
│  │   Docker Compose (8 containers) + 12-Hour Auto-Update Cron │             │
│  └────────────────────────────▲───────────────────────────────┘             │
│                               │ NRPE (Port 5666)                            │
│                               │                                             │
│                ┌──────────────┴───────────────┐                             │
│                │        Nagios Server         │                             │
│                │    (i-0f5d8db5fa0d4b915)     │                             │
│                │    Public: 15.206.211.22     │                             │
│                │    Private: 172.31.9.205     │                             │
│                └──────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tools & Purpose

| Tool                 | Purpose in this Project                                                                                         |
| :------------------- | :-------------------------------------------------------------------------------------------------------------- |
| **Git & GitHub**     | Version control with feature branches and pull request workflows.                                               |
| **GitHub Actions**   | Automated CI/CD pipeline: test frontend & backend, validate Docker, build images, and push to Docker Hub.       |
| **Docker & Compose** | Containerises client, server, and databases with healthchecks and isolated networks.                            |
| **Terraform**        | IaC provisioning ONE `t3.small` instance in existing VPC/subnet with dedicated security group and IMDSv2.       |
| **Ansible**          | Configures the application server over VPC private IP: installs Docker, sets up NRPE, 2GB swap, & 12-hour cron. |
| **Nagios**           | Centrally monitors host health: PING, CPU load, root disk space, memory, Docker daemon, and `/readyz` health.   |
| **DuckDNS**          | Dynamic DNS (`civicpulse.duckdns.org`), eliminating the need for paid Elastic IPs.                              |
| **12-Hour Cron Job** | Scheduled automation on EC2: pulls latest images, recreates containers, checks `/readyz`, prunes dangling.      |

---

## 3. Dedicated Security Group (Minimal Inbound)

The security group (`civicpulse-app-sg`) enforces strict least-privilege access:

| Port        | Protocol | Source                                                    | Purpose                                                      |
| :---------- | :------- | :-------------------------------------------------------- | :----------------------------------------------------------- |
| **22**      | TCP      | `172.31.4.105/32`, `15.252.108.248/32`, `172.31.3.124/32` | SSH restricted to Ansible and Terraform management instances |
| **80**      | TCP      | `0.0.0.0/0`                                               | Public HTTP traffic (routed by Caddy reverse proxy)          |
| **443**     | TCP      | `0.0.0.0/0`                                               | Public HTTPS traffic (routed by Caddy reverse proxy)         |
| **5666**    | TCP      | `172.31.9.205/32`                                         | Nagios NRPE monitoring strictly from Nagios private IP       |
| **All Out** | All      | `0.0.0.0/0`                                               | Package downloads, Docker Hub image pulls, and notifications |

_Internal database ports (PostgreSQL 5432, MongoDB 27017, Redis 6379) are NEVER exposed to the host or internet; they reside exclusively on the private Docker bridge network._

---

## 4. Complete Step-by-Step AWS Hosting Guide

Follow these steps sequentially to host the application across your 3 management instances in AWS Mumbai.

### Phase 0: Prerequisites & Setup Checklist

1. **SSH Key Pair:**
   Ensure `aws.pem` is present with correct permissions on your local machine and management instances:
   ```bash
   chmod 400 ~/.ssh/aws.pem
   ```
2. **GitHub Secrets:**
   In your GitHub repository (`Settings > Secrets and variables > Actions > Repository secrets`), confirm:
   - `DOCKERHUB_USERNAME`: Your Docker Hub username.
   - `DOCKERHUB_TOKEN`: Your Docker Hub Personal Access Token (Read & Write).
3. **DuckDNS Account:**
   - Sign in at [duckdns.org](https://www.duckdns.org).
   - Create domain: `civicpulse` (full domain: `civicpulse.duckdns.org`).
   - Keep your DuckDNS Token handy.

---

### Phase 1: Trigger GitHub Actions CI/CD Pipeline

Push your code to the `main` branch (or go to GitHub > Actions > **CI/CD Pipeline** > **Run workflow**):

The pipeline executes these 5 stages:

1. **1. Frontend Testing:** Installs dependencies and runs `pnpm --filter @nivaran/web build` and `vitest run apps/web`.
2. **2. Backend Testing:** Runs TypeScript compilation check on `@nivaran/shared` and `@nivaran/api`.
3. **3. Docker Image Validation:** Runs `docker build --check` on both Dockerfiles and verifies Compose configurations.
4. **4. Docker Image Build:** Builds `civicpulse-web` and `civicpulse-api` tagged with `latest` and `${{ github.sha }}`.
5. **5. Push to Docker Hub:** Authenticates via secrets and pushes both tagged images to Docker Hub.

_Wait for all 5 stages to display green checkmarks in GitHub Actions before proceeding to Step 2._

---

### Phase 2: Provision Application Server with Terraform

SSH into your existing **Terraform Server** (`65.0.122.143`):

```bash
# 1. SSH into the Terraform management server
ssh -i ~/.ssh/aws.pem ubuntu@65.0.122.143

# 2. Navigate to the repository Terraform directory
cd ~/Nivaran/infra/terraform

# 3. Pull latest code
git pull origin main

# 4. Initialize Terraform plugins
terraform init

# 5. Review the execution plan (creates 1 EC2 t3.small + 1 Security Group)
terraform plan

# 6. Apply the infrastructure
terraform apply -auto-approve
```

**Terraform Output Reference:**

```
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.

Outputs:
instance_id          = "i-0a1b2c3d4e5f6g7h8"
private_ip           = "172.31.X.X"
public_ip            = "13.233.X.X"
ssh_command_private  = "ssh -i ~/.ssh/aws.pem ubuntu@172.31.X.X"
ssh_command_public   = "ssh -i ~/.ssh/aws.pem ubuntu@13.233.X.X"
```

> **Note:** Copy the `private_ip` (e.g. `172.31.12.34`) and `public_ip` for the next steps.

---

### Phase 3: Configure Server & Deploy Containers with Ansible

SSH into your existing **Ansible Server** (`15.252.108.248`):

```bash
# 1. SSH into the Ansible management server
ssh -i ~/.ssh/aws.pem ubuntu@15.252.108.248

# 2. Navigate to the Ansible directory
cd ~/Nivaran/infra/ansible

# 3. Pull latest code
git pull origin main

# 4. Export DuckDNS variables (for automatic DNS updates)
export DUCKDNS_DOMAIN="civicpulse"
export DUCKDNS_TOKEN="your-duckdns-token-here"

# 5. Generate inventory using the new Application Server's private IP
./generate-inventory.sh 172.31.X.X ~/.ssh/aws.pem

# 6. Verify SSH connectivity from Ansible server to App server
ansible -i inventory.ini app -m ping

# 7. Execute the Ansible deployment playbook
ansible-playbook -i inventory.ini playbook.yml
```

**What Ansible executes on the target server:**

1. Creates a **2GB swapfile** (`/swapfile`) with swappiness=20 so the 8-container stack runs safely on 2GB RAM.
2. Installs `docker.io`, `docker-compose-v2`, `nagios-nrpe-server`, `nagios-plugins`, and system utilities.
3. Sets `allowed_hosts=127.0.0.1,::1,172.31.9.205` in `/etc/nagios/nrpe.cfg` to allow only the Nagios server.
4. Deploys `compose.prod.yml`, `Caddyfile`, and `auto-update.sh` to `/opt/civicpulse`.
5. Registers the **12-hour container auto-update cron job** (`0 */12 * * *`).
6. Registers the **DuckDNS dynamic IP update cron** (`*/5 * * * *`).
7. Pulls Docker Hub images and starts all 8 services via Docker Compose.
8. Verifies the application readiness endpoint (`http://127.0.0.1:80/readyz`) returns HTTP 200 OK.

---

### Phase 4: Configure Monitoring on Nagios Server

SSH into your existing **Nagios Server** (`15.206.211.22`):

```bash
# 1. SSH into the Nagios management server
ssh -i ~/.ssh/aws.pem ubuntu@15.206.211.22

# 2. Navigate to the Nagios configuration directory
cd ~/Nivaran/infra/nagios

# 3. Pull latest code
git pull origin main

# 4. Copy the CivicPulse monitoring configuration to Nagios
sudo cp civicpulse.cfg /etc/nagios4/conf.d/civicpulse.cfg

# 5. Replace the placeholder IP with the actual Application Server private IP
sudo sed -i 's/172.31.X.X/<APP_PRIVATE_IP>/g' /etc/nagios4/conf.d/civicpulse.cfg

# 6. Verify Nagios syntax
sudo nagios4 -v /etc/nagios4/nagios.cfg

# 7. Restart the Nagios daemon
sudo systemctl restart nagios4
```

**Verify in Browser:**

1. Open `http://15.206.211.22/nagios4` in your web browser.
2. Click **Services** in the left sidebar.
3. Confirm that all 6 checks show **OK (Green)**:
   - **PING Status:** Host latency & packet loss.
   - **CPU Load:** System load averages via NRPE.
   - **Disk Space (Root /):** Free disk capacity via NRPE.
   - **Memory Usage:** RAM & swap utilization via NRPE.
   - **Docker Daemon Status:** Checks `dockerd` process via NRPE.
   - **CivicPulse App Readyz:** End-to-end HTTP `/readyz` probe.

---

### Phase 5: Google OAuth / Auth0 Configuration for DuckDNS

Configure your authentication provider so citizens can log in with Google:

#### Google Cloud Console:

1. Navigate to [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials).
2. Edit your **OAuth 2.0 Client ID**.
3. Under **Authorized JavaScript origins**, add:
   - `https://civicpulse.duckdns.org`
   - `http://localhost:5173` (for local development)
4. Under **Authorized redirect URIs**, add:
   - `https://civicpulse.duckdns.org/api/v1/auth/google/callback`
   - `http://localhost:4000/api/v1/auth/google/callback` (for local development)
5. Save changes.

#### Auth0 (Alternative):

1. Navigate to **Applications > Applications > Your App > Settings**.
2. **Allowed Callback URLs:** `https://civicpulse.duckdns.org/api/v1/auth/google/callback`
3. **Allowed Web Origins:** `https://civicpulse.duckdns.org`
4. **Allowed Logout URLs:** `https://civicpulse.duckdns.org`
5. Save changes.

---

### Phase 6: Live Class Demonstration Script (for Dr. Harpreet Kaur)

Follow this presentation sequence in class:

1. **Architecture Overview (2 mins):**
   - Show the 4-server topology (Terraform, Ansible, Nagios, CivicPulse App).
   - Explain that all communication between management nodes and the app server uses VPC private IPs (`172.31.X.X`).
2. **Infrastructure as Code (2 mins):**
   - Show `infra/terraform/main.tf` and `infra/terraform/outputs.tf`.
   - Explain the minimal security group: ports 22 (admin/Ansible only), 80/443 (public), and 5666 (Nagios only).
3. **Ansible & Configuration Management (2 mins):**
   - Show `infra/ansible/playbook.yml`.
   - Highlight the automatic 2GB swap setup, NRPE security restrictions, and cron automation.
4. **12-Hour Cron Auto-Update Demo (2 mins):**
   - SSH to the App Server: `ssh -i ~/.ssh/aws.pem ubuntu@<APP_PRIVATE_IP>`
   - Show the cron entry: `crontab -l`
   - Show the auto-update log: `tail -n 15 /var/log/nivaran-autoupdate.log`
   - Run manual test: `sudo /bin/bash /opt/civicpulse/auto-update.sh`
5. **Live Outage & Recovery Drill (Nagios Alert) (3 mins):**
   - On the App Server, simulate an API failure:
     ```bash
     docker stop $(docker ps -qf "name=api")
     ```
   - In Nagios UI (`http://15.206.211.22/nagios4`), show **CivicPulse App Readyz** turning **CRITICAL** (Red).
   - Restore the container:
     ```bash
     docker start $(docker ps -a -qf "name=api")
     ```
   - In Nagios UI, watch the check turn back to **OK** (Green).
6. **Live CivicPulse Application Walkthrough (3 mins):**
   - Open `https://civicpulse.duckdns.org`.
   - Log in as Citizen (`citizen@punjab.local` / `Password123!`).
   - Submit an issue with photo & geolocation.
   - Switch to Staff queue (`staff@punjab.local`) and mark resolved.

---

### Phase 7: Post-Presentation Teardown (Budget Safety)

To avoid incurring ongoing EC2 charges:

```bash
# On the Terraform Server (65.0.122.143)
cd ~/Nivaran/infra/terraform
terraform destroy -auto-approve
```

_This terminates the Application Server and deletes its security group immediately. The 3 management EC2 instances remain untouched._

---

## 5. Local Quickstart & Verification

```sh
# 1. Start all local services
make up

# 2. Run database migrations & seed demo data
make migrate && make seed

# 3. Verify health & run end-to-end verification flow
curl http://localhost:4000/readyz
make demo-flow
```

- **Web App:** http://localhost:5173
- **REST API:** http://localhost:4000 (Readiness: http://localhost:4000/readyz)
- **Mailpit:** http://localhost:8025
- **Default Accounts:** `citizen@punjab.local`, `staff@punjab.local` (Password: `Password123!`)

---

## 6. Budget Analysis & Resource Limits

### Budget Constraints ($10 per 3 days):

- **Budget Available:** \$10.00 / 3 days = **\$3.33 / day**
- **Application Server Cost:**
  - `t3.small` On-Demand in Mumbai (`ap-south-1`): \$0.0208 / hour = **\$0.50 / day**
  - 20 GB gp3 root EBS volume: \$0.08 / GB-month = **\$0.05 / day**
  - Total Application Server cost: **~\$0.55 / day** (~\$1.65 for 3 days)
  - **Remaining Budget Margin:** **~\$8.35** safety buffer.
- **Cost Minimization Measures:**
  1. No Elastic IP provisioned (saves \$0.005/hr idle charges).
  2. No NAT Gateways or redundant VPC infrastructure created.
  3. Image pruning enabled in 12-hour cron to stay well within 20 GB gp3 storage.

### Memory Optimization on 2 GB RAM (t3.small):

The production Docker Compose allocates strictly bounded memory ceilings totaling ~1.7 GB, backed by a **2 GB active swapfile**:

| Service                    | CPU Limit | Memory Limit                                     |
| :------------------------- | :-------- | :----------------------------------------------- |
| **Caddy**                  | 0.5 vCPU  | 64 MB                                            |
| **PostgreSQL (PostGIS)**   | 0.5 vCPU  | 384 MB                                           |
| **MongoDB**                | 0.5 vCPU  | 384 MB                                           |
| **Redis**                  | 0.25 vCPU | 64 MB                                            |
| **Express API**            | 0.75 vCPU | 384 MB                                           |
| **Background Worker**      | 0.25 vCPU | 128 MB                                           |
| **Web SPA**                | 0.25 vCPU | 64 MB                                            |
| **AI Python Microservice** | 0.5 vCPU  | 256 MB                                           |
| **Total Allocation**       | —         | **~1,728 MB** (Headroom: 320 MB RAM + 2 GB Swap) |
