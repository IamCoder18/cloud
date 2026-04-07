'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGastownTRPC } from '@/lib/gastown/trpc';
import { Button } from '@/components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useModelSelectorList } from '@/app/api/openrouter/hooks';
import { ModelCombobox } from '@/components/shared/ModelCombobox';
import {
  Save,
  Settings,
  GitBranch,
  GitPullRequest,
  Bot,
  Shield,
  Variable,
  Layers,
  X,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { motion } from 'motion/react';
import Link from 'next/link';

type Props = { townId: string; rigId: string };

const SECTIONS = [
  { id: 'models', label: 'Models', icon: Bot },
  { id: 'merge-strategy', label: 'Merge Strategy', icon: GitPullRequest },
  { id: 'refinery', label: 'Refinery', icon: Shield },
  { id: 'custom-instructions', label: 'Custom Instructions', icon: Variable },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'convoys', label: 'Convoys', icon: Layers },
] as const;

function useScrollSpy(sectionIds: readonly string[]) {
  const [activeId, setActiveId] = useState<string>(sectionIds[0]);
  const suppressRef = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (suppressRef.current) return;
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-56px 0px -60% 0px', threshold: 0 }
    );
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sectionIds]);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    const header = document.getElementById('settings-sticky-header');
    if (!el) return;
    setActiveId(id);
    suppressRef.current = true;
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 24;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    setTimeout(() => {
      suppressRef.current = false;
    }, 1000);
  }

  return { activeId, scrollTo };
}

type InheritableField =
  | 'default_model'
  | 'small_model'
  | 'mayor_model'
  | 'refinery_model'
  | 'polecat_model'
  | 'merge_strategy'
  | 'auto_resolve_pr_feedback'
  | 'auto_merge_delay_minutes'
  | 'auto_merge'
  | 'require_clean_merge'
  | 'code_review'
  | 'custom_instructions'
  | 'git_push_flags'
  | 'default_branch'
  | 'max_polecats_per_rig'
  | 'staged_convoys_default'
  | 'default_convoy_merge_mode';

type RoleModelKey = 'mayor' | 'refinery' | 'polecat';

