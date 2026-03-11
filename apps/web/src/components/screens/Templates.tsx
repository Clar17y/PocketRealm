'use client';

import { useState, useEffect, useCallback } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { Star, Plus, ArrowUp, ArrowDown, X, Lock, ChevronLeft } from 'lucide-react';
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  activateTemplate,
} from '@/lib/api';
import type { Screen } from '@/app/game/gameController.types';
import { ALWAYS_AVAILABLE_ACTION_IDS, BASE_ACTION_DEFINITIONS, BUFF_EFFECTS, DEBUFF_EFFECTS, getAllTalentNodes } from '@pocketrealm/shared';
import type { ActionDefinition, CombatTemplateData, CombatTemplateSlotData, SlotCondition, ConditionType, ConditionResourceType, ResourceState } from '@pocketrealm/shared';
import { TemplateTutorial } from '@/components/common/TemplateTutorial';
import { ScreenContainer } from '../common/ScreenContainer';

// --- Constants ---

// Base actions are always "Basic"; talent actions derive their group from the tree they unlock in
const ACTION_GROUPS: Record<string, string> = {
  light_attack: 'Basic', normal_attack: 'Basic', heavy_attack: 'Basic',
  defend: 'Basic', counter: 'Basic', ward: 'Basic',
  use_hp_potion: 'Basic', use_stamina_potion: 'Basic', use_mana_potion: 'Basic',
};
for (const node of getAllTalentNodes()) {
  if (node.unlocksAction) {
    ACTION_GROUPS[node.unlocksAction] = node.tree.charAt(0).toUpperCase() + node.tree.slice(1);
  }
}

const GROUP_ORDER = ['Basic', 'Melee', 'Ranged', 'Magic', 'General'];

const GROUP_COLORS: Record<string, string> = {
  Basic: 'var(--rpg-text-secondary)',
  Melee: 'var(--rpg-red)',
  Ranged: 'var(--rpg-green-light)',
  Magic: 'var(--rpg-blue-light)',
  General: 'var(--rpg-gold)',
};

// --- Condition helpers ---

interface ConditionOption {
  value: string;
  label: string;
}

const CONDITION_OPTIONS: ConditionOption[] = [
  { value: 'hp_below', label: 'HP below' },
  { value: 'hp_above', label: 'HP above' },
  { value: 'stamina_below', label: 'Stamina below' },
  { value: 'stamina_above', label: 'Stamina above' },
  { value: 'mana_below', label: 'Mana below' },
  { value: 'mana_above', label: 'Mana above' },
  { value: 'has_buff', label: 'Buff active' },
  { value: 'has_debuff', label: 'Debuff active' },
  { value: 'no_buff', label: 'Buff missing' },
  { value: 'no_debuff', label: 'Debuff cleared' },
  { value: 'any_debuff', label: 'Any debuff active' },
  { value: 'any_magic_dot', label: 'Any magic DOT active' },
];

function conditionToCombo(c: SlotCondition): string {
  if (c.type === 'resource_below' && c.resource) return `${c.resource}_below`;
  if (c.type === 'resource_above' && c.resource) return `${c.resource}_above`;
  return c.type;
}

function comboToCondition(combo: string, prev?: SlotCondition): SlotCondition {
  const resourceMap: Record<string, ConditionResourceType> = {
    hp_below: 'hp', hp_above: 'hp',
    stamina_below: 'stamina', stamina_above: 'stamina',
    mana_below: 'mana', mana_above: 'mana',
  };
  const typeMap: Record<string, ConditionType> = {
    hp_below: 'resource_below', hp_above: 'resource_above',
    stamina_below: 'resource_below', stamina_above: 'resource_above',
    mana_below: 'resource_below', mana_above: 'resource_above',
    has_buff: 'has_buff', has_debuff: 'has_debuff',
    no_buff: 'no_buff', no_debuff: 'no_debuff',
    any_debuff: 'any_debuff', any_magic_dot: 'any_magic_dot',
  };
  const type = typeMap[combo] ?? 'resource_below';
  const resource = resourceMap[combo];
  if (resource) {
    return { type, resource, threshold: prev?.threshold ?? 50 };
  }
  if (type === 'any_debuff' || type === 'any_magic_dot') {
    return { type };
  }
  return { type, effectName: prev?.effectName ?? '' };
}

