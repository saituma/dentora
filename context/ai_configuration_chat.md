# AI Configuration Chat - Guided Extraction and Deployment Readiness

## Purpose
Define the guided AI conversation mode that completes and refines tenant configuration after structured onboarding.

## Scope
- Clarifies ambiguous onboarding inputs
- Captures missing policy, FAQ, and workflow details
- Normalizes responses into structured schema fields
- Enforces validation and completeness before deployment

## Configuration Chat Mode

### Mode Characteristics
- Deterministic, schema-driven dialogue
- Question sequencing based on missing or low-confidence fields
- Real-time extraction with validation feedback
- Human-readable summaries plus machine-validated outputs

### Explicit Non-Goals
- No unbounded free-form knowledge storage
- No runtime call handling in this mode

## System Prompt (Configuration Mode Baseline)
Use the following baseline instruction in configuration mode.

> You are the Configuration AI for a dental clinic receptionist system.  
> Your job is to collect complete, structured, and unambiguous clinic configuration data.  
> Ask focused questions one at a time when required fields are missing or unclear.  
> Convert user responses into schema-compliant values.  
> Always validate booking, escalation, policy, and tone settings for safety and consistency.  
> If information is ambiguous, ask a clarifying question instead of guessing.  
> Mark each field status as complete, needs_clarification, or blocked.  
> When all required fields pass validation, output a deployment readiness summary and trigger the deployment handoff.

## Extraction Goals

| Goal | Description | Output Type |
| --- | --- | --- |
| Fill required fields | Ensure all mandatory schema fields are populated | Structured objects |
| Resolve ambiguity | Clarify contradictory or vague responses | Field-level flags |
| Enforce policy correctness | Validate rules against safety constraints | Validation report |
| Improve runtime quality | Capture FAQ variants and tone preferences | Normalized records |
| Produce deployable artifact | Generate versioned configuration package | Config snapshot |

## Structured Schema Targets

### High-Level Schema Map
- `clinic_profile`
- `services`
- `booking_rules`
- `policies`
- `tone_profile`
- `faq_library`
- `integrations`

### Field Status Model

| Status | Meaning | Action |
| --- | --- | --- |
| complete | Value validated and accepted | No further action |
| needs_clarification | Present but ambiguous/inconsistent | Ask targeted follow-up |
| blocked | Missing dependency or conflicting rule | Prevent deployment |

## Questioning Strategy

### Priority Order
1. Safety-critical policy fields
2. Booking rule fields required for transactional correctness
3. Escalation and human handoff fields
4. Service definitions and constraints
5. Tone and FAQ refinements

### Prompting Style Rules
- Ask one high-impact question at a time.
- Provide constrained options when possible.
- Confirm interpreted values before finalizing.
- Avoid speculative assumptions.

### Example Clarification Patterns
- "When a caller asks for same-day emergency care and no slot is open, should AI escalate immediately or offer callback priority?"
- "For cancellations within 24 hours, should AI process directly or transfer to staff?"

## Validation Logic

### Validation Layers
- Schema validation: types, enums, range checks
- Cross-field validation: policy and booking coherence
- Operational validation: integration prerequisites for enabled features
- Safety validation: escalation rules for sensitive intents

### Blocking Validation Examples
- Booking enabled but no scheduling source configured
- Emergency intent present without escalation route
- Tone requires phrase list that conflicts with prohibited phrases
- Service is bookable but missing duration and eligibility constraints

### Warning-Level Validation Examples
- FAQ coverage for insurance questions is low
- Callback SLA exceeds recommended threshold
- Overly restrictive booking windows reduce conversion potential

## Completion Criteria
Configuration chat is complete only when:
- All mandatory fields are `complete`
- No `blocked` validation issues remain
- Safety-critical policies pass validation
- Deployment preflight checks pass

## Deployment Trigger

### Trigger Conditions
- Tenant config completeness score >= threshold (for example 95%+)
- Zero blocking validation errors
- Required integrations are verified or approved fallback mode is set
- Optional human approval step completed (if tenant policy requires)

### Trigger Outputs
- Published `config_version`
- Change log of values finalized in chat
- Runtime context package for call execution engine
- Rollback reference to prior active version

## Audit and Traceability
- Persist every chat turn with timestamp and actor metadata.
- Store extracted field diffs per turn.
- Attach validation outcomes and rationale to final config version.
- Maintain full lineage from onboarding input -> chat clarification -> deployed value.

## Error and Recovery Handling

### Common Failure Cases
- Contradictory admin responses
- Integration check failures during preflight
- Incomplete responses for required safety fields

### Recovery Strategy
- Suspend publish and generate remediation checklist.
- Resume from unresolved field queue.
- Allow admin override for non-critical warnings with justification.

## Runtime Handoff Contract
After completion, configuration chat must generate:
- Immutable config snapshot ID
- Tenant ID and active version pointer
- Runtime-ready normalized objects for each configuration domain
- Validation checksum and deployment timestamp

## Operational Metrics
- Time-to-config-completion
- Average clarification turns per tenant
- Blocked validation frequency by category
- Post-deployment rollback rate
- Configuration quality score vs runtime performance outcomes
