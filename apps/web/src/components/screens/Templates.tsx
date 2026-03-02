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
import type { Screen } from '@/app/game/useGameController';
import { ALWAYS_AVAILABLE_ACTION_IDS, BASE_ACTION_DEFINITIONS } from '@adventure/shared';
import type { ActionDefinition, CombatTemplateData, CombatTemplateAction, ResourceState } from '@adventure/shared';
import { TemplateTutorial } from '@/components/common/TemplateTutorial';

// --- Constants ---

const ACTION_GROUPS: Record<string, string> = {
  light_attack: 'Basic', normal_attack: 'Basic', heavy_attack: 'Basic',
  defend: 'Basic', counter: 'Basic', ward: 'Basic',
  use_hp_potion: 'Basic', use_stamina_potion: 'Basic', use_mana_potion: 'Basic',
  power_strike: 'Melee', cleave: 'Melee', battle_cry: 'Melee',
  devastating_blow: 'Melee', berserker_rage: 'Melee', execute: 'Melee', titans_wrath: 'Melee',
  aimed_shot: 'Ranged', crippling_shot: 'Ranged', eagle_eye: 'Ranged',
  volley: 'Ranged', snipers_mark: 'Ranged', piercing_shot: 'Ranged', death_mark: 'Ranged',
  fire_bolt: 'Magic', minor_heal: 'Magic', frost_nova: 'Magic',
  enhanced_fortitude: 'Magic', chain_lightning: 'Magic', heal_ally: 'Magic',
  arcane_blast: 'Magic', regeneration: 'Magic', meteor_strike: 'Magic',
  taunt: 'General', fortify: 'General',
};

const GROUP_ORDER = ['Basic', 'Melee', 'Ranged', 'Magic', 'General'];

