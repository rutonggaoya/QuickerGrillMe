# Global Feature Flag Platform

## 1. Goals, scope, and non-goals

### Goals

- Evaluate flags inside application processes without a network hop on the request path.
- Keep evaluation available during control-plane, relay, or regional network failures.
- Propagate normal changes globally within a bounded, observable interval and provide a faster path for emergency flags.
- Produce identical results across supported SDK languages for the same configuration and context.
- Limit targeting-data and telemetry exposure while retaining enough evidence to operate safe rollouts.
- Make every production change auditable, reversible, and attributable to an owner.

### Initial service objectives

| Objective | Initial target |
| --- | --- |
| Evaluation latency | p99 below 1 ms after SDK initialization |
| Evaluation availability | 99.999% while a valid local snapshot exists |
| Normal propagation | p99 below 30 seconds across healthy regions |
| Emergency propagation | p99 below 5 seconds across healthy regions |
| Control-plane write availability | 99.9% monthly |
| Maximum stale operation | 24 hours before SDKs fall back to application defaults |

These values are launch defaults, not questionnaire decisions. Load tests, regional propagation tests, and failure game days must validate them before general availability.

### Scope

The first platform release includes flag authoring, typed targeting rules, percentage rollout, immutable version history, local SDK evaluation, regional distribution, progressive delivery safeguards, audit logs, lifecycle enforcement, and operational telemetry.

### Non-goals

- Statistical experiment analysis. The platform provides stable assignments and an integration contract to a separate experimentation system.
- Central storage of raw user or tenant profiles.
- Per-evaluation remote API calls.
- Arbitrary executable rule code.
- A multi-writer global control plane in the first release.

## 2. Architecture

```text
Operators
   |
   v
Global API / Authoring UI
   |
   v
Home-region write service ---> Immutable audit and version store
   |                                      |
   | signed, versioned snapshot           |
   v                                      |
Regional snapshot store <-----------------+
   |
   +--> Regional notification relays
   |          |
   |          v
   +------> Application SDKs
                |
                +--> Atomic local snapshot
                +--> In-process rule evaluator
                +--> Sampled aggregate telemetry
```

### Control plane

One home region is the ordered write authority. A warm standby can be promoted through a controlled failover that fences the old writer before issuing new versions. This is intentionally simpler than global multi-writer consensus because writes are low volume and do not participate in application evaluation.

Each accepted change creates:

1. an immutable change record containing actor, approval, reason, and previous version;
2. a monotonically increasing project version;
3. a canonical rule intermediate representation;
4. a signed, content-addressed snapshot;
5. a publication record tracking regional convergence.

The authoring API uses optimistic concurrency. A write names the base project version and fails with a conflict if another publication has advanced it.

### Regional distribution

The control plane replicates immutable snapshots to each regional store. Regional relays stream version notifications, not full mutable state. On notification, SDKs fetch the referenced snapshot from the regional store.

SDKs also poll every 60 seconds with jitter. Polling is the recovery path when a stream is disconnected, a notification is lost, or a relay is unavailable. Reconnects use exponential backoff capped at 30 seconds and include the last activated version so the relay can send only the newest reference.

### SDK data plane

SDKs evaluate flags in process from one immutable snapshot. Activating a snapshot is an atomic pointer swap; concurrent requests see either the previous complete snapshot or the new complete snapshot.

Before activation, an SDK verifies:

- the control-plane signature against a pinned, rotatable trust set;
- the project identity and environment;
- the monotonic version, unless the snapshot contains an explicit signed rollback authorization;
- snapshot and rule-IR schema compatibility;
- references, defaults, and rule semantics.

Failed validation leaves the last valid snapshot active and emits an operational alert. SDK initialization loads the last verified snapshot from local encrypted storage when available, then refreshes asynchronously.

## 3. Rule and evaluation contract

Rules compile to a versioned, language-neutral intermediate representation. Each SDK implements the same evaluator contract and must pass shared conformance vectors before release.

Evaluation order is deterministic:

1. confirm project, environment, and flag existence;
2. validate the typed context required by the flag;
3. evaluate explicit prerequisites;
4. evaluate ordered targeting rules;
5. compute percentage allocation using a specified hash algorithm, salt, and stable subject key;
6. return the matched variant or the flag's configured default.

