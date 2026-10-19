---
trigger: glob
globs: "apps/ai/**, apps/api/src/modules/ai/**, data/synthetic/**"
description: "Boundaries and safety rules for every AI feature: intake assistant, embeddings, evaluation data."
---

# AI rules (full detail: @docs/SPEC.md sections 6, 8, 9, 12)

1. **AI suggests, never decides.** No AI output may set priority, routing, merge, closure or any status. Those stay deterministic and auditable.
2. **Always optional.** Every user flow must work with `LLM_PROVIDER=disabled` and with `apps/ai` stopped. Add a test that proves it.
3. **Provider adapter.** Call the LLM only through the adapter. No provider SDK calls elsewhere. The key comes from `GEMINI_API_KEY` in the environment.
4. **Timeouts and fallback.** LLM 4 s, embeddings 2 s (SPEC values). On timeout, error or low confidence: drop the suggestion and show the manual form. Simple circuit breaker for the embeddings service.
5. **Redact before sending.** Phones, emails and exact addresses are removed from any text leaving the system. Test with fixtures.
6. **Untrusted input.** Citizen text is data, never instructions. Use a fixed system prompt, ask for JSON only, validate with zod against the tenant's category list, discard anything else.
7. **Log every call** to `ai_logs`: redacted input hash, provider, model, prompt version, latency, schema-valid, user corrections.
8. **Label AI output** in the UI as AI-suggested and make every field editable.
9. **Pin models** in the image at build time. Never download models at container start. Record model name and version on every stored vector.
10. **Evaluation is mandatory.** Metrics come from committed scripts on labelled data. Synthetic data is labelled synthetic. Never claim accuracy without a generated report. Verify Punjabi support empirically.