export function RigSettingsPageClient({ townId, rigId }: Props) {
  const trpc = useGastownTRPC();
  const queryClient = useQueryClient();
  const modelsQuery = useModelSelectorList(undefined);
  const models = useMemo(
    () => modelsQuery.data?.data?.map(m => ({ id: m.id, name: m.name })) ?? [],
    [modelsQuery.data]
  );

  const configQuery = useQuery(
    trpc.gastown.getRigConfig.queryOptions({ rigId, townId })
  );
  const rigQuery = useQuery(trpc.gastown.getRig.queryOptions({ rigId }));

  const updateMutation = useMutation(
    trpc.gastown.updateRigConfig.mutationOptions({
      onSuccess: () => {
        toast.success('Rig settings saved');
        void queryClient.invalidateQueries({
          queryKey: trpc.gastown.getRigConfig.queryKey({ rigId, townId }),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.gastown.getRig.queryKey({ rigId }),
        });
      },
      onError: err => toast.error(err.message),
    })
  );

  const [initialized, setInitialized] = useState(false);
  const [inherited, setInherited] = useState<Record<InheritableField, boolean>>({
    default_model: true,
    small_model: true,
    mayor_model: true,
    refinery_model: true,
    polecat_model: true,
    merge_strategy: true,
    auto_resolve_pr_feedback: true,
    auto_merge_delay_minutes: true,
    auto_merge: true,
    require_clean_merge: true,
    code_review: true,
    custom_instructions: true,
    git_push_flags: true,
    default_branch: true,
    max_polecats_per_rig: true,
    staged_convoys_default: true,
    default_convoy_merge_mode: true,
  });
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined);
  const [smallModel, setSmallModel] = useState<string | undefined>(undefined);
  const [roleModels, setRoleModels] = useState<Record<RoleModelKey, string | undefined>>({
    mayor: undefined,
    refinery: undefined,
    polecat: undefined,
  });
  const [mergeStrategy, setMergeStrategy] = useState<'direct' | 'pr'>('direct');
  const [codeReview, setCodeReview] = useState(true);
  const [autoResolvePrFeedback, setAutoResolvePrFeedback] = useState(false);
  const [autoMergeDelay, setAutoMergeDelay] = useState<string>('');
  const [autoMerge, setAutoMerge] = useState(true);
  const [requireCleanMerge, setRequireCleanMerge] = useState(true);
  const [customInstructions, setCustomInstructions] = useState('');
  const [gitPushFlags, setGitPushFlags] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [maxPolecats, setMaxPolecats] = useState(10);
  const [stagedConvoys, setStagedConvoys] = useState(false);
  const [convoyMergeMode, setConvoyMergeMode] = useState<'squash' | 'merge' | 'rebase'>('squash');

  const { activeId, scrollTo } = useScrollSpy(SECTIONS.map(s => s.id));

  function populateStateFromConfig() {
    const { rigConfig, townConfig } = configQuery.data!;
    const rigRig = rigQuery.data!;
    const cfg = rigConfig ?? {
      default_model: undefined,
      small_model: undefined,
      role_models: undefined,
      merge_strategy: undefined,
      refinery: undefined,
      custom_instructions: undefined,
      git_push_flags: undefined,
      default_branch: undefined,
      max_polecats_per_rig: undefined,
      staged_convoys_default: undefined,
      default_convoy_merge_mode: undefined,
    };

    setDefaultModel(cfg.default_model);
    setSmallModel(cfg.small_model);
    setRoleModels({
      mayor: cfg.role_models?.mayor,
      refinery: cfg.role_models?.refinery,
      polecat: cfg.role_models?.polecat,
    });
    setMergeStrategy(cfg.merge_strategy ?? townConfig.merge_strategy ?? 'direct');
    setCodeReview(cfg.refinery?.code_review ?? townConfig.refinery?.code_review ?? true);
    setAutoResolvePrFeedback(
      cfg.refinery?.auto_resolve_pr_feedback ??
        townConfig.refinery?.auto_resolve_pr_feedback ??
        false
    );
    setAutoMergeDelay(
      cfg.refinery?.auto_merge_delay_minutes != null
        ? String(cfg.refinery.auto_merge_delay_minutes)
        : townConfig.refinery?.auto_merge_delay_minutes != null
          ? String(townConfig.refinery.auto_merge_delay_minutes)
          : ''
    );
    setAutoMerge(cfg.refinery?.auto_merge ?? townConfig.refinery?.auto_merge ?? true);
    setRequireCleanMerge(
      cfg.refinery?.require_clean_merge ??
        townConfig.refinery?.require_clean_merge ??
        true
    );
    setCustomInstructions(cfg.custom_instructions ?? '');
    setGitPushFlags((cfg.git_push_flags ?? []).join(' '));
    setDefaultBranch(cfg.default_branch ?? rigRig?.default_branch ?? 'main');
    setMaxPolecats(cfg.max_polecats_per_rig ?? townConfig.max_polecats_per_rig ?? 10);
    setStagedConvoys(
      cfg.staged_convoys_default ?? townConfig.staged_convoys_default ?? false
    );
    setConvoyMergeMode(cfg.default_convoy_merge_mode ?? 'squash');

    setInherited({
      default_model: !cfg.default_model,
      small_model: !cfg.small_model,
      mayor_model: !cfg.role_models?.mayor,
      refinery_model: !cfg.role_models?.refinery,
      polecat_model: !cfg.role_models?.polecat,
      merge_strategy: !cfg.merge_strategy,
      auto_resolve_pr_feedback: cfg.refinery?.auto_resolve_pr_feedback == null,
      auto_merge_delay_minutes: cfg.refinery?.auto_merge_delay_minutes == null,
      auto_merge: cfg.refinery?.auto_merge == null,
      require_clean_merge: cfg.refinery?.require_clean_merge == null,
      code_review: cfg.refinery?.code_review == null,
      custom_instructions: !cfg.custom_instructions,
      git_push_flags: !cfg.git_push_flags?.length,
      default_branch: !cfg.default_branch,
      max_polecats_per_rig: !cfg.max_polecats_per_rig,
      staged_convoys_default: cfg.staged_convoys_default == null,
      default_convoy_merge_mode: !cfg.default_convoy_merge_mode,
    });
  }

  useEffect(() => {
    if (!initialized && configQuery.data && rigQuery.data) {
      populateStateFromConfig();
      setInitialized(true);
    }
  }, [initialized, configQuery.data, rigQuery.data]);

  function handleSave() {
    const config: {
      default_model?: string;
      small_model?: string;
      merge_strategy?: 'direct' | 'pr';
      role_models?: Record<string, string | undefined>;
      refinery?: Record<string, unknown>;
      custom_instructions?: string;
      git_push_flags?: string[];
      default_branch?: string;
      max_polecats_per_rig?: number;
      staged_convoys_default?: boolean;
      default_convoy_merge_mode?: 'squash' | 'merge' | 'rebase';
    } = {};

    if (!inherited.default_model) config.default_model = defaultModel;
    if (!inherited.small_model) config.small_model = smallModel;
    if (!inherited.merge_strategy) config.merge_strategy = mergeStrategy;

    const hasRoleOverride =
      !inherited.mayor_model || !inherited.refinery_model || !inherited.polecat_model;
    if (hasRoleOverride) {
      if (!inherited.mayor_model && !roleModels.mayor) {
        toast.error('Select a Mayor model or remove the override');
        return;
      }
      if (!inherited.refinery_model && !roleModels.refinery) {
        toast.error('Select a Refinery model or remove the override');
        return;
      }
      if (!inherited.polecat_model && !roleModels.polecat) {
        toast.error('Select a Polecat model or remove the override');
        return;
      }
      const roleModelsObj: Record<string, string | undefined> = {};
      if (!inherited.mayor_model) roleModelsObj.mayor = roleModels.mayor;
      if (!inherited.refinery_model) roleModelsObj.refinery = roleModels.refinery;
      if (!inherited.polecat_model) roleModelsObj.polecat = roleModels.polecat;
      config.role_models = roleModelsObj;
    }

    const hasRefineryOverride =
      !inherited.code_review ||
      !inherited.auto_resolve_pr_feedback ||
      !inherited.auto_merge_delay_minutes ||
      !inherited.auto_merge ||
      !inherited.require_clean_merge;
    if (hasRefineryOverride) {
      const refineryObj: Record<string, unknown> = {};
      if (!inherited.code_review) refineryObj.code_review = codeReview;
      if (!inherited.auto_resolve_pr_feedback)
        refineryObj.auto_resolve_pr_feedback = autoResolvePrFeedback;
      if (!inherited.auto_merge_delay_minutes) {
        const parsed = autoMergeDelay ? parseInt(autoMergeDelay, 10) : null;
        if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
          toast.error('Auto-merge delay must be a non-negative number');
          return;
        }
        refineryObj.auto_merge_delay_minutes = parsed;
      }
      if (!inherited.auto_merge) refineryObj.auto_merge = autoMerge;
      if (!inherited.require_clean_merge)
        refineryObj.require_clean_merge = requireCleanMerge;
      config.refinery = refineryObj;
    }

    if (!inherited.custom_instructions) config.custom_instructions = customInstructions;
    if (!inherited.git_push_flags)
      config.git_push_flags = gitPushFlags.split(/\s+/).filter(Boolean);
    if (!inherited.default_branch) config.default_branch = defaultBranch;
    if (!inherited.max_polecats_per_rig) config.max_polecats_per_rig = maxPolecats;
    if (!inherited.staged_convoys_default) config.staged_convoys_default = stagedConvoys;
    if (!inherited.default_convoy_merge_mode)
      config.default_convoy_merge_mode = convoyMergeMode;

    updateMutation.mutate({ rigId, townId, config });
  }

  function handleReset() {
    if (!configQuery.data || !rigQuery.data) return;
    populateStateFromConfig();
  }

  const townConfig = configQuery.data?.townConfig;
  const isLoading = configQuery.isLoading || rigQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex h-full flex-col p-6">
        <Skeleton className="mb-6 h-8 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="mb-4 h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        id="settings-sticky-header"
        className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[oklch(0.1_0_0)]/80 px-6 py-3 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <Link
            href={`/gastown/${townId}/rigs/${rigId}`}
            className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80"
          >
            <ArrowLeft className="size-4" />
            Back to rig
          </Link>
          <span className="text-white/20">/</span>
          <h1 className="text-sm font-semibold text-white/85">
            {rigQuery.data?.name ?? 'Rig'} Settings
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReset}
            className="text-white/50 hover:text-white/80"
          >
            <RotateCcw className="mr-1.5 size-3.5" />
            Reset to inherited
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="gap-1.5 bg-[color:oklch(95%_0.15_108_/_0.90)] text-black hover:bg-[color:oklch(95%_0.15_108_/_0.95)] disabled:opacity-50"
          >
            <Save className="size-3.5" />
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-8">
            {/* Models */}
            <SettingsSection
              id="models"
              icon={Bot}
              title="Models"
              description="Override the default and role-specific models for this rig."
            >
              <FieldGroup label="Default model">
                <InheritToggle
                  field="default_model"
                  inherited={inherited}
                  setInherited={setInherited}
                  townValue={townConfig?.default_model}
                />
                <ModelCombobox
                  value={defaultModel}
                  onValueChange={setDefaultModel}
                  models={models}
                  placeholder={inherited.default_model ? `Inherited: ${townConfig?.default_model ?? 'claude-sonnet-4.6'}` : 'Select a model...'}
                  disabled={inherited.default_model}
                />
              </FieldGroup>

              <FieldGroup label="Small model">
                <InheritToggle
                  field="small_model"
                  inherited={inherited}
                  setInherited={setInherited}
                  townValue={townConfig?.small_model}
                />
                <ModelCombobox
                  value={smallModel}
                  onValueChange={setSmallModel}
                  models={models}
                  placeholder={inherited.small_model ? `Inherited: ${townConfig?.small_model ?? 'claude-haiku-4.5'}` : 'Select a model...'}
                  disabled={inherited.small_model}
                />
              </FieldGroup>

              <Accordion type="single" collapsible className="mt-2">
                <AccordionItem value="role-overrides" className="border-white/[0.06]">
                  <AccordionTrigger className="text-xs text-white/55 hover:text-white/80">
                    Override by role
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      {(['mayor', 'refinery', 'polecat'] as RoleModelKey[]).map(role => (
                        <FieldGroup key={role} label={`${role.charAt(0).toUpperCase() + role.slice(1)} model`}>
                          <InheritToggle
                            field={`${role}_model` as InheritableField}
                            inherited={inherited}
                            setInherited={setInherited}
                            townValue={townConfig?.role_models?.[role]}
                          />
                          <ModelCombobox
                            value={roleModels[role]}
                            onValueChange={val => setRoleModels(prev => ({ ...prev, [role]: val }))}
                            models={models}
                            placeholder={
                              inherited[`${role}_model` as InheritableField]
                                ? `Inherited: ${townConfig?.role_models?.[role] ?? 'default'}`
                                : 'Select a model...'
                            }
                            disabled={inherited[`${role}_model` as InheritableField]}
                          />
                        </FieldGroup>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </SettingsSection>

            {/* Merge Strategy */}
            <SettingsSection
              id="merge-strategy"
              icon={GitPullRequest}
              title="Merge Strategy"
              description="How changes are merged into the main branch."
            >
              <InheritToggle
                field="merge_strategy"
                inherited={inherited}
                setInherited={setInherited}
                townValue={townConfig?.merge_strategy}
              />
              <div className="flex gap-3">
                {(['direct', 'pr'] as const).map(strategy => (
                  <button
                    key={strategy}
                    onClick={() => setMergeStrategy(strategy)}
                    disabled={inherited.merge_strategy}
                    className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                      mergeStrategy === strategy && !inherited.merge_strategy
                        ? 'border-[color:oklch(95%_0.15_108)] bg-[color:oklch(95%_0.15_108)]/10 text-white/85'
                        : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12]'
                    } ${inherited.merge_strategy ? 'opacity-50' : ''}`}
                  >
                    <div className="text-sm font-medium capitalize">{strategy}</div>
                    <div className="mt-1 text-[11px] text-white/35">
                      {strategy === 'direct'
                        ? 'Push directly to main (no PR)'
                        : 'Create a PR for human review'}
                    </div>
                  </button>
                ))}
              </div>
              {inherited.merge_strategy && (
                <div className="mt-2 text-[11px] text-white/25">
                  Inherited from town: <span className="font-mono">{townConfig?.merge_strategy}</span>
                </div>
              )}
            </SettingsSection>

            {/* Refinery */}
            <SettingsSection
              id="refinery"
              icon={Shield}
              title="Refinery"
              description="Configure code review and merge behavior."
            >
              <ToggleField
                label="Code review"
                description="Enable the refinery to review PRs and add GitHub comments."
                checked={codeReview}
                onCheckedChange={setCodeReview}
                inherited={inherited.code_review}
                onToggleInherit={() =>
                  setInherited(prev => ({ ...prev, code_review: !prev.code_review }))
                }
                townValue={townConfig?.refinery?.code_review}
              />

              <ToggleField
                label="Auto-resolve PR feedback"
                description="Automatically dispatch a polecat to address unresolved review comments and failing CI."
                checked={autoResolvePrFeedback}
                onCheckedChange={setAutoResolvePrFeedback}
                inherited={inherited.auto_resolve_pr_feedback}
                onToggleInherit={() =>
                  setInherited(prev => ({
                    ...prev,
                    auto_resolve_pr_feedback: !prev.auto_resolve_pr_feedback,
                  }))
                }
                townValue={townConfig?.refinery?.auto_resolve_pr_feedback}
              />

              <ToggleField
                label="Auto-merge"
                description="Automatically merge PRs when all checks pass."
                checked={autoMerge}
                onCheckedChange={setAutoMerge}
                inherited={inherited.auto_merge}
                onToggleInherit={() =>
                  setInherited(prev => ({ ...prev, auto_merge: !prev.auto_merge }))
                }
                townValue={townConfig?.refinery?.auto_merge}
              />

              <FieldGroup label="Auto-merge delay (minutes)">
                <InheritToggle
                  field="auto_merge_delay_minutes"
                  inherited={inherited}
                  setInherited={setInherited}
                  townValue={townConfig?.refinery?.auto_merge_delay_minutes}
                />
                <Input
                  type="number"
                  min={0}
                  value={autoMergeDelay}
                  onChange={e => setAutoMergeDelay(e.target.value)}
                  disabled={inherited.auto_merge_delay_minutes}
                  className="border-white/[0.08] bg-white/[0.03] text-white/85 placeholder:text-white/25 disabled:opacity-50"
                  placeholder={
                    inherited.auto_merge_delay_minutes
                      ? `Inherited: ${townConfig?.refinery?.auto_merge_delay_minutes ?? 'null'}`
                      : '0 for immediate'
                  }
                />
              </FieldGroup>

              <ToggleField
                label="Require clean merge"
                description="Only merge when there are no conflicts."
                checked={requireCleanMerge}
                onCheckedChange={setRequireCleanMerge}
                inherited={inherited.require_clean_merge}
                onToggleInherit={() =>
                  setInherited(prev => ({
                    ...prev,
                    require_clean_merge: !prev.require_clean_merge,
                  }))
                }
                townValue={townConfig?.refinery?.require_clean_merge}
              />
            </SettingsSection>

            {/* Custom Instructions */}
            <SettingsSection
              id="custom-instructions"
              icon={Variable}
              title="Custom Instructions"
              description="Append custom instructions to all agent system prompts on this rig."
            >
              <InheritToggle
                field="custom_instructions"
                inherited={inherited}
                setInherited={setInherited}
                townValue={null}
              />
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                disabled={inherited.custom_instructions}
                rows={6}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-white/85 placeholder:text-white/25 focus:border-[color:oklch(95%_0.15_108)] focus:outline-none disabled:opacity-50"
                placeholder={
                  inherited.custom_instructions
                    ? 'Inherited from town (no custom instructions)'
                    : 'Add custom instructions for agents on this rig...'
                }
              />
            </SettingsSection>

            {/* Git */}
            <SettingsSection
              id="git"
              icon={GitBranch}
              title="Git"
              description="Configure git behavior for this rig."
            >
              <FieldGroup label="Default branch">
                <InheritToggle
                  field="default_branch"
                  inherited={inherited}
                  setInherited={setInherited}
                  townValue={rigQuery.data?.default_branch}
                />
                <Input
                  value={defaultBranch}
                  onChange={e => setDefaultBranch(e.target.value)}
                  disabled={inherited.default_branch}
                  className="border-white/[0.08] bg-white/[0.03] text-white/85 placeholder:text-white/25 disabled:opacity-50"
                  placeholder={
                    inherited.default_branch
                      ? `Inherited: ${rigQuery.data?.default_branch ?? 'main'}`
                      : 'main'
                  }
                />
              </FieldGroup>

              <FieldGroup label="Git push flags">
                <InheritToggle
                  field="git_push_flags"
                  inherited={inherited}
                  setInherited={setInherited}
                  townValue={null}
                />
                <Input
                  value={gitPushFlags}
                  onChange={e => setGitPushFlags(e.target.value)}
                  disabled={inherited.git_push_flags}
                  className="border-white/[0.08] bg-white/[0.03] font-mono text-white/85 placeholder:text-white/25 disabled:opacity-50"
                  placeholder={
                    inherited.git_push_flags
                      ? 'Inherited (no overrides)'
                      : '--force-with-lease --no-verify'
                  }
                />
                <span className="mt-1 text-[11px] text-white/25">
                  Space-separated flags passed to git push
                </span>
              </FieldGroup>
            </SettingsSection>

            {/* Convoys */}
            <SettingsSection
              id="convoys"
              icon={Layers}
              title="Convoys"
              description="Configure default convoy behavior for this rig."
            >
              <ToggleField
                label="Staged convoys by default"
                description="New convoys are created in staged mode (agents not dispatched until manually started)."
                checked={stagedConvoys}
                onCheckedChange={setStagedConvoys}
                inherited={inherited.staged_convoys_default}
                onToggleInherit={() =>
                  setInherited(prev => ({
                    ...prev,
                    staged_convoys_default: !prev.staged_convoys_default,
                  }))
                }
                townValue={townConfig?.staged_convoys_default}
              />

              <FieldGroup label="Default convoy merge mode">
                <InheritToggle
                  field="default_convoy_merge_mode"
                  inherited={inherited}
                  setInherited={setInherited}
                  townValue={null}
                />
                <div className="flex gap-2">
                  {(['squash', 'merge', 'rebase'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setConvoyMergeMode(mode)}
                      disabled={inherited.default_convoy_merge_mode}
                      className={`flex-1 rounded-md border px-3 py-2 text-xs capitalize transition-colors ${
                        convoyMergeMode === mode && !inherited.default_convoy_merge_mode
                          ? 'border-[color:oklch(95%_0.15_108)] bg-[color:oklch(95%_0.15_108)]/10 text-white/85'
                          : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:border-white/[0.12]'
                      } ${inherited.default_convoy_merge_mode ? 'opacity-50' : ''}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </FieldGroup>
            </SettingsSection>

            <div style={{ paddingBottom: '75vh' }} />
          </div>
        </div>

        {/* Sidebar */}
        <nav className="hidden w-52 shrink-0 border-l border-white/[0.06] p-4 lg:block lg:sticky lg:top-[53px] lg:self-start">
          <div className="mb-4 text-[10px] font-medium tracking-wide text-white/25 uppercase">
            On this page
          </div>
          <div className="space-y-0.5">
            {SECTIONS.map(section => {
              const Icon = section.icon;
              const isActive = activeId === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollTo(section.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-white/[0.06] text-white/85'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                  }`}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{section.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="active-section"
                      className="ml-auto size-1.5 rounded-full bg-[color:oklch(95%_0.15_108)]"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 border-t border-white/[0.06] pt-4">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="w-full gap-1.5 bg-[color:oklch(95%_0.15_108_/_0.90)] text-black hover:bg-[color:oklch(95%_0.15_108_/_0.95)] disabled:opacity-50"
            >
              <Save className="size-3.5" />
              Save changes
            </Button>
          </div>
        </nav>
      </div>
    </div>
  );
}

function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
    >
      <div className="mb-4 flex items-start gap-3">
        <Icon className="mt-0.5 size-4 text-white/35" />
        <div>
          <h2 className="text-sm font-semibold text-white/85">{title}</h2>
          <p className="mt-0.5 text-xs text-white/35">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </motion.section>
  );
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-white/55">{label}</Label>
      <div className="space-y-2">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-white/25">{hint}</p>}
    </div>
  );
}

function InheritToggle({
  field,
  inherited,
  setInherited,
  townValue,
}: {
  field: InheritableField;
  inherited: Record<InheritableField, boolean>;
  setInherited: React.Dispatch<React.SetStateAction<Record<InheritableField, boolean>>>;
  townValue?: unknown;
}) {
  const isOverridden = !inherited[field];
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-white/35">
        {isOverridden ? 'Override enabled' : `Inherited${townValue != null ? `: ${String(townValue)}` : ''}`}
      </span>
      <button
        onClick={() => setInherited(prev => ({ ...prev, [field]: !prev[field] }))}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
          isOverridden
            ? 'bg-[color:oklch(95%_0.15_108)]/15 text-[color:oklch(95%_0.15_108)] hover:bg-[color:oklch(95%_0.15_108)]/25'
            : 'bg-white/[0.06] text-white/40 hover:text-white/70'
        }`}
      >
        {isOverridden ? (
          <>
            <X className="size-3" />
            Remove override
          </>
        ) : (
          <>
            <GitBranch className="size-3" />
            Override
          </>
        )}
      </button>
    </div>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onCheckedChange,
  inherited,
  onToggleInherit,
  townValue,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  inherited: boolean;
  onToggleInherit: () => void;
  townValue?: unknown;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/70">{label}</span>
          {inherited && townValue != null && (
            <span className="text-[10px] text-white/25">
              (inherited: {String(townValue)})
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-white/35">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleInherit}
          className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
            inherited
              ? 'bg-white/[0.06] text-white/30 hover:text-white/60'
              : 'bg-[color:oklch(95%_0.15_108)]/15 text-[color:oklch(95%_0.15_108)]'
          }`}
        >
          {inherited ? 'Override' : 'Inherit'}
        </button>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={inherited}
          className={inherited ? 'opacity-40' : ''}
        />
      </div>
    </div>
  );
}