function isResourceCondition(c: SlotCondition): boolean {
  return c.type === 'resource_below' || c.type === 'resource_above';
}

function needsEffectName(c: SlotCondition): boolean {
  return c.type === 'has_buff' || c.type === 'has_debuff' || c.type === 'no_buff' || c.type === 'no_debuff';
}

// --- Condition summary helper ---

function conditionSummary(c: SlotCondition): string {
  if (c.type === 'resource_below' && c.resource) return `${c.resource.toUpperCase()} < ${c.threshold ?? 50}%`;
  if (c.type === 'resource_above' && c.resource) return `${c.resource.toUpperCase()} > ${c.threshold ?? 50}%`;
  if (c.type === 'has_buff') return `${c.effectName ?? 'buff'} active`;
  if (c.type === 'has_debuff') return `${c.effectName ?? 'debuff'} active`;
  if (c.type === 'no_buff') return `${c.effectName ?? 'buff'} missing`;
  if (c.type === 'no_debuff') return `${c.effectName ?? 'debuff'} cleared`;
  if (c.type === 'any_debuff') return 'Any debuff active';
  if (c.type === 'any_magic_dot') return 'Any magic DOT active';
  return c.type;
}

// --- Template preview helper ---

function templatePreview(slots: CombatTemplateSlotData[]): string {
  return slots.map(s => {
    const def = BASE_ACTION_DEFINITIONS[s.actionId];
    const name = def?.name ?? s.actionId;
    if (s.condition && s.thenActionId) {
      const thenName = BASE_ACTION_DEFINITIONS[s.thenActionId]?.name ?? s.thenActionId;
      return `IF ${conditionSummary(s.condition)} \u2192 ${thenName}`;
    }
    return name;
  }).join(' \u2192 ');
}

// --- Editor slot type ---

interface EditorSlot {
  actionId: string;
  condition?: SlotCondition;
  thenActionId?: string;
}

type PickerTarget =
  | { type: 'add' }
  | { type: 'then'; index: number }
  | { type: 'else'; index: number }
  | null;

// --- Helpers ---

function groupBadge(group: string) {
  return (
    <span
      className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
      style={{ color: GROUP_COLORS[group] ?? 'var(--rpg-text-secondary)', borderColor: GROUP_COLORS[group] ?? 'var(--rpg-text-secondary)', borderWidth: 1 }}
    >
      {group}
    </span>
  );
}

function ActionCostLabel({ cost }: { cost: { stamina: number; mana: number } }) {
  return (
    <div className="flex gap-2 text-[10px] text-[var(--rpg-text-secondary)]">
      {cost.stamina > 0 && <span>Stam: <span className="font-pixel text-[12px]">{cost.stamina}</span></span>}
      {cost.mana > 0 && <span>Mana: <span className="font-pixel text-[12px]">{cost.mana}</span></span>}
      {cost.stamina === 0 && cost.mana === 0 && <span>Free</span>}
    </div>
  );
}

// --- Props ---

interface TemplatesProps {
  templates: CombatTemplateData[];
  unlockedActions: string[];
  staminaState: ResourceState;
  manaState: ResourceState;
  onLoadTemplates: () => Promise<void>;
  onNavigate: (screen: Screen) => void;
}

// --- Component ---

