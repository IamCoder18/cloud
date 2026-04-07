/**
 * Town configuration management.
 */

import {
  TownConfigSchema,
  type TownConfig,
  type TownConfigUpdate,
  type MergeStrategy,
  type RigConfig,
} from '../../types';

const CONFIG_KEY = 'town:config';

const TOWN_LOG = '[Town.do]';

export async function getTownConfig(storage: DurableObjectStorage): Promise<TownConfig> {
  const raw = await storage.get<unknown>(CONFIG_KEY);
  if (!raw) return TownConfigSchema.parse({});
  return TownConfigSchema.parse(raw);
}

export async function updateTownConfig(
  storage: DurableObjectStorage,
  update: TownConfigUpdate
): Promise<TownConfig> {
  const current = await getTownConfig(storage);

  // env_vars: full replacement semantics. Masked values (exactly "****" followed
  // by up to 4 reveal chars) from the server's masking layer are preserved to
  // avoid overwriting secrets.
  const MASKED_RE = /^\*{4}.{0,4}$/;
  let resolvedEnvVars = current.env_vars;
  if (update.env_vars) {
    resolvedEnvVars = {};
    for (const [key, value] of Object.entries(update.env_vars)) {
      resolvedEnvVars[key] = MASKED_RE.test(value) ? (current.env_vars[key] ?? value) : value;
    }
  }

  // git_auth: preserve masked token values (starting with "****") to avoid
  // overwriting real secrets when the UI round-trips masked config.
  let resolvedGitAuth = current.git_auth;
  if (update.git_auth) {
    resolvedGitAuth = { ...current.git_auth };
    for (const key of ['github_token', 'gitlab_token', 'gitlab_instance_url'] as const) {
      const incoming = update.git_auth[key];
      if (incoming === undefined) continue;
      resolvedGitAuth[key] = MASKED_RE.test(incoming)
        ? (current.git_auth[key] ?? incoming)
        : incoming;
    }
    // platform_integration_id is not masked — always take the update value
    if (update.git_auth.platform_integration_id !== undefined) {
      resolvedGitAuth.platform_integration_id = update.git_auth.platform_integration_id;
    }
  }

  // github_cli_pat: same mask-preservation as git_auth tokens
  const resolvedGithubCliPat =
    update.github_cli_pat !== undefined
      ? MASKED_RE.test(update.github_cli_pat)
        ? current.github_cli_pat
        : update.github_cli_pat
      : current.github_cli_pat;

  // Normalize empty-string model fields to undefined so resolveModel()'s
  // nullish-coalescing fallback works correctly when the user clears them.
  const resolvedDefaultModel =
    update.default_model !== undefined ? update.default_model || undefined : current.default_model;

  const merged: TownConfig = {
    ...current,
    ...update,
    env_vars: resolvedEnvVars,
    git_auth: resolvedGitAuth,
    github_cli_pat: resolvedGithubCliPat,
    default_model: resolvedDefaultModel,
    refinery:
      update.refinery !== undefined
        ? {
            gates: update.refinery.gates ?? current.refinery?.gates ?? [],
            auto_merge: update.refinery.auto_merge ?? current.refinery?.auto_merge ?? true,
            require_clean_merge:
              update.refinery.require_clean_merge ?? current.refinery?.require_clean_merge ?? true,
            code_review: update.refinery.code_review ?? current.refinery?.code_review ?? true,
            review_mode: update.refinery.review_mode ?? current.refinery?.review_mode ?? 'rework',
            auto_resolve_pr_feedback:
              update.refinery.auto_resolve_pr_feedback ??
              current.refinery?.auto_resolve_pr_feedback ??
              false,
            auto_merge_delay_minutes:
              update.refinery.auto_merge_delay_minutes !== undefined
                ? update.refinery.auto_merge_delay_minutes
                : (current.refinery?.auto_merge_delay_minutes ?? null),
          }
        : current.refinery,
    container:
      update.container !== undefined
        ? {
            sleep_after_minutes:
              update.container.sleep_after_minutes ?? current.container?.sleep_after_minutes,
          }
        : current.container,
    custom_instructions:
      update.custom_instructions !== undefined
        ? {
            polecat:
              'polecat' in update.custom_instructions
                ? update.custom_instructions.polecat
                : current.custom_instructions?.polecat,
            refinery:
              'refinery' in update.custom_instructions
                ? update.custom_instructions.refinery
                : current.custom_instructions?.refinery,
            mayor:
              'mayor' in update.custom_instructions
                ? update.custom_instructions.mayor
                : current.custom_instructions?.mayor,
          }
        : current.custom_instructions,
  };

  const validated = TownConfigSchema.parse(merged);
  await storage.put(CONFIG_KEY, validated);
  console.log(
    `${TOWN_LOG} updateTownConfig: saved config with ${Object.keys(validated.env_vars).length} env vars`
  );
  return validated;
}