const GROUP_COLORS: Record<string, string> = {
  Basic: 'var(--rpg-text-secondary)',
  Melee: 'var(--rpg-red)',
  Ranged: 'var(--rpg-green-light)',
  Magic: 'var(--rpg-blue-light)',
  General: 'var(--rpg-gold)',
};

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
      {cost.stamina > 0 && <span>Stam: {cost.stamina}</span>}
      {cost.mana > 0 && <span>Mana: {cost.mana}</span>}
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
  const [editorActions, setEditorActions] = useState<CombatTemplateAction[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setEditorActions([]);
    setError(null);
  }, []);

  const handleEdit = useCallback((t: CombatTemplateData) => {
    setIsNew(false);
    setEditingTemplate(t);
    setEditorName(t.name);
    setEditorActions([...t.actions]);
    setError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingTemplate(null);
    setIsNew(false);
    setShowPicker(false);
    setError(null);
  }, []);

  // -- Editor actions --

  const moveSlot = useCallback((index: number, direction: -1 | 1) => {
    setEditorActions(prev => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removeSlot = useCallback((index: number) => {
    setEditorActions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addAction = useCallback((actionId: string) => {
    setEditorActions(prev => [...prev, { actionId }]);
    setShowPicker(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editorName.trim()) { setError('Name is required'); return; }
    if (editorActions.length === 0) { setError('Add at least one action'); return; }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await createTemplate(editorName.trim(), editorActions);
      } else if (editingTemplate) {
        await updateTemplate(editingTemplate.id, editorName.trim(), editorActions);
      }
      await onLoadTemplates();
      setEditingTemplate(null);
      setIsNew(false);
    } catch {
      setError('Failed to save template');
    } finally {
      setSaving(false);
    }
  }, [editorName, editorActions, isNew, editingTemplate, onLoadTemplates]);

  // -- Resource sustainability calc --

  const cycleCost = editorActions.reduce(
    (acc, a) => {
      const def = BASE_ACTION_DEFINITIONS[a.actionId];
      if (!def) return acc;
      return { stamina: acc.stamina + def.cost.stamina, mana: acc.mana + def.cost.mana };
    },
    { stamina: 0, mana: 0 },
  );

  const staminaPerCycle = staminaState.regenPerRound * editorActions.length;
  const manaPerCycle = manaState.regenPerRound * editorActions.length;
  const staminaSustainable = cycleCost.stamina <= staminaPerCycle;
  const manaSustainable = cycleCost.mana <= manaPerCycle;

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

  // Action picker — 9 base actions are always available; talent actions require unlockedActions
  const unlockedSet = new Set(unlockedActions);
  const allActions = Object.values(BASE_ACTION_DEFINITIONS);
  const grouped: Record<string, ActionDefinition[]> = {};
  for (const group of GROUP_ORDER) grouped[group] = [];
  for (const def of allActions) {
    const group = ACTION_GROUPS[def.id] ?? 'Basic';
    if (grouped[group]) grouped[group].push(def);
  }

  if (showPicker) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setShowPicker(false)} className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-[var(--rpg-text-primary)]">Add Action</h2>
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
                        Add
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
            className="w-full bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-2 py-1.5 text-sm text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-gold)]"
          />
        </PixelCard>

        {/* Action slots */}
        <PixelCard padding="sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--rpg-text-secondary)]">Actions ({editorActions.length})</span>
            <PixelButton size="sm" variant="secondary" onClick={() => setShowPicker(true)}>
              <Plus size={14} className="mr-1 inline" /> Add Action
            </PixelButton>
          </div>
          {editorActions.length === 0 ? (
            <p className="text-sm text-[var(--rpg-text-secondary)] text-center py-4">
              No actions yet. Add actions to build your combat rotation.
            </p>
          ) : (
            <div className="space-y-1">
              {editorActions.map((slot, i) => {
                const def = BASE_ACTION_DEFINITIONS[slot.actionId];
                if (!def) return null;
                return (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-[var(--rpg-background)] border border-[var(--rpg-border)]">
                    <span className="text-xs font-mono text-[var(--rpg-text-secondary)] w-5 shrink-0 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{def.name}</span>
                        {groupBadge(ACTION_GROUPS[def.id] ?? 'Basic')}
                      </div>
                      <ActionCostLabel cost={def.cost} />
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => moveSlot(i, -1)}
                        disabled={i === 0}
                        className="p-1 text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] disabled:opacity-30"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        onClick={() => moveSlot(i, 1)}
                        disabled={i === editorActions.length - 1}
                        className="p-1 text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] disabled:opacity-30"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        onClick={() => removeSlot(i)}
                        className="p-1 text-[var(--rpg-red)] hover:text-[#cc4444]"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PixelCard>

        {/* Resource preview */}
        {editorActions.length > 0 && (
          <PixelCard padding="sm">
            <span className="text-xs text-[var(--rpg-text-secondary)] block mb-2">Resource Preview (per cycle of {editorActions.length} actions)</span>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-[var(--rpg-text-secondary)] text-xs">Stamina cost:</span>
                <span className="ml-1 text-[var(--rpg-text-primary)]">{cycleCost.stamina}</span>
              </div>
              <div>
                <span className="text-[var(--rpg-text-secondary)] text-xs">Mana cost:</span>
                <span className="ml-1 text-[var(--rpg-text-primary)]">{cycleCost.mana}</span>
              </div>
              <div>
                <span className="text-[var(--rpg-text-secondary)] text-xs">Stamina regen:</span>
                <span className="ml-1 text-[var(--rpg-text-primary)]">{staminaPerCycle}/cycle</span>
              </div>
              <div>
                <span className="text-[var(--rpg-text-secondary)] text-xs">Mana regen:</span>
                <span className="ml-1 text-[var(--rpg-text-primary)]">{manaPerCycle}/cycle</span>
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
    <div className="space-y-4">
      <TemplateTutorial />
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-[var(--rpg-text-primary)]">Combat Templates</h2>
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
                    <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{t.name}</span>
                    {t.isActive && (
                      <span className="text-[10px] font-bold text-[var(--rpg-gold)] uppercase">Active</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--rpg-text-secondary)]">
                    {t.actions.length} action{t.actions.length !== 1 ? 's' : ''}
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
    </div>
  );
}