export function Templates({
  templates,
  unlockedActions,
  staminaState,
  manaState,
  onLoadTemplates,
  onNavigate,
}: TemplatesProps) {
  const [editingTemplate, setEditingTemplate] = useState<CombatTemplateData | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editorName, setEditorName] = useState('');
  const [editorSlots, setEditorSlots] = useState<EditorSlot[]>([]);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  useEffect(() => {
    void onLoadTemplates();
  }, [onLoadTemplates]);

  // -- List actions --

  const handleActivate = useCallback(async (id: string) => {
    await activateTemplate(id);
    await onLoadTemplates();
  }, [onLoadTemplates]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteTemplate(id);
    await onLoadTemplates();
  }, [onLoadTemplates]);

  const handleNewTemplate = useCallback(() => {
    setIsNew(true);
    setEditingTemplate(null);
    setEditorName('New Template');
    setEditorSlots([]);
    setExpandedSlot(null);
    setError(null);
  }, []);

  const handleEdit = useCallback((t: CombatTemplateData) => {
    setIsNew(false);
    setEditingTemplate(t);
    setEditorName(t.name);
    setEditorSlots(t.slots.map(s => ({
      actionId: s.actionId,
      condition: s.condition,
      thenActionId: s.thenActionId,
    })));
    setExpandedSlot(null);
    setError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingTemplate(null);
    setIsNew(false);
    setPickerTarget(null);
    setExpandedSlot(null);
    setError(null);
  }, []);

  // -- Editor actions --

  const moveSlot = useCallback((index: number, direction: -1 | 1) => {
    setEditorSlots(prev => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    // Track expanded slot through the move
    setExpandedSlot(prev => {
      if (prev === index) return index + direction;
      if (prev === index + direction) return index;
      return prev;
    });
  }, []);

  const removeSlot = useCallback((index: number) => {
    setEditorSlots(prev => prev.filter((_, i) => i !== index));
    setExpandedSlot(null);
  }, []);

  const addAction = useCallback((actionId: string) => {
    if (!pickerTarget) return;
    if (pickerTarget.type === 'add') {
      setEditorSlots(prev => [...prev, { actionId }]);
    } else if (pickerTarget.type === 'then') {
      setEditorSlots(prev => prev.map((s, i) =>
        i === pickerTarget.index ? { ...s, thenActionId: actionId } : s
      ));
    } else if (pickerTarget.type === 'else') {
      setEditorSlots(prev => prev.map((s, i) =>
        i === pickerTarget.index ? { ...s, actionId } : s
      ));
    }
    setPickerTarget(null);
  }, [pickerTarget]);

  const updateSlot = useCallback((index: number, updates: Partial<EditorSlot>) => {
    setEditorSlots(prev => prev.map((s, i) =>
      i === index ? { ...s, ...updates } : s
    ));
  }, []);

  const toggleCondition = useCallback((index: number) => {
    setEditorSlots(prev => prev.map((s, i) => {
      if (i !== index) return s;
      if (s.condition) {
        // Remove condition
        return { actionId: s.actionId };
      }
      // Add default condition
      return {
        ...s,
        condition: { type: 'resource_below' as ConditionType, resource: 'hp' as ConditionResourceType, threshold: 50 },
      };
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!editorName.trim()) { setError('Name is required'); return; }
    if (editorSlots.length === 0) { setError('Add at least one action'); return; }
    // Validate: conditional slots must have thenActionId
    const incomplete = editorSlots.some(s => s.condition && !s.thenActionId);
    if (incomplete) { setError('All conditions need a "then" action'); return; }
    setSaving(true);
    setError(null);
    try {
      const slots: Omit<CombatTemplateSlotData, 'id'>[] = editorSlots.map((s, i) => ({
        sortOrder: i,
        actionId: s.actionId,
        ...(s.condition && s.thenActionId ? { condition: s.condition, thenActionId: s.thenActionId } : {}),
      }));
      if (isNew) {
        await createTemplate(editorName.trim(), slots);
      } else if (editingTemplate) {
        await updateTemplate(editingTemplate.id, editorName.trim(), slots);
      }
      await onLoadTemplates();
      setEditingTemplate(null);
      setIsNew(false);
    } catch {
      setError('Failed to save template');
    } finally {
      setSaving(false);
    }
  }, [editorName, editorSlots, isNew, editingTemplate, onLoadTemplates]);

  // -- Resource sustainability calc (worst-case per slot) --

  const cycleCost = editorSlots.reduce(
    (acc, s) => {
      const mainDef = BASE_ACTION_DEFINITIONS[s.actionId];
      const thenDef = s.thenActionId ? BASE_ACTION_DEFINITIONS[s.thenActionId] : null;
      const staminaCost = Math.max(mainDef?.cost.stamina ?? 0, thenDef?.cost.stamina ?? 0);
      const manaCost = Math.max(mainDef?.cost.mana ?? 0, thenDef?.cost.mana ?? 0);
      return { stamina: acc.stamina + staminaCost, mana: acc.mana + manaCost };
    },
    { stamina: 0, mana: 0 },
  );

  const staminaPerCycle = staminaState.regenPerRound * editorSlots.length;
  const manaPerCycle = manaState.regenPerRound * editorSlots.length;
  function sustainLabel(costPerCycle: number, regenPerCycle: number, pool: number, poolName: string) {
    if (costPerCycle === 0) return null;
    if (costPerCycle <= regenPerCycle) {
      return <span className="text-[var(--rpg-green-light)]">{poolName}: Sustainable</span>;
    }
    const deficit = costPerCycle - regenPerCycle;
    const rounds = deficit > 0 ? Math.ceil(pool / deficit) : Infinity;
    return <span className="text-[var(--rpg-red)]">{poolName}: ~{rounds} rounds before exhaustion</span>;
  }

  // -- Rendering --

  const isEditing = editingTemplate !== null || isNew;

  // Action picker -- base actions always available; talent actions require unlockedActions
  const unlockedSet = new Set(unlockedActions);
  const allActions = Object.values(BASE_ACTION_DEFINITIONS);
  const grouped: Record<string, ActionDefinition[]> = {};
  for (const group of GROUP_ORDER) grouped[group] = [];
  for (const def of allActions) {
    const group = ACTION_GROUPS[def.id] ?? 'Basic';
    if (grouped[group]) grouped[group].push(def);
  }

  // --- Action picker view ---

  if (pickerTarget) {
    let pickerTitle: string;
    let pickerButtonLabel: string;
    if (pickerTarget.type === 'add') {
      pickerTitle = 'Add Action';
      pickerButtonLabel = 'Add';
    } else if (pickerTarget.type === 'then') {
      pickerTitle = `Pick Then Action (Slot #${pickerTarget.index + 1})`;
      pickerButtonLabel = 'Pick';
    } else {
      pickerTitle = `Pick Else Action (Slot #${pickerTarget.index + 1})`;
      pickerButtonLabel = 'Pick';
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setPickerTarget(null)} className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-[var(--rpg-text-primary)]">{pickerTitle}</h2>
        </div>
        {GROUP_ORDER.map(group => (
          <div key={group}>
            <h3 className="text-sm font-bold mb-2" style={{ color: GROUP_COLORS[group] ?? 'var(--rpg-text-secondary)' }}>
              {group}
            </h3>
            <div className="space-y-1">
              {grouped[group].map(def => {
                const locked = !ALWAYS_AVAILABLE_ACTION_IDS.has(def.id) && !unlockedSet.has(def.id);
                return (
                  <PixelCard key={def.id} padding="sm" className={locked ? 'opacity-50' : ''}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {locked && <Lock size={12} className="text-[var(--rpg-text-secondary)] shrink-0" />}
                          <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{def.name}</span>
                        </div>
                        <p className="text-[11px] text-[var(--rpg-text-secondary)] mt-0.5 truncate">{def.description}</p>
                        <div className="mt-0.5"><ActionCostLabel cost={def.cost} /></div>
                      </div>
                      <PixelButton
                        size="sm"
                        variant="secondary"
                        disabled={locked}
                        onClick={() => addAction(def.id)}
                        className="ml-2 shrink-0"
                      >
                        {pickerButtonLabel}
                      </PixelButton>
                    </div>
                  </PixelCard>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // --- Editor view ---

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={handleCancel} className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-[var(--rpg-text-primary)]">
            {isNew ? 'New Template' : 'Edit Template'}
          </h2>
        </div>

        {error && (
          <div className="p-2 rounded-lg bg-[var(--rpg-red)]/10 border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm">
            {error}
          </div>
        )}

        {/* Name input */}
        <PixelCard padding="sm">
          <label className="text-xs text-[var(--rpg-text-secondary)] mb-1 block">Template Name</label>
          <input
            type="text"
            value={editorName}
            onChange={e => setEditorName(e.target.value)}
            maxLength={40}
            className="w-full bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-2 py-1.5 text-sm text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-gold)] min-h-[44px]"
          />
        </PixelCard>

        {/* Action slots */}
        <PixelCard padding="sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--rpg-text-secondary)]">Slots ({editorSlots.length})</span>
            <PixelButton size="sm" variant="secondary" onClick={() => setPickerTarget({ type: 'add' })}>
              <Plus size={14} className="mr-1 inline" /> Add Action
            </PixelButton>
          </div>
          {editorSlots.length === 0 ? (
            <p className="text-sm text-[var(--rpg-text-secondary)] text-center py-4">
              No actions yet. Add actions to build your combat rotation.
            </p>
          ) : (
            <div className="space-y-1">
              {editorSlots.map((slot, i) => {
                const def = BASE_ACTION_DEFINITIONS[slot.actionId];
                if (!def) return null;
                const hasCondition = !!slot.condition;
                const isExpanded = expandedSlot === i;
                const thenDef = slot.thenActionId ? BASE_ACTION_DEFINITIONS[slot.thenActionId] : null;

                return (
                  <div key={i} className="rounded bg-[var(--rpg-background)] border border-[var(--rpg-border)]">
                    {/* Collapsed row - always visible, tappable to expand */}
                    <div
                      className="flex items-center gap-2 p-2 cursor-pointer active:bg-[var(--rpg-surface)]"
                      onClick={() => setExpandedSlot(isExpanded ? null : i)}
                    >
                      <span className="text-[8px] font-pixel text-[var(--rpg-text-secondary)] w-5 shrink-0 text-center">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        {hasCondition ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase px-1 py-0.5 rounded border"
                              style={{ color: 'var(--rpg-gold)', borderColor: 'var(--rpg-gold)' }}>
                              IF
                            </span>
                            <span className="text-sm text-[var(--rpg-text-primary)] truncate">
                              {conditionSummary(slot.condition!)} &#x2192; {thenDef?.name ?? '?'}, else {def.name}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{def.name}</span>
                            {groupBadge(ACTION_GROUPS[def.id] ?? 'Basic')}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); moveSlot(i, -1); }}
                          disabled={i === 0}
                          className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] disabled:opacity-30"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); moveSlot(i, 1); }}
                          disabled={i === editorSlots.length - 1}
                          className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] disabled:opacity-30"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); removeSlot(i); }}
                          className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center text-[var(--rpg-red)] hover:text-[#cc4444]"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className="border-t border-[var(--rpg-border)] p-3 space-y-3">
                        {hasCondition ? (
                          /* Expanded conditional slot */
                          <>
                            {/* Condition type select */}
                            <div>
                              <label className="text-[10px] text-[var(--rpg-text-secondary)] uppercase font-bold mb-1 block">Condition</label>
                              <select
                                value={conditionToCombo(slot.condition!)}
                                onChange={e => updateSlot(i, { condition: comboToCondition(e.target.value, slot.condition) })}
                                className="w-full min-h-[44px] bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-2 text-sm text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-gold)]"
                              >
                                {CONDITION_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>

                            {/* Value: threshold, effect name, or nothing (any_debuff/any_magic_dot) */}
                            <div>
                              <label className="text-[10px] text-[var(--rpg-text-secondary)] uppercase font-bold mb-1 block">Value</label>
                              {isResourceCondition(slot.condition!) ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={slot.condition!.threshold ?? 50}
                                    onChange={e => {
                                      const n = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                                      updateSlot(i, { condition: { ...slot.condition!, threshold: n } });
                                    }}
                                    className="w-20 min-h-[44px] bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-2 text-sm text-[var(--rpg-text-primary)] text-center focus:outline-none focus:border-[var(--rpg-gold)]"
                                  />
                                  <span className="text-sm text-[var(--rpg-text-secondary)]">%</span>
                                </div>
                              ) : needsEffectName(slot.condition!) ? (
                                <select
                                  value={slot.condition!.effectName ?? ''}
                                  onChange={e => updateSlot(i, { condition: { ...slot.condition!, effectName: e.target.value } })}
                                  className="w-full min-h-[44px] bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-2 text-sm text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-gold)]"
                                >
                                  <option value="">Select effect...</option>
                                  {(slot.condition!.type === 'has_buff' || slot.condition!.type === 'no_buff') ? (
                                    <optgroup label="Buffs">
                                      {BUFF_EFFECTS.map(e => (
                                        <option key={e.name} value={e.name}>{e.name} ({e.description})</option>
                                      ))}
                                    </optgroup>
                                  ) : (
                                    <optgroup label="Debuffs &amp; Status">
                                      {DEBUFF_EFFECTS.map(e => (
                                        <option key={e.name} value={e.name}>{e.name} ({e.description})</option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              ) : (
                                <span className="text-sm text-[var(--rpg-text-secondary)] italic min-h-[44px] flex items-center">No value needed</span>
                              )}
                            </div>

                            {/* Then action row */}
                            <div>
                              <label className="text-[10px] text-[var(--rpg-text-secondary)] uppercase font-bold mb-1 block">
                                <span className="text-[var(--rpg-green-light)]">Then</span> action
                              </label>
                              <div className="flex items-center gap-2">
                                <span className="flex-1 text-sm text-[var(--rpg-text-primary)]">
                                  {thenDef ? thenDef.name : <em className="text-[var(--rpg-text-secondary)]">Not set</em>}
                                </span>
                                <PixelButton
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setPickerTarget({ type: 'then', index: i })}
                                >
                                  Change
                                </PixelButton>
                              </div>
                            </div>

                            {/* Else action row */}
                            <div>
                              <label className="text-[10px] text-[var(--rpg-text-secondary)] uppercase font-bold mb-1 block">
                                <span className="text-[var(--rpg-text-secondary)]">Else</span> action
                              </label>
                              <div className="flex items-center gap-2">
                                <span className="flex-1 text-sm text-[var(--rpg-text-primary)]">
                                  {def.name}
                                </span>
                                <PixelButton
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setPickerTarget({ type: 'else', index: i })}
                                >
                                  Change
                                </PixelButton>
                              </div>
                            </div>

                            {/* Remove condition */}
                            <PixelButton
                              size="sm"
                              variant="danger"
                              className="w-full"
                              onClick={() => {
                                updateSlot(i, { condition: undefined, thenActionId: undefined });
                              }}
                            >
                              Remove Condition
                            </PixelButton>
                          </>
                        ) : (
                          /* Expanded unconditional slot */
                          <>
                            {/* Action info */}
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{def.name}</span>
                              {groupBadge(ACTION_GROUPS[def.id] ?? 'Basic')}
                            </div>
                            <ActionCostLabel cost={def.cost} />

                            {/* Change action */}
                            <PixelButton
                              size="sm"
                              variant="secondary"
                              className="w-full"
                              onClick={() => setPickerTarget({ type: 'else', index: i })}
                            >
                              Change Action
                            </PixelButton>

                            {/* Add condition */}
                            <PixelButton
                              size="sm"
                              variant="secondary"
                              className="w-full"
                              onClick={() => toggleCondition(i)}
                            >
                              <Plus size={14} className="mr-1 inline" /> Add Condition
                            </PixelButton>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PixelCard>

        {/* Resource preview */}
        {editorSlots.length > 0 && (
          <PixelCard padding="sm">
            <span className="text-xs text-[var(--rpg-text-secondary)] block mb-2">Resource Preview (worst-case per cycle of <span className="font-pixel text-[8px]">{editorSlots.length}</span> slots)</span>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-[var(--rpg-text-secondary)] text-xs">Stamina cost:</span>
                <span className="ml-1 text-[var(--rpg-text-primary)] font-pixel text-[12px]">{cycleCost.stamina}</span>
              </div>
              <div>
                <span className="text-[var(--rpg-text-secondary)] text-xs">Mana cost:</span>
                <span className="ml-1 text-[var(--rpg-text-primary)] font-pixel text-[12px]">{cycleCost.mana}</span>
              </div>
              <div>
                <span className="text-[var(--rpg-text-secondary)] text-xs">Stamina regen:</span>
                <span className="ml-1 text-[var(--rpg-text-primary)] font-pixel text-[12px]">{staminaPerCycle}/cycle</span>
              </div>
              <div>
                <span className="text-[var(--rpg-text-secondary)] text-xs">Mana regen:</span>
                <span className="ml-1 text-[var(--rpg-text-primary)] font-pixel text-[12px]">{manaPerCycle}/cycle</span>
              </div>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              {sustainLabel(cycleCost.stamina, staminaPerCycle, staminaState.current, 'Stamina')}
              {cycleCost.stamina > 0 && cycleCost.mana > 0 && <br />}
              {sustainLabel(cycleCost.mana, manaPerCycle, manaState.current, 'Mana')}
            </div>
          </PixelCard>
        )}

        {/* Save/Cancel */}
        <div className="flex gap-2">
          <PixelButton variant="secondary" onClick={handleCancel} className="flex-1">
            Cancel
          </PixelButton>
          <PixelButton variant="primary" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Saving...' : 'Save'}
          </PixelButton>
        </div>
      </div>
    );
  }

  // -- List view --
  return (
    <ScreenContainer>
      <TemplateTutorial />
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">Combat Templates</h2>
        <PixelButton size="sm" variant="primary" onClick={handleNewTemplate}>
          <Plus size={14} className="mr-1 inline" /> New Template
        </PixelButton>
      </div>

      {templates.length === 0 ? (
        <PixelCard>
          <p className="text-sm text-[var(--rpg-text-secondary)] text-center py-6">
            No templates yet. Create one to define your combat rotation.
          </p>
        </PixelCard>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <PixelCard key={t.id} padding="sm">
              <div className="flex items-start gap-2">
                <div className="pt-0.5 shrink-0">
                  {t.isActive ? (
                    <Star size={16} className="text-[var(--rpg-gold)] fill-[var(--rpg-gold)]" />
                  ) : (
                    <Star size={16} className="text-[var(--rpg-border)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold font-almendra text-[var(--rpg-text-primary)]">{t.name}</span>
                    {t.isActive && (
                      <span className="text-[10px] font-bold text-[var(--rpg-gold)] uppercase">Active</span>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--rpg-text-secondary)] block truncate mt-0.5">
                    {templatePreview(t.slots)}
                  </span>
                  <span className="text-xs text-[var(--rpg-text-secondary)]">
                    <span className="font-pixel text-[8px]">{t.slots.length}</span> slot{t.slots.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <PixelButton size="sm" variant="secondary" onClick={() => handleEdit(t)}>
                    Edit
                  </PixelButton>
                  {!t.isActive && (
                    <PixelButton size="sm" variant="gold" onClick={() => handleActivate(t.id)}>
                      Activate
                    </PixelButton>
                  )}
                  <PixelButton size="sm" variant="danger" onClick={() => handleDelete(t.id)}>
                    Delete
                  </PixelButton>
                </div>
              </div>
            </PixelCard>
          ))}
        </div>
      )}
    </ScreenContainer>
  );
}
