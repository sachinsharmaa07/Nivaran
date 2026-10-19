# PROMPTS: what to paste, in order

State lives in files (`PROGRESS.md`, `AGENTS.md`, `docs/`), not in chat memory. So: **one conversation per step**, short prompts, and the agent re-reads the files each time.

## 1. Do and don't

**Do**

- Run one phase at a time, in order. Finish and tag before starting the next.
- Open a **new conversation** for each step (audit, plan, implement, review, close).
- Approve the plan explicitly in writing before implementation.
- Look at the real result yourself: run the app, click the flow, read `git diff --stat`.
- Use a **different model family for review** than for implementation.
- Commit and tag only after review passes (you run the git commands).
- Keep a phone and a second browser profile for testing flows.

**Don't**

- Don't paste long prompts or the whole spec into chat. The files are the spec.
- Don't ask for "build the whole app" or several phases at once.
- Don't let it run `terraform apply`, `git push`, `git reset --hard`, `docker system prune`.
- Don't paste API keys or passwords into chat. Put them in `.env`.
- Don't accept "should work". Ask for the command output.
- Don't let it install anything not on the phase's Dependencies line: no scaffolders (`create-vite`), no `npx` or `pnpm dlx`, no global or host installs, no Antigravity plugins, MCP servers or marketplace skills.
- Don't approve a plan whose dependency table lists a package you cannot explain in one sentence, or one that a built-in could replace.
- Don't change the model in the middle of a step.
- Don't edit `.agents/`, `AGENTS.md` or the specs casually. Change them deliberately, then commit the change by itself.

## 2. Which model to select

Open the model dropdown under the prompt box. The list and your plan's limits change, so pick from what you see. In October 2026 the docs list Gemini 3.x Flash models, Gemini 3.1 Pro, and Claude Sonnet and Opus 5.5 (thinking) (some only on paid non-trial Google AI plans), with older Claude 4.6 and GPT-OSS-120b scheduled for removal on 2 November 2026. Check `/usage` for your quota.

| Step                            | Pick                                                                              | Why                                                          |
| ------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `/phase-plan`                   | Strongest reasoning model your plan allows (Opus 5.5 thinking, or Gemini 3.1 Pro) | Planning mistakes are the most expensive                     |
| `/phase-implement`              | Sonnet 5.5 thinking or Gemini 3.1 Pro                                             | Strong at multi-file work and follows rules well             |
| `/phase-review`                 | **The other family** than the one that implemented                                | Independent errors get caught                                |
| `/phase-audit`, `/phase-close`  | Any Flash model or the same as plan                                               | Mostly reading and bookkeeping                               |
| Tiny edits (copy, rename, docs) | Flash                                                                             | Fast and cheap. Never use it for auth, tenancy, SQL or infra |

I cannot rank these models on your tasks. Treat this as a starting point and note in `PROGRESS.md` which pairing worked.

## 3. Before the first prompt (once)

Finish `docs/HUMAN-CHECKLIST.md` sections A to C. Open the repo folder in Antigravity, open Customizations, and confirm Rules show `AGENTS.md` plus five rules under `.agents/rules`, and Skills show six `phase-*` entries.

## 4. Step 0: verify the agent loaded your rules

New conversation, any Flash model:

```
Do not edit anything. Tell me: (1) which rules and skills you loaded, (2) which files you must read at the start of every task, (3) the list of phases and which one is current, (4) five things you must never do without my approval. Then stop.
```

Pass condition: it names AGENTS.md, the five rule files, the six `/phase-*` skills, PROGRESS.md, SPEC, PHASES, and mentions no commits or pushes, no secrets in chat, no `terraform apply`, no installs outside the phase's Dependencies line, one phase at a time. If not, fix the setup before continuing.

## 5. Step 0b: sanity-check the decisions

```
Read docs/SPEC.md and PROGRESS.md decisions D-001 to D-008. List anything ambiguous, risky or contradictory. Do not edit anything.
```

Answer its questions in chat. If a decision changes, **you** edit the file and commit it.

## 6. The loop for every phase

Replace P0 with the current phase. New conversation for each line.

