'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  adminGrantTurns,
  adminSetLevel,
  adminGrantXp,
  adminSetAttributes,
  adminGetItemTemplates,
  adminGrantItem,
  adminGetEventTemplates,
  adminGetActiveEvents,
  adminSpawnEvent,
  adminCancelEvent,
  adminGetMobs,
  adminGetMobFamilies,
  adminSpawnBoss,
  adminGetZones,
  adminDiscoverAllZones,
  adminTeleport,
  adminSpawnEncounter,
  adminGetResourceNodes,
  adminSpawnResourceNode,
  type AdminItemTemplate,
  type AdminZone,
  type AdminMobTemplate,
  type AdminMobFamily,
  type AdminEventTemplate,
  type AdminActiveEvent,
  type AdminResourceNode,
} from '@/lib/api';
import { Shield } from 'lucide-react';

type AdminTab = 'player' | 'items' | 'world' | 'zones' | 'resources';

function StatusMsg({ msg }: { msg: { text: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <div className={`text-sm mt-2 ${msg.ok ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}`}>
      {msg.text}
    </div>
  );
}

function useAdminAction(onAction?: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const act = async (label: string, fn: () => Promise<{ data?: unknown; error?: { message: string } }>, confirm?: string) => {
    if (busy) return;
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      if (res.error) setMsg({ text: `${label} failed: ${res.error.message}`, ok: false });
      else {
        setMsg({ text: `${label} succeeded`, ok: true });
        onAction?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return { busy, msg, setMsg, act };
}

// ── Player Tab ──────────────────────────────────────────────────────────────

function PlayerTab({ onAction }: { onAction?: () => void }) {
  const [turns, setTurns] = useState(10000);
  const [level, setLevel] = useState(10);
  const [xp, setXp] = useState(10000);
  const [attrPoints, setAttrPoints] = useState(10);
  const [attrs, setAttrs] = useState({ vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 });
  const { busy, msg, act } = useAdminAction(onAction);

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Turns</h3>
        <div className="flex items-center gap-2">
          <input type="number" value={turns} onChange={(e) => setTurns(Number(e.target.value))}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-32 text-[var(--rpg-text-primary)]" />
          <PixelButton size="sm" disabled={busy} onClick={() => act('Grant turns', () => adminGrantTurns(turns))}>Grant</PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Character Level</h3>
        <div className="flex items-center gap-2">
          <input type="number" value={level} onChange={(e) => setLevel(Number(e.target.value))} min={1} max={100}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-24 text-[var(--rpg-text-primary)]" />
          <PixelButton size="sm" disabled={busy} onClick={() => act('Set level', () => adminSetLevel(level), `Set character level to ${level}?`)}>
            Set Level
          </PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Character XP</h3>
        <div className="flex items-center gap-2">
          <input type="number" value={xp} onChange={(e) => setXp(Number(e.target.value))}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-32 text-[var(--rpg-text-primary)]" />
          <PixelButton size="sm" disabled={busy} onClick={() => act('Grant XP', () => adminGrantXp(xp))}>Grant XP</PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Attribute Points</h3>
        <div className="flex items-center gap-2">
          <input type="number" value={attrPoints} onChange={(e) => setAttrPoints(Number(e.target.value))} min={0}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-24 text-[var(--rpg-text-primary)]" />
          <PixelButton size="sm" disabled={busy} onClick={() => act('Set points', () => adminSetAttributes({ attributePoints: attrPoints }))}>
            Set Points
          </PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Set Attributes</h3>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(attrs) as Array<keyof typeof attrs>).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-xs text-[var(--rpg-text-secondary)] w-20 capitalize">{key}</label>
              <input type="number" value={attrs[key]} min={0}
                onChange={(e) => setAttrs((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-20 text-[var(--rpg-text-primary)]" />
            </div>
          ))}
        </div>
        <PixelButton size="sm" className="mt-3" disabled={busy}
          onClick={() => act('Set attributes', () => adminSetAttributes({ attributes: attrs }), 'Overwrite all attribute values?')}>
          Set Attributes
        </PixelButton>
      </PixelCard>

      <StatusMsg msg={msg} />
    </div>
  );
}

// ── Items Tab ───────────────────────────────────────────────────────────────

function ItemsTab({ onAction }: { onAction?: () => void }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [templates, setTemplates] = useState<AdminItemTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [rarity, setRarity] = useState('common');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const { busy, msg, act } = useAdminAction(onAction);

  const loadTemplates = async () => {
    setLoading(true);
    const res = await adminGetItemTemplates(search || undefined, typeFilter || undefined);
    if (res.data) setTemplates(res.data.templates);
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = templates.find((t) => t.id === selectedId);

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Search Items</h3>
        <div className="flex gap-2 mb-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name..."
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm text-[var(--rpg-text-primary)]">
            <option value="">All types</option>
            <option value="weapon">Weapon</option>
            <option value="armor">Armor</option>
            <option value="resource">Resource</option>
            <option value="consumable">Consumable</option>
          </select>
          <PixelButton size="sm" onClick={loadTemplates}>Search</PixelButton>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1">
          {loading && <div className="text-xs text-[var(--rpg-text-secondary)]">Loading...</div>}
          {templates.map((t) => (
            <div key={t.id} onClick={() => setSelectedId(t.id)}
              className={`px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                t.id === selectedId
                  ? 'bg-[var(--rpg-gold)]/20 border border-[var(--rpg-gold)]/40'
                  : 'bg-[var(--rpg-surface)] hover:bg-[var(--rpg-surface-hover)]'
              }`}>
              <span className="text-[var(--rpg-text-primary)]">{t.name}</span>
              <span className="text-xs text-[var(--rpg-text-secondary)] ml-2">
                {t.itemType} {t.slot ? `(${t.slot})` : ''} T{t.tier}
              </span>
            </div>
          ))}
        </div>
      </PixelCard>

      {selected && (
        <PixelCard>
          <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Grant: {selected.name}</h3>
          <div className="flex items-center gap-2">
            <select value={rarity} onChange={(e) => setRarity(e.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm text-[var(--rpg-text-primary)]">
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
            </select>
            <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} min={1} max={1000}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-20 text-[var(--rpg-text-primary)]" />
            <PixelButton size="sm" disabled={busy} onClick={() => act('Grant item', () => adminGrantItem(selectedId, rarity, quantity))}>
              Grant
            </PixelButton>
          </div>
        </PixelCard>
      )}

      <StatusMsg msg={msg} />
    </div>
  );
}

// ── World Tab ───────────────────────────────────────────────────────────────

function WorldTab({ onAction }: { onAction?: () => void }) {
  const [eventTemplates, setEventTemplates] = useState<AdminEventTemplate[]>([]);
  const [activeEvents, setActiveEvents] = useState<AdminActiveEvent[]>([]);
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [mobs, setMobs] = useState<AdminMobTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState(-1);
  const [eventZoneId, setEventZoneId] = useState('');
  const [duration, setDuration] = useState(2);
  const [bossZoneId, setBossZoneId] = useState('');
  const [bossMobId, setBossMobId] = useState('');
  const [targetOptions, setTargetOptions] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState('');
  const { busy, msg, setMsg, act } = useAdminAction(onAction);

  useEffect(() => {
    adminGetEventTemplates().then((r) => { if (r.data) setEventTemplates(r.data.templates); });
    adminGetActiveEvents().then((r) => { if (r.data) setActiveEvents(r.data.events); });
    adminGetZones().then((r) => {
      if (r.data) {
        setZones(r.data.zones);
        if (r.data.zones.length > 0) {
          setEventZoneId(r.data.zones[0].id);
          setBossZoneId(r.data.zones[0].id);
        }
      }
    });
    adminGetMobs().then((r) => {
      if (r.data) {
        setMobs(r.data.mobs);
        if (r.data.mobs.length > 0) setBossMobId(r.data.mobs[0].id);
      }
    });
  }, []);

  // Load target options when template or zone changes
  const template = selectedTemplate >= 0 ? eventTemplates.find((t) => t.id === selectedTemplate) : null;
  const needsTarget = template && !template.fixedTarget && (template.targeting === 'family' || template.targeting === 'resource');

  useEffect(() => {
    if (!needsTarget || !eventZoneId) {
      setTargetOptions([]);
      setSelectedTarget('');
      return;
    }
    if (template.targeting === 'family') {
      adminGetMobFamilies(eventZoneId).then((r) => {
        const names = r.data?.families.map((f) => f.name) ?? [];
        setTargetOptions(names);
        setSelectedTarget(names[0] ?? '');
      });
    } else {
      adminGetResourceNodes(eventZoneId).then((r) => {
        const types = [...new Set(r.data?.nodes.map((n) => n.resourceType) ?? [])];
        setTargetOptions(types);
        setSelectedTarget(types[0] ?? '');
      });
    }
  }, [needsTarget, template?.targeting, eventZoneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshEvents = () => {
    adminGetActiveEvents().then((r) => { if (r.data) setActiveEvents(r.data.events); });
  };

  const handleSpawnEvent = async () => {
    if (busy || selectedTemplate < 0 || !eventZoneId) return;
    if (needsTarget && !selectedTarget) return;
    await act('Spawn event', () => adminSpawnEvent(selectedTemplate, eventZoneId, duration, needsTarget ? selectedTarget : undefined));
    refreshEvents();
  };

  const handleCancel = async (id: string, title: string) => {
    if (busy) return;
    if (!window.confirm(`Cancel event "${title}"?`)) return;
    const res = await adminCancelEvent(id);
    if (res.error) setMsg({ text: `Cancel failed: ${res.error.message}`, ok: false });
    else {
      setMsg({ text: 'Event cancelled', ok: true });
      setActiveEvents((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const handleSpawnBoss = async () => {
    if (busy || !bossMobId || !bossZoneId) return;
    const mob = mobs.find((m) => m.id === bossMobId);
    await act('Spawn boss', () => adminSpawnBoss(bossMobId, bossZoneId), `Spawn ${mob?.name ?? 'boss'} in selected zone?`);
    refreshEvents();
  };

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Spawn World Event</h3>
        <div className="space-y-2">
          <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(Number(e.target.value))}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-full text-[var(--rpg-text-primary)]">
            <option value={-1}>Select event template...</option>
            {eventTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.title} ({t.effectType}: {t.effectValue > 0 ? '+' : ''}{t.effectValue})</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select value={eventZoneId} onChange={(e) => setEventZoneId(e.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]">
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name} (Lv.{z.difficulty})</option>)}
            </select>
            <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} min={0.1} max={168} step={0.5}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-20 text-[var(--rpg-text-primary)]"
              title="Duration (hours)" />
          </div>
          {needsTarget && (
            <div className="flex gap-2">
              <select value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)}
                className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]">
                {targetOptions.length === 0 && <option value="">No {template.targeting === 'family' ? 'mob families' : 'resources'} in zone</option>}
                {targetOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="text-xs text-[var(--rpg-text-secondary)] self-center whitespace-nowrap">
                Target ({template.targeting})
              </span>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <PixelButton size="sm" disabled={busy || (!!needsTarget && !selectedTarget)} onClick={handleSpawnEvent}>Spawn</PixelButton>
          </div>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Active Events ({activeEvents.length})</h3>
        {activeEvents.length === 0 && <div className="text-xs text-[var(--rpg-text-secondary)]">No active events</div>}
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {activeEvents.map((e) => (
            <div key={e.id} className="flex items-center justify-between bg-[var(--rpg-surface)] rounded px-2 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="text-[var(--rpg-text-primary)] truncate">{e.title}</div>
                <div className="text-xs text-[var(--rpg-text-secondary)]">{e.zoneName} | {e.effectType}</div>
              </div>
              <PixelButton size="sm" variant="danger" disabled={busy} onClick={() => handleCancel(e.id, e.title)}>Cancel</PixelButton>
            </div>
          ))}
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Spawn World Boss</h3>
        <div className="flex gap-2">
          <select value={bossMobId} onChange={(e) => setBossMobId(e.target.value)}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]">
            {mobs.map((m) => <option key={m.id} value={m.id}>{m.name} (Lv.{m.level})</option>)}
          </select>
          <select value={bossZoneId} onChange={(e) => setBossZoneId(e.target.value)}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]">
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <PixelButton size="sm" disabled={busy} onClick={handleSpawnBoss}>Spawn</PixelButton>
        </div>
      </PixelCard>

      <StatusMsg msg={msg} />
    </div>
  );
}

// ── Zones Tab ───────────────────────────────────────────────────────────────

function ZonesTab({ onAction }: { onAction?: () => void }) {
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [families, setFamilies] = useState<AdminMobFamily[]>([]);
  const [encZoneId, setEncZoneId] = useState('');
  const [encFamilyId, setEncFamilyId] = useState('');
  const [encSize, setEncSize] = useState<'small' | 'medium' | 'large'>('medium');
  const { busy, msg, act } = useAdminAction(onAction);

  useEffect(() => {
    adminGetZones().then((r) => {
      if (r.data) {
        setZones(r.data.zones);
        if (r.data.zones.length > 0) setEncZoneId(r.data.zones[0].id);
      }
    });
    adminGetMobFamilies().then((r) => {
      if (r.data) {
        setFamilies(r.data.families);
        if (r.data.families.length > 0) setEncFamilyId(r.data.families[0].id);
      }
    });
  }, []);

  return (
    <div className="space-y-4">
      <PixelCard>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--rpg-gold)]">Zones</h3>
          <PixelButton size="sm" variant="gold" disabled={busy}
            onClick={() => act('Discover all', () => adminDiscoverAllZones(), 'Discover all zones on your account?')}>
            Discover All
          </PixelButton>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center justify-between bg-[var(--rpg-surface)] rounded px-2 py-1.5 text-sm">
              <div>
                <span className="text-[var(--rpg-text-primary)]">{z.name}</span>
                <span className="text-xs text-[var(--rpg-text-secondary)] ml-2">
                  Lv.{z.difficulty} | {z.zoneType}
                </span>
              </div>
              <PixelButton size="sm" disabled={busy}
                onClick={() => act('Teleport', () => adminTeleport(z.id), `Teleport to ${z.name}?`)}>
                Teleport
              </PixelButton>
            </div>
          ))}
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Spawn Encounter Site</h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <select value={encFamilyId} onChange={(e) => setEncFamilyId(e.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]">
              {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select value={encZoneId} onChange={(e) => setEncZoneId(e.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]">
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <select value={encSize} onChange={(e) => setEncSize(e.target.value as 'small' | 'medium' | 'large')}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm text-[var(--rpg-text-primary)]">
              <option value="small">Small (2-3)</option>
              <option value="medium">Medium (4-6)</option>
              <option value="large">Large (7-10)</option>
            </select>
            <PixelButton size="sm" disabled={busy} onClick={() => act('Spawn encounter', () => adminSpawnEncounter(encFamilyId, encZoneId, encSize))}>
              Spawn Encounter
            </PixelButton>
          </div>
        </div>
      </PixelCard>

      <StatusMsg msg={msg} />
    </div>
  );
}

// ── Resources Tab ────────────────────────────────────────────────────────────

function ResourcesTab({ onAction }: { onAction?: () => void }) {
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [nodes, setNodes] = useState<AdminResourceNode[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [capacity, setCapacity] = useState('');
  const { busy, msg, act } = useAdminAction(onAction);

  useEffect(() => {
    adminGetZones().then((r) => {
      if (r.data) {
        setZones(r.data.zones);
        if (r.data.zones.length > 0) setZoneId(r.data.zones[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!zoneId) return;
    adminGetResourceNodes(zoneId).then((r) => {
      if (r.data) {
        setNodes(r.data.nodes);
        setSelectedNodeId('');
      }
    });
  }, [zoneId]);

  const selected = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Spawn Resource Node</h3>
        <div className="space-y-2">
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-full text-[var(--rpg-text-primary)]">
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name} (Lv.{z.difficulty})</option>)}
          </select>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {nodes.length === 0 && <div className="text-xs text-[var(--rpg-text-secondary)]">No resource nodes in this zone</div>}
            {nodes.map((n) => (
              <div key={n.id} onClick={() => setSelectedNodeId(n.id)}
                className={`px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                  n.id === selectedNodeId
                    ? 'bg-[var(--rpg-gold)]/20 border border-[var(--rpg-gold)]/40'
                    : 'bg-[var(--rpg-surface)] hover:bg-[var(--rpg-surface-hover)]'
                }`}>
                <span className="text-[var(--rpg-text-primary)]">{n.resourceType}</span>
                <span className="text-xs text-[var(--rpg-text-secondary)] ml-2">
                  {n.skillRequired} Lv.{n.levelRequired} | Cap: {n.minCapacity}-{n.maxCapacity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </PixelCard>

      {selected && (
        <PixelCard>
          <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Spawn: {selected.resourceType}</h3>
          <div className="flex items-center gap-2">
            <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)}
              placeholder={`Random (${selected.minCapacity}-${selected.maxCapacity})`} min={1} max={10000}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-48 text-[var(--rpg-text-primary)]" />
            <PixelButton size="sm" disabled={busy}
              onClick={() => act('Spawn node', () => adminSpawnResourceNode(selectedNodeId, capacity ? Number(capacity) : undefined))}>
              Spawn
            </PixelButton>
          </div>
          <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">Leave capacity blank for random</div>
        </PixelCard>
      )}

      <StatusMsg msg={msg} />
    </div>
  );
}

// ── Main Admin Screen ───────────────────────────────────────────────────────

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'player', label: 'Player' },
  { id: 'items', label: 'Items' },
  { id: 'world', label: 'World' },
  { id: 'zones', label: 'Zones' },
  { id: 'resources', label: 'Resources' },
];

export default function AdminScreen({ onAction }: { onAction?: () => void }) {
  const [tab, setTab] = useState<AdminTab>('player');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-[var(--rpg-gold)]" />
        <h2 className="text-lg font-bold text-[var(--rpg-gold)]">Admin Panel</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)] border border-[var(--rpg-gold)]/40'
                : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'player' && <PlayerTab onAction={onAction} />}
      {tab === 'items' && <ItemsTab onAction={onAction} />}
      {tab === 'world' && <WorldTab onAction={onAction} />}
      {tab === 'zones' && <ZonesTab onAction={onAction} />}
      {tab === 'resources' && <ResourcesTab onAction={onAction} />}
    </div>
  );
}