Unknown attributes do not coerce across types. Invalid context skips the affected rule and emits a sampled diagnostic; it never changes another rule's ordering. Cyclic flag prerequisites are rejected at publication.

SDK compatibility follows an `N` and `N-1` rule-IR policy. The control plane may publish only features supported by the minimum SDK version configured for that environment. Unsupported snapshots are rejected rather than partially interpreted.

## 4. Targeting and privacy boundary

Applications provide a typed local evaluation context containing only attributes approved for that project. Raw context remains inside the process and is not uploaded with operational telemetry.

Percentage rollout uses a stable project-scoped hash of an application-provided subject key. The platform does not need the raw identifier. If cohort membership must be distributed, it uses opaque, project-scoped cohort IDs rather than copied profile attributes.

The default telemetry path reports sampled aggregates keyed by project, environment, flag, version, variant, SDK language, SDK version, and region. It excludes raw subject IDs, free-form context, and rule input values. High-cardinality debugging requires an explicit time-bounded diagnostic mode and privacy approval.

## 5. Consistency and failure behavior

### Normal changes

Normal publication is bounded eventual consistency. The API acknowledges once the version is durable in the home region and publication has begun. The UI shows convergence by region and does not claim global completion until every required region reports the version available.

### Emergency flags

Flags marked `emergency` use the same signed snapshot format but receive priority replication, dedicated relay capacity, and stricter convergence alarms. They may bypass scheduled change windows, but still require authorization, an audit reason, and a second approver unless the incident role explicitly grants break-glass access.

The platform does not promise simultaneous global activation. Operators receive the observed regional version distribution and must design emergency actions to tolerate a short mixed-version interval.

### Data-plane degradation

| Condition | Behavior |
| --- | --- |
| Stream unavailable | Poll regional snapshot store with jitter |
| Regional store unavailable | Keep the last verified snapshot |
| Snapshot invalid | Reject it, retain the previous snapshot, alert |
| Snapshot age exceeds warning threshold of 15 minutes | Emit stale-configuration warning |
| Snapshot age reaches 24 hours | Use application-compiled defaults and emit a critical health signal |
| No cached snapshot at startup | Use application defaults until a valid snapshot arrives |

Applications must define a typed default for every flag. The SDK never invents a value and never blocks a request while waiting for the control plane.

## 6. Release safety

Production and emergency-class changes require:

- a second-person approval;
- a reason and linked change or incident;
- progressive rollout stages;
- linked guardrail metrics;
- an automatic rollback policy.

The default progressive sequence is internal, 1%, 5%, 25%, 50%, and 100%, with a configurable observation period between stages. Services can remove stages only through an environment policy, not per-change convenience.

Automatic rollback creates a new signed monotonic version that restores the prior configuration. It never asks SDKs to accept an unsigned lower version. Rollback triggers when an approved guardrail breaches its threshold for the configured evaluation window; missing or delayed telemetry pauses progression rather than declaring success.

## 7. Recovery and disaster readiness

Every published snapshot and audit record is immutable. Restoring a prior configuration produces a new version with an explicit reference to the restored version.

Home-region failover requires:

1. confirming the old writer is fenced;
2. verifying replicated audit and version state;
3. promoting the standby version authority;
4. publishing a no-op signed version to prove the new path;
5. reopening operator writes.

Regional relays and snapshot stores can be rebuilt from immutable history. SDKs remain on their last verified snapshots during reconstruction.

A quarterly game day must cover a bad global rule, home-region loss, regional relay loss, signing-key rotation, and rollback while the primary region is unavailable.

## 8. Operations and observability

The platform exposes:

- publication latency and convergence by version and region;
- connected SDK versions and snapshot age distributions;
- snapshot fetch, signature, schema, and activation failures;
- evaluation counts and variants as sampled aggregates;
- rollout stage, guardrail state, pause, and rollback events;
- stale flag inventory, owner, expiry, and last evaluation time.

Alerts focus on user-visible risk: propagation SLO breaches, a growing stale-SDK population, signature failures, incompatible SDKs, writer fencing failures, and rollback failure.

Every temporary flag requires an owner and expiry. Owners receive reminders 14 and 3 days before expiry. Expired flags stop accepting rollout expansion and escalate to the owning team's manager or service owner. Long-lived operational flags use a distinct type with an annual review instead of bypassing lifecycle metadata.

