# Synthetic data

All data here is fabricated for the prototype — no real members, vehicles, or providers.

| File | Purpose |
|------|---------|
| `policies.json` | Machine-readable index of the three roadside plans (limits, covered services, exclusions) + a pointer to the full policy document. |
| `policy-docs/*.md` | The full policy wording per plan, with numbered clauses (e.g. `§3.1`). The coverage check reads these so it can **cite the specific clause** behind every decision. |
| `customers.json` | Members keyed by member ID, each tied to a plan, vehicle, usage-so-far, and a home base (for trip-interruption distance). |
| `garages.json` | Service providers with geo coordinates, capabilities (tow / mobile-repair / winch / collision), hours, rating, and average dispatch time — used to pick the nearest suitable provider. |

## Plans at a glance

| Plan | Calls/yr | Tow limit | Lockout | Winch | Collision tow | Trip interruption |
|------|:--:|:--:|:--:|:--:|:--:|:--:|
| **Basic** (RA-BASIC-2026) | 2 | 15 mi | ✗ | ✗ | ✗ | ✗ |
| **Standard** (RA-STANDARD-2026) | 4 | 50 mi | ✓ | ✗ | ✓ | ✗ |
| **Premium** (RA-PREMIUM-2026) | 6 | 100 mi | ✓ | ✓ | ✓ | $150 |

## Demo scenarios these enable

- **Clean approval:** Maria (Premium) — collision, not driveable → collision recovery covered (§3.7), flatbed tow within 100 mi.
- **Coverage gap → human judgment:** Aisha (Basic) — collision damage → towing of a collision-damaged vehicle is **excluded** (§5.3); supervisor decides how to handle.
- **Limit edge case:** James (Standard) — has used 3 of 4 calls; a long tow may exceed the 50-mi limit or $100 cap, surfacing partial coverage for human review.
