# HUMAN-CHECKLIST: what only you can do

The agent must never do these (AGENTS.md N9). Tick them off here and in `PROGRESS.md` Human actions.

## A. Install tools (once, before P0)

Install **only** this table now. Python is not needed on your machine: the AI service runs and is tested inside its container. k6, Trivy and gitleaks also run from Docker or CI, so do not install them. Install kind and Helm only when P11 starts, and Terraform, Ansible, AWS CLI and kubectl only when P12 starts.

| Tool                           | Why                   | Verify                   |
| ------------------------------ | --------------------- | ------------------------ |
| Git                            | version control       | `git --version`          |
| Docker Desktop (Compose v2)    | runs every service    | `docker compose version` |
| Node.js LTS via `fnm` or `nvm` | web and api           | `node -v`                |
| pnpm (`corepack enable`)       | monorepo packages     | `pnpm -v`                |
| make                           | the command interface | `make --version`         |
| GitHub CLI `gh` (optional)     | easier login and PRs  | `gh --version`           |
| VS Code or Antigravity IDE     | editing               | opens a folder           |

**Windows:** install WSL2 (Ubuntu), enable Docker Desktop's WSL integration, and do everything (git, node, make, repo) **inside WSL**. Keep the repo in the WSL filesystem (`~/projects/nivaran`), not under `C:\`, or Docker will be slow.

Make sure virtualisation is enabled in BIOS and Docker Desktop has at least 6 GB RAM allocated.

## B. GitHub and the repo

1. Create a **private** GitHub repository named `nivaran`. Do not add a README or license in the creator.
2. Set your identity: `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`.
3. Log in: `gh auth login` (or set up an SSH key).
4. Make the folder and unzip the agent kit into it so `AGENTS.md` sits at the root:
   ```
   mkdir -p ~/projects/nivaran && cd ~/projects/nivaran && git init -b main
   unzip /path/to/nivaran-agent-kit.zip -d . && ls -a
   ```
   The unzip creates a nested `nivaran-agent-kit/` folder. Move everything up, including hidden files (`.agents`, `.gitignore`), with:
   ```
   cp -a nivaran-agent-kit/. . && rm -rf nivaran-agent-kit && ls -a
   ```
   You should now see `AGENTS.md`, `PROGRESS.md`, `.agents`, `docs` at the top level.
5. Put your original master prompt in `docs/00-master-prompt.md` (optional but good for evaluators).
6. First commit and push:
   ```
   git add -A && git commit -m "chore: add agent kit and project specs"
   git remote add origin git@github.com:<you>/nivaran.git && git push -u origin main
   ```
7. In GitHub: Settings, Branches, protect `main` (require pull request). Do this before P0 ends.

## C. Antigravity setup

1. Download from antigravity.google/download, install, sign in with your Google account.
2. Open the `nivaran` folder as the workspace.
3. **Permission preset** (Settings, General, Permission Settings; project override under Settings, Projects):
   - macOS or Linux: choose **Request Review** while Docker work is happening (the Default sandbox may block Docker). Never use **Turbo**.
   - Windows: set Terminal command auto execution to **Request Review**. Never **Always Proceed**.
   - Optional once you trust it: add allow rules for read-only commands (`git status`, `git diff`, `git log`, `docker compose ps`, `docker compose logs`) and deny rules for `git push`, `git reset --hard`, `rm -rf`, `docker system prune`, `terraform apply`, `terraform destroy`. See the Permissions page in the Antigravity docs for the rule syntax.
4. Customizations (the "..." menu in the agent panel, or the Customizations panel in the app): confirm
   - Rules list `AGENTS.md` and five files from `.agents/rules/`.
   - Skills list `phase-audit`, `phase-plan`, `phase-implement`, `phase-review`, `phase-recover`, `phase-close`.
     Rule files over 24 KB are truncated; keep them short. Rules inside `.agents/rules/` need frontmatter, otherwise they are silently ignored.
5. **Do not install anything else in Antigravity:** no plugins, no MCP servers, no marketplace skills, no global rules or skills. The project's rules and skills come only from the repo. If it offers to install an extension, decline.
6. Browser: allow the agent's browser to open `http://localhost:5173` for UI checks.
7. Run the Step 0 prompt in `docs/PROMPTS.md` and confirm it passes before anything else.

## D. Gemini API key (needed from P9, create it then)

1. Go to Google AI Studio, choose Get API key, create a key in a **new project used only for Nivaran**.
2. Copy it into your local `.env` as `GEMINI_API_KEY=...`. Never paste it into chat, never commit it. `.env` is gitignored.
3. Open the current Gemini API pricing and terms pages and note, in `PROGRESS.md` Assumptions: the free-tier rate limits, and whether free-tier content may be used to improve Google products. Verify on the pages; limits and terms change. This is why the spec redacts personal data before any call.
4. If you hit quota limits during evaluation, wait or slow the evaluation script. Do not switch to paid usage without deciding deliberately.