/**
 * Resolve the primary model from config.
 * Priority: rig override → role-specific → town default → hardcoded default.
 */
export function resolveModel(
  townConfig: TownConfig,
  rigConfig: RigConfig | undefined,
  role: string
): string {
  const rigRoleModels: Record<string, string | undefined> | undefined = rigConfig?.role_models;
  const townRoleModels: Record<string, string | undefined> | undefined = townConfig.role_models;
  const roleModel = rigRoleModels?.[role] ?? townRoleModels?.[role];
  const defaultModel = rigConfig?.default_model ?? townConfig.default_model;
  return roleModel ?? defaultModel ?? 'anthropic/claude-sonnet-4.6';
}

/**
 * Resolve the small (lightweight) model from config.
 * Priority: rig override → town default → hardcoded default.
 * Used for title generation, explore subagent, etc.
 */
export function resolveSmallModel(townConfig: TownConfig, rigConfig: RigConfig | undefined): string {
  return rigConfig?.small_model ?? townConfig.small_model ?? 'anthropic/claude-haiku-4.5';
}

/**
 * Resolve the effective merge strategy for a rig.
 * Priority: rig-level override → town-level default → 'direct'.
 */
export function resolveMergeStrategy(
  townConfig: TownConfig,
  rigConfig: RigConfig | undefined
): MergeStrategy {
  return rigConfig?.merge_strategy ?? townConfig.merge_strategy ?? 'direct';
}

/**
 * Resolve the effective refinery config for a rig.
 * Priority: rig-level override → town-level default → hardcoded defaults.
 */
export function resolveRefineryConfig(
  townConfig: TownConfig,
  rigConfig: RigConfig | undefined
): {
  gates: string[];
  auto_merge: boolean;
  require_clean_merge: boolean;
  code_review: boolean;
  auto_resolve_pr_feedback: boolean;
  auto_merge_delay_minutes: number | null;
} {
  const townRefinery = townConfig.refinery;
  const rigRefinery = rigConfig?.refinery;
  return {
    gates: rigRefinery?.gates ?? townRefinery?.gates ?? [],
    auto_merge: rigRefinery?.auto_merge ?? townRefinery?.auto_merge ?? true,
    require_clean_merge: rigRefinery?.require_clean_merge ?? townRefinery?.require_clean_merge ?? true,
    code_review: rigRefinery?.code_review ?? townRefinery?.code_review ?? true,
    auto_resolve_pr_feedback:
      rigRefinery?.auto_resolve_pr_feedback ?? townRefinery?.auto_resolve_pr_feedback ?? false,
    auto_merge_delay_minutes:
      rigRefinery?.auto_merge_delay_minutes !== undefined
        ? rigRefinery.auto_merge_delay_minutes
        : (townRefinery?.auto_merge_delay_minutes ?? null),
  };
}

/**
 * Build the ContainerConfig payload for X-Town-Config header.
 * Sent with every fetch() to the container.
 */
export async function buildContainerConfig(
  storage: DurableObjectStorage,
  env: Env
): Promise<Record<string, unknown>> {
  const config = await getTownConfig(storage);
  return {
    env_vars: config.env_vars,
    default_model: resolveModel(config, undefined, ''),
    small_model: resolveSmallModel(config, undefined),
    git_auth: config.git_auth,
    kilocode_token: config.kilocode_token,
    github_cli_pat: config.github_cli_pat,
    git_author_name: config.git_author_name,
    git_author_email: config.git_author_email,
    disable_ai_coauthor: config.disable_ai_coauthor,
    kilo_api_url: env.KILO_API_URL ?? '',
    gastown_api_url: env.GASTOWN_API_URL ?? '',
    organization_id: config.organization_id,
  };
}

/**
 * Build the ContainerConfig payload with rig-level overrides applied.
 * Used when dispatching agents to a specific rig.
 */
export async function buildContainerConfigForRig(
  storage: DurableObjectStorage,
  env: Env,
  rigConfig: RigConfig
): Promise<Record<string, unknown>> {
  const townConfig = await getTownConfig(storage);
  return {
    env_vars: townConfig.env_vars,
    default_model: resolveModel(townConfig, rigConfig, ''),
    small_model: resolveSmallModel(townConfig, rigConfig),
    git_auth: townConfig.git_auth,
    kilocode_token: townConfig.kilocode_token,
    github_cli_pat: townConfig.github_cli_pat,
    git_author_name: townConfig.git_author_name,
    git_author_email: townConfig.git_author_email,
    disable_ai_coauthor: townConfig.disable_ai_coauthor,
    custom_instructions: rigConfig.custom_instructions,
    git_push_flags: rigConfig.git_push_flags,
    kilo_api_url: env.KILO_API_URL ?? '',
    gastown_api_url: env.GASTOWN_API_URL ?? '',
    organization_id: townConfig.organization_id,
  };
}
