# BatCave + Refract combined preview (experimental)

This branch ports the Refract one-way watched-history prototype onto the current BatCave diagnostic branch without merging its hundreds of unrelated commits.

## Validation gate

- BatCave still fails the real-world Harbor test. See https://github.com/G1NYU/RE-Harbor/pull/1#issuecomment-6790043731.
- The BatCave diagnostic should disclose only cookie presence, UA match, redacted errors and HTTP status; no raw cookies or secrets.
- Refract's personal-key Bearer authentication has **not** been verified against the live API. Its one-way watched-history writes must remain opt-in; no automatic synchronization until a key is explicitly configured.
- The earlier user-disclosed Refract key must not be reused. Use a freshly rotated, limited-permission key only.
- Ordinary code pushes should not generate or release Windows installers. Building the combined MSI is a separate, deliberate action.
- Do not merge into production until all targeted checks pass, Refract API verification works, and a real BatCave comic chapter renders.
