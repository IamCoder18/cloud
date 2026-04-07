feat(gastown): add rig-level settings page and config resolution

## Summary

Adds a new rig-level settings page that allows users to override town-level configuration at the rig level. The UI includes sections for Models, Merge Strategy, Refinery, Custom Instructions, Git, and Convoys — each with an inherit/override toggle. Backend changes in `config.ts` implement the config resolution priority: rig override → town default → hardcoded defaults.

## Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test -- services/gastown` passes (merge-strategy tests)
- [ ] I manually tested the settings page UI and config resolution