## 9. Rollout plan

1. Implement the rule IR, reference evaluator, and cross-language conformance suite.
2. Launch the single-region control plane and one SDK against non-production environments.
3. Add signed snapshots, immutable history, and local cached startup.
4. Deploy regional stores and polling distribution; measure propagation tails.
5. Add regional streams and verify polling recovery under relay failure.
6. Onboard two services in shadow mode and compare platform results with existing flag logic.
7. Enable progressive production rollout with manual rollback.
8. Enable metric-triggered rollback after guardrail quality is demonstrated.
9. Complete multi-region and signing-key game days before general availability.

## 10. Validation strategy

- Golden conformance vectors run against every SDK and rule-IR version.
- Property tests verify deterministic percentage allocation and monotonic rollout behavior.
- Load tests cover evaluation latency, SDK startup, relay fan-out, snapshot fetch, and telemetry volume.
- Fault injection covers delayed replication, duplicate and reordered notifications, corrupt snapshots, expired keys, and partial regional failure.
- Privacy tests verify that raw targeting context and subject identifiers never enter default telemetry.
- End-to-end tests publish, progressively roll out, pause, roll back, fail over the writer, and reconstruct a regional store.

## 11. Decision summary

| Decision | Selected direction | Material consequence |
| --- | --- | --- |
| Availability | Serve the last verified snapshot | Application requests remain independent of control-plane health |
| Evaluation | In-process SDK | Lowest latency, but requires strict cross-language conformance |
| Consistency | Tiered | Normal changes are bounded eventual; emergency flags receive a prioritized path |
| Distribution | Regional stream plus polling | Fast propagation with a simple recovery mechanism |
| Writes | Single home-region writer | Ordered audit history and simpler conflict handling |
| Targeting | Typed local context | Raw user and tenant attributes stay inside applications |
| Integrity | Signature, monotonic version, semantic validation | Invalid global configuration cannot partially activate |
| Safety | Progressive rollout, approval, automatic rollback | High-impact changes reduce blast radius and have an automated escape path |
| Telemetry | Sampled aggregates | Operational insight without default per-user event collection |
| Recovery | Immutable history and signed rollback | Rollback remains auditable and compatible with monotonic versions |
| Experimentation | Separate integration | Statistical correctness and data processing stay outside the delivery core |

## 12. Defaults and assumptions

- The launch deployment uses three regions with one home writer and one promotion candidate.
- Normal and emergency propagation targets are 30 seconds and 5 seconds at p99.
- SDKs poll every 60 seconds with jitter even when streaming is healthy.
- SDKs warn after 15 minutes of snapshot staleness and use application defaults after 24 hours.
- Every flag has an application-owned typed default.
- Production changes require approval and progressive rollout.
- Raw targeting context is never part of default platform telemetry.

## 13. Deferred validation items

No questionnaire decision was deferred. The following implementation defaults still require evidence:

| Item | Temporary default | Confidence | Validation trigger |
| --- | --- | --- | --- |
| Propagation SLO | 30 seconds normal, 5 seconds emergency | Medium | Three-region load and failure testing |
| Maximum stale interval | 24 hours | Medium | Review with incident response and regulated workload owners |
| Automatic rollback readiness | Enabled only for approved guardrails | Medium | Two services demonstrate low-noise metrics in production |
| Rule-IR compatibility window | Current and previous version | Medium | First three SDKs complete conformance and upgrade testing |

## Appendix A. Default ledger

| Default | Rationale |
| --- | --- |
| In-process evaluation | Removes network latency and availability coupling |
| Last verified snapshot on failure | Preserves request-path availability |
| Atomic snapshot activation | Prevents mixed configuration within one process |
| Single ordered writer | Simplifies versioning, audit, and failover |
| Regional notifications plus polling | Combines fast updates with robust recovery |
| Signed snapshots | Verifies provenance beyond transport security |
| Explicit signed rollback as a new version | Preserves monotonic safety and auditability |
| Typed local context | Limits privacy exposure and central dependencies |
| Sampled aggregate telemetry | Controls privacy, cardinality, and cost |
| Required owner and expiry | Prevents indefinite flag accumulation |
| Separate experimentation system | Keeps statistical analysis outside the delivery boundary |