## E. AWS account (only before P12, never earlier)

1. Create the account with a card. Enable MFA on the root user. Do not use root for daily work.
2. Create an IAM Identity Center user or an IAM admin user with MFA. Configure the AWS CLI profile (`aws configure sso` or `aws configure`).
3. **Set a budget and alert first:** Billing, Budgets, a monthly cost budget with email alerts at a low threshold, plus a zero-spend or low-spend alert. Check what free-tier or credit terms apply to a new account today.
4. Choose one region close to you (for example Mumbai) and stay in it.
5. At the start of P12 (not before; Helm and kind were installed at P11), install Terraform, kubectl and Ansible. Verify with `terraform -version`, `kubectl version --client`, `helm version`, `ansible --version`.
6. During P12 you run `terraform plan` output review, then `terraform apply` **yourself**. After every demo run teardown yourself, then check the console (EC2, EKS, RDS, NAT gateways, load balancers, EBS volumes, Elastic IPs) is empty. Look at Cost Explorer the next day.
7. Do not leave EKS, NAT gateways or RDS running overnight.

## F. Running and inspecting local services

You do not install databases. `make up` starts them in Docker.

| What          | How to open                                                                            | Notes                                         |
| ------------- | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| App           | http://localhost:5173                                                                  | web                                           |
| API health    | http://localhost:4000/healthz                                                          |                                               |
| AI health     | http://localhost:8000/healthz                                                          |                                               |
| MongoDB       | MongoDB Compass or `mongosh "mongodb://localhost:27017/nivaran?directConnection=true"` | Use `directConnection=true` from your machine |
| PostgreSQL    | `psql` or DBeaver or pgAdmin, host localhost, port 5432                                | Credentials come from your `.env`             |
| Redis         | `redis-cli -h localhost`                                                               |                                               |
| MinIO console | http://localhost:9001                                                                  | Login from `.env`                             |
| Mailpit inbox | http://localhost:8025                                                                  | All emails the app sends appear here          |

Useful: `docker compose ps`, `make logs s=api`, `make down` (stops, keeps data), `make reset` (stops and **wipes** data).

**Testing on your phone:** browsers allow geolocation, service workers and PWA install only on HTTPS (except localhost). Plain `http://<laptop-ip>:5173` will not give GPS. At P4, use the local HTTPS approach the plan proposes (a trusted local certificate or a temporary tunnel). Keep your laptop and phone on the same Wi-Fi if using the certificate route.

## G. The per-phase ritual

1. New conversation, `/phase-audit`. 2. `/phase-plan Pn`, read, approve. 3. `/phase-implement Pn`. 4. You test (PROMPTS section 8). 5. `/phase-review Pn` with the other model. 6. Fixes. 7. `/phase-close Pn`. 8. You run:

```
git add -A && git commit -m "<message from the agent>" && git tag pN-done && git push --follow-tags
```

Push only after the checks pass. Use feature branches and pull requests once CI exists (end of P0).

## H. Getting support

| Problem                                | Go to                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Antigravity behaviour, settings, quota | Antigravity docs (rules, skills, permissions, plans pages), in-app feedback, `/usage` for quota         |
| Gemini key or quota                    | Google AI Studio and the Gemini API documentation and pricing pages                                     |
| Docker won't start or is slow          | Docker Desktop Troubleshoot menu and its docs; check WSL integration and RAM                            |
| Git or GitHub login                    | GitHub Docs, `gh auth status`                                                                           |
| MongoDB or PostGIS questions           | Official MongoDB docs and PostGIS docs, then their community forums                                     |
| AWS billing or account                 | AWS Support (the free basic plan covers billing and account issues); technical questions on AWS re:Post |
| Your design or rubric questions        | Your capstone mentor                                                                                    |
| Anything else                          | Ask Claude or Antigravity with the exact error text and the command that produced it                    |

When asking anyone for help, include: what you ran, the exact error, what you expected, and the output of `git status`.

## I. Red flags: stop and use `/phase-recover`

- It says "should work", "I've fixed it" or "tests pass" without showing output.
- It created `NOTES.md`, `PLAN.md`, `SUMMARY.md` or any file not in AGENTS.md section 4.
- It installed or added anything not on the phase's Dependencies line, used `create-vite`, `npx`, `pnpm dlx`, a global install, or `sudo`.
- `git diff -- '**/package.json'` shows a package you did not approve, or `make deps-check` fails.
- It edited or deleted tests so they pass.
- It touched files unrelated to the phase, or started the next phase.
- It asked you for an API key or password in chat.
- It tried to run `git push`, `git reset --hard`, `terraform apply`, `docker system prune`.
- It reports accuracy or performance numbers with no script behind them.
