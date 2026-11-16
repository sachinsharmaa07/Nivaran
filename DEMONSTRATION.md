# CivicPulse (Nivaran) — Project Demonstration Guide
**Course:** INT333 — DevOps Advance Configuration Management  
**Student:** Sachin Kumar (Registration No: 12316496) — Lovely Professional University  
**AWS Region:** Mumbai (`ap-south-1`)  
**Public Application URL:** [http://13.232.252.204](http://13.232.252.204) (or [https://civicpulse.duckdns.org](https://civicpulse.duckdns.org))  
**Nagios Monitoring Dashboard:** [http://15.206.211.22/nagios/](http://15.206.211.22/nagios/) (User: `nagiosadmin`)

---

## 1. Multi-Server DevOps Topology & Architecture

Demonstrate the 4-server AWS topology running inside VPC `vpc-081589d1cdadacdf0`:

| Server Name | Instance ID | Public IP | Private IP | Role & Services |
| :--- | :--- | :--- | :--- | :--- |
| **Terraform Server** | `i-0f6f7fed7bdac92c6` | `65.0.122.143` | `172.31.3.124` | IaC server that provisioned the target application EC2 and dedicated security group |
| **Ansible Server** | `i-0bfa8a14371a82e18` | `15.252.108.248` | `172.31.4.105` | Configuration management server that installs Docker, NRPE, 2GB swap, cron jobs & deploys compose |
| **Nagios Server** | `i-0f5d8db5fa0d4b915` | `15.206.211.22` | `172.31.9.205` | Central monitoring station tracking host alive (ICMP), CPU, disk, memory, dockerd, and `/readyz` |
| **CivicPulse App Server** | `i-0500f522014a550ae` | `13.232.252.204` | `172.31.13.92` | Single `t3.small` instance hosting 8 healthy Docker containers behind Caddy reverse proxy |

---

## 2. Step-by-Step Demonstration Script for Evaluators

### Step 1: IaC with Terraform (Demonstrate on Terraform Server)
1. **SSH into Terraform Server:**
   ```bash
   ssh -i ~/.ssh/aws.pem ubuntu@65.0.122.143
   cd ~/Nivaran/infra/terraform
   ```
2. **Show Terraform configuration & State:**
   ```bash
   terraform -version
   terraform show
   ```
3. **Key Points to Explain:**
   - Single `t3.small` instance created with IMDSv2 token enforcement.
   - Dedicated security group `civicpulse-app-sg` restricts SSH only to Ansible (`172.31.4.105`) and Terraform (`172.31.3.124`), NRPE only to Nagios (`172.31.9.205`), and exposes only ports 80/443 publicly.
   - Database ports (5432, 27017, 6379) are completely closed from the outside and reside solely on the internal Docker bridge network.

---

### Step 2: Automated Configuration Management with Ansible (Demonstrate on Ansible Server)
1. **SSH into Ansible Server:**
   ```bash
   ssh -i ~/.ssh/aws.pem ubuntu@15.252.108.248
   cd ~/Nivaran/infra/ansible
   ```
2. **Verify Connectivity & Playbook Execution:**
   ```bash
   ansible -i inventory.ini app -m ping
   ansible-playbook -i inventory.ini playbook.yml
   ```
3. **Key Points to Explain:**
   - **Idempotency:** Playbook can run repeatedly with 0 failures (`failed=0`).
   - **Swap Optimization:** Automatically creates a 2GB swapfile (`/swapfile`) with swappiness=20 so 8 containers run reliably within 2GB physical RAM.
   - **Automated Maintenance:** Schedules 12-hour container auto-update cron (`0 */12 * * *`) and dynamic DNS updater.
   - **Verification:** Automatically queries `/readyz` and verifies HTTP 200 before completing.

---

### Step 3: Central Health & Service Monitoring (Demonstrate on Nagios Server)
1. **Open Nagios Web Console in Browser:**
   - **URL:** `http://15.206.211.22/nagios/`
   - **Username:** `nagiosadmin`
   - Click **Services** in the left navigation sidebar.
2. **Show All 7 Active Checks for `civicpulse-app` showing OK (Green):**
   - **PING Status:** Latency < 0.3ms, 0% packet loss over AWS private VPC.
   - **CPU Load:** NRPE checks 1, 5, 15 minute load averages.
   - **Root Disk Space:** Verifies >20% free gp3 volume capacity.
   - **Memory Usage:** Monitors RAM + 2GB swap utilization.
   - **Docker Daemon Status:** Checks `dockerd` process status via NRPE.
   - **CivicPulse App Readyz:** Probes internal `/readyz` endpoint via NRPE.
   - **HTTP Port 80 Health Probe:** Direct HTTP health check via Caddy reverse proxy.
3. **CLI Verification on Nagios Server:**
   ```bash
   ssh -i ~/.ssh/aws.pem ubuntu@15.206.211.22
   /usr/local/nagios/libexec/check_nrpe -H 172.31.13.92 -c check_readyz
   /usr/local/nagios/libexec/check_nrpe -H 172.31.13.92 -c check_docker
   ```

---

### Step 4: Live Application Demonstration (In Browser)
1. **Open the Portal:**
   - Visit: `http://13.232.252.204`
2. **Multi-Tenancy & Local Language Selection:**
   - Switch tenant city: Select **Amritsar (demo-punjab)**, **Pune (demo-maharashtra)**, or **Mumbai (mc-mumbai)**.
   - Switch language: Select **English**, **Hindi (हिंदी)**, or **Punjabi (ਪੰਜਾਬੀ)**.
3. **Citizen Sign-In & Google OAuth 2.0:**
   - Click **Sign In** in the top navigation.
   - Check the citizen data processing consent box.
   - Click **Continue with Google** — demonstrates seamless OAuth 2.0 authentication, linking citizen profile, and issuing secure session tokens.
4. **Report a Civic Issue:**
   - Click **Report an Issue** wizard.
   - Select category (Pothole / Road Damage, Garbage / Solid Waste, Water Leakage).
   - Set location on interactive Leaflet map.
   - Submit issue: System creates immutable audit log, assigns ticket ID, and calculates SLA timer.
5. **Municipal Staff Redressal:**
   - Navigate to `/staff` workbench.
   - View triaged issues, filter by category and SLA urgency.
   - Assign to field crew, transition status from `REPORTED` -> `IN_PROGRESS` -> `RESOLVED`.
   - Attach resolution photo and citizen feedback verification.
6. **Public Transparency Dashboard:**
   - Navigate to `/dashboard` to view real-time SLA metrics, resolution velocity, and geographical heatmaps.

---

### Step 5: Automated End-to-End Demo Script Execution
Run the automated demonstration script that performs the complete lifecycle programmatically:
```bash
node scripts/demo-flow.mjs
```
Expected output:
- Registers citizen in `demo-punjab`.
- Submits civic issue with photo and GPS coordinates.
- Triggers duplicate detection and severity scoring.
- Performs staff triage and crew assignment.
- Submits resolution with photographic evidence.
- Verifies SLA metrics and public dashboard data.

---

### Step 6: Production Security & Smoke Verification
Run the production smoke verification tool to prove least-privilege security:
```bash
node scripts/prod-smoke.mjs http://13.232.252.204
```
Results to show evaluator:
- `[PASS] /api/v1/healthz: HTTP 200`
- `[PASS] /readyz: HTTP 200`
- `[PASS] Port 5432 (PostgreSQL): Closed (connection timed out)`
- `[PASS] Port 27017 (MongoDB): Closed (connection timed out)`
- `[PASS] Port 6379 (Redis): Closed (connection timed out)`
