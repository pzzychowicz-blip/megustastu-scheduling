# Firebase Realtime Database — Security Rules (source of truth)

`database.rules.json` is the **version-controlled source of truth** for this app's
RTDB Security Rules. Like MGT Bookings, the rules are applied **manually** through the
Firebase console (Realtime Database → Rules → paste → Publish) — there is no
`firebase.json` and no CLI in this repo. This file is the canonical copy to paste from
and to diff against.

Two projects, two publishes:

| | project | database |
|---|---|---|
| DEV | `megustastu-scheduling-dev` | `megustastu-scheduling-dev-default-rtdb.europe-west1` |
| PROD | `megustastu-scheduling` | `megustastu-scheduling-default-rtdb.europe-west1` |

---

## What the rules do (v16.0.0 — revision CAS on the two singletons)

`settings` and `shiftTemplate` are the only nodes this app writes as a **whole object**
(`saveSingleton` in `usePersistence.js`). Everything else — `employees`, `shifts`,
`requests`, `configRevisions` — is a keyed collection written one child at a time
(`set("shifts/{id}", record)`), so two writers touching different records write disjoint
paths and the database merges them. There is no whole-node race there for a rule to
protect, which is why those four paths carry nothing beyond the root `auth != null`.

The two singletons get the **revision compare-and-swap** proven in Bookings (v15.3.0
there, hardened v16.0.0): an integer sibling `<name>Rev`, written atomically with the
node in one root `update()`, and a rule pair rejecting any write whose rev is not exactly
`stored + 1`. A device holding a stale copy — sleep/wake, a zombie socket, an offline
queue flushing — sends a rev the server has already passed, and the whole atomic update
is rejected, node included. The SDK's rollback echo then restores that device's local
state, and `usePersistence` surfaces the refusal as a `<Notice>` banner.

Why a counter and not a timestamp: a stale device stamps its write with its **current**
wall clock, which is always newer than what it is about to overwrite. Greater-than is
last-writer-wins, not staleness protection. Only a counter the writer has actually seen
proves the write was based on the data it replaces.

### Not covered, deliberately

**Per-record CAS on the keyed collections.** Bookings guards `bookings/$bid` with an
`updatedAt` / `baseUpdatedAt` pair, but its records carry those fields and it needed the
v15.4.0–v15.7.0 resync-and-replay machinery before that rule was safe to publish. Shift
/ employee / request records here have no `updatedAt` at all, so publishing the
equivalent rule would reject **every** write this app makes. If per-record protection is
ever wanted, the field and the rejection-recovery path have to land in the app first —
app before rules, as always.

**Shape validation.** No `.validate` on record shape or on `$id` matching the child key.
The failure mode it would catch (a malformed record) has never occurred; the failure mode
it would cause (one unanticipated legitimate write rejected in PROD, on a Saturday) is
worse. The root `auth != null` is the security boundary; these rules are a concurrency
boundary.

---

## ⚠️ Deployment — app FIRST, rules SECOND (rolling-safe)

The order matters, but this is not a hard cutover:

1. **Merge + deploy the app.** New writes carry the rev bumps. The **current** rules
   accept them — an extra `settingsRev` integer is just another node to a rule that
   doesn't mention it. Nothing breaks while the app is out and the rules are not.
2. **Refresh every device.** Once the new rules are live, a pre-v16.0.0 tab's settings
   write has no rev bump and is rejected. That IS the protection working, but refreshing
   first avoids nuisance rejections.
3. **Publish to DEV** (console → Rules → paste `database.rules.json` → Publish). Verify
   on localhost: flip a Settings toggle and watch `settingsRev` count up from 1 in the
   Realtime Database tree; save the FoH/Kitchen template and watch `shiftTemplateRev` do
   the same. Then force a rejection — edit `settingsRev` down by hand in the console and
   flip a toggle; the toggle should revert and the red banner should read "Settings not
   saved — permission denied". Keep the prior rules text to revert to.
4. **Publish to PROD** at a quiet moment. Confirm one real settings save.

**First write after publishing:** neither PROD nor DEV has a `settingsRev` yet, so the
first write hits the rule's `data.exists() ? … : newData.val() === 1` branch and creates
it at 1. No seeding needed, no migration.

**Rollback:** paste `{ "rules": { ".read": "auth != null", ".write": "auth != null" } }`
and Publish. The app keeps writing the rev siblings, which the bare rule ignores. No data
or shape change is involved — the rev nodes are harmless extra integers.