| #   | Paste                                                                        | Model        | Then you                                                                                                  |
| --- | ---------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| 1   | `/phase-audit`                                                               | Flash        | Read it. Fix any surprise before planning                                                                 |
| 2   | `/phase-plan P0` (plus the extra line from section 7)                        | Strongest    | Read the plan. Check the change budget. Reply `Plan approved as written.` or `Approved with changes: ...` |
| 3   | `/phase-implement P0`                                                        | Implementer  | Wait. Approve terminal commands one by one. Answer blockers                                               |
| 4   | You verify (section 8)                                                       |              | Run it yourself                                                                                           |
| 5   | `/phase-review P0`                                                           | Other family | Choose which findings to fix: `Fix F1 and F3 only.`                                                       |
| 6   | `/phase-implement P0` with `Apply only the approved review fixes F1 and F3.` | Implementer  | Repeat 4 to 5 until clean                                                                                 |
| 7   | `/phase-close P0`                                                            | Flash        | Run the git commands it prints                                                                            |

If a skill does not appear as a slash command, paste: `Follow .agents/skills/phase-plan/SKILL.md exactly for phase P0.` (same pattern for the others).

## 7. Extra line to add to `/phase-plan` per phase

Paste the extra text on the same message after the command.

| Phase | Extra line                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0    | `Propose exact pinned versions after checking current stable releases. Install nothing except the P0 Dependencies line. Write the minimal files by hand, no scaffolders. Show the final tree.` |
| P1    | `State the exact RLS policy shape, the role setup, how the tenant-attack suite discovers routes, and how platform_admin is prevented from reading issue data.`                                 |
| P2    | `List every component with its states, propose the gallery route layout, and include the DESIGN section 12 gate in the plan.`                                                                  |
| P3    | `Propose exact table columns and constraints, and the GeoJSON validation rules.`                                                                                                               |
| P4    | `Explain how GPS works on a phone during local testing (browsers require HTTPS for geolocation) and propose the simplest local HTTPS approach. Propose the image pipeline step by step.`       |
| P5    | `Show worked priority examples with numbers, the synthetic dataset design, and the evaluation protocol before any code.`                                                                       |
| P6    | `Provide the full transition table and how the accelerated-clock harness fakes time without changing production code paths.`                                                                   |
| P7    | `Define each public metric precisely and how the independent recomputation test works.`                                                                                                        |
| P8    | `State the offline sync design, the iOS and background-sync limits, and the translation review process.`                                                                                       |
| P9    | `Show the exact prompts, JSON schema, redaction rules and evaluation set design before any code.`                                                                                              |
| P10   | `List every drill with expected and measured behaviour columns, and the thresholds for k6.`                                                                                                    |
| P11   | `Show how the Helm values map to the Compose resource limits.`                                                                                                                                 |
| P12   | `Produce Terraform code and plan output only. List every billable resource with current pricing sources and the teardown order.`                                                               |

## 8. What you check yourself before review

1. `make reset && make up`: all services healthy.
2. Open the app. Click the flow the phase added. Try wrong input on purpose (empty form, huge file, double-click submit, airplane mode).
3. `git diff --stat`: is the size reasonable? Any file you did not expect?
4. `git status`: any new root file or markdown file that is not in AGENTS.md section 4?
5. `PROGRESS.md`: are ticks backed by commands and results?
6. Dependencies: `git diff --stat -- '**/package.json' '**/requirements*.txt' pnpm-lock.yaml` shows only packages from the phase list, and `make deps-check` passes.
7. UI phases: look at the screenshots and run it on your phone.

## 9. Recovery prompts

Agent wandered off: new conversation, `/phase-recover`.

Context feels stale or it repeats itself: new conversation, `/phase-audit`, then continue from `PROGRESS.md` "Resume here".

Agent wants to add a dependency: `Is it on this phase's Dependencies line in docs/PHASES.md? If not, give two alternatives that are on it or built in, and stop.`

Quick dependency check any time: `List every direct dependency added in this phase from git diff, each with its ledger row and the file that imports it. Flag any without a row or an import. Do not edit anything.`

Agent says something works: `Show the exact command you ran and its output.`

Agent claims a metric: `Which committed script produced it, on which dataset and seed? If none, remove the claim.`
