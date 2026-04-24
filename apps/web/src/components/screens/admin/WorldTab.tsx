import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  adminGetEventTemplates,
  adminGetActiveEvents,
  adminGetZones,
  adminGetMobs,
  adminGetMobFamilies,
  adminGetResourceNodes,
  adminSpawnEvent,
  adminCancelEvent,
  adminSpawnBoss,
  type AdminZone,
  type AdminMobTemplate,
  type AdminEventTemplate,
  type AdminActiveEvent,
} from '@/lib/api';
import { StatusMsg } from './StatusMsg';
import { useAdminAction } from './useAdminAction';

export function WorldTab() {
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
  const { busy, msg, setMsg, act } = useAdminAction();

  useEffect(() => {
    adminGetEventTemplates().then((res) => {
      if (res.data) setEventTemplates(res.data.templates);
    });
    adminGetActiveEvents().then((res) => {
      if (res.data) setActiveEvents(res.data.events);
    });
    adminGetZones().then((res) => {
      if (res.data) {
        setZones(res.data.zones);
        if (res.data.zones.length > 0) {
          setEventZoneId(res.data.zones[0].id);
          setBossZoneId(res.data.zones[0].id);
        }
      }
    });
    adminGetMobs().then((res) => {
      if (res.data) {
        const bossMobs = res.data.mobs.filter((mob) => mob.bossBaseHp !== null);
        setMobs(bossMobs);
        if (bossMobs.length > 0) setBossMobId(bossMobs[0].id);
      }
    });
  }, []);

  const template = selectedTemplate >= 0
    ? eventTemplates.find((eventTemplate) => eventTemplate.id === selectedTemplate) ?? null
    : null;
  const needsTarget = Boolean(
    template
    && !template.fixedTarget
    && (template.targeting === 'family' || template.targeting === 'resource'),
  );

  useEffect(() => {
    if (!template || !needsTarget || !eventZoneId) {
      setTargetOptions([]);
      setSelectedTarget('');
      return;
    }

    if (template.targeting === 'family') {
      adminGetMobFamilies(eventZoneId).then((res) => {
        const names = res.data?.families.map((family) => family.name) ?? [];
        setTargetOptions(names);
        setSelectedTarget(names[0] ?? '');
      });
      return;
    }

    adminGetResourceNodes(eventZoneId).then((res) => {
      const types = [...new Set(res.data?.nodes.map((node) => node.resourceType) ?? [])];
      setTargetOptions(types);
      setSelectedTarget(types[0] ?? '');
    });
  }, [eventZoneId, needsTarget, template]);

  const refreshEvents = () => {
    adminGetActiveEvents().then((res) => {
      if (res.data) setActiveEvents(res.data.events);
    });
  };

  const handleSpawnEvent = async () => {
    if (busy || selectedTemplate < 0 || !eventZoneId) return;
    if (needsTarget && !selectedTarget) return;

    await act(
      'Spawn event',
      () => adminSpawnEvent(selectedTemplate, eventZoneId, duration, needsTarget ? selectedTarget : undefined),
    );
    refreshEvents();
  };

  const handleCancel = async (id: string, title: string) => {
    if (busy) return;
    if (!window.confirm(`Cancel event "${title}"?`)) return;

    const res = await adminCancelEvent(id);
    if (res.error) {
      setMsg({ text: `Cancel failed: ${res.error.message}`, ok: false });
      return;
    }

    setMsg({ text: 'Event cancelled', ok: true });
    setActiveEvents((prev) => prev.filter((event) => event.id !== id));
  };

  const handleSpawnBoss = async () => {
    if (busy || !bossMobId || !bossZoneId) return;
    const mob = mobs.find((entry) => entry.id === bossMobId);
    await act(
      'Spawn boss',
      () => adminSpawnBoss(bossMobId, bossZoneId),
      `Spawn ${mob?.name ?? 'boss'} in selected zone?`,
    );
    refreshEvents();
  };

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Spawn World Event</h3>
        <div className="space-y-2">
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(Number(e.target.value))}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-full text-[var(--rpg-text-primary)]"
          >
            <option value={-1}>Select event template...</option>
            {eventTemplates.map((eventTemplate) => (
              <option key={eventTemplate.id} value={eventTemplate.id}>
                {eventTemplate.title} ({eventTemplate.effectType}: {eventTemplate.effectValue > 0 ? '+' : ''}{eventTemplate.effectValue})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={eventZoneId}
              onChange={(e) => setEventZoneId(e.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]"
            >
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} (Lv.{zone.difficulty})
                </option>
              ))}
            </select>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min={0.1}
              max={168}
              step={0.5}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-20 text-[var(--rpg-text-primary)]"
              title="Duration (hours)"
            />
          </div>
          {needsTarget && template && (
            <div className="flex gap-2">
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]"
              >
                {targetOptions.length === 0 && (
                  <option value="">No {template.targeting === 'family' ? 'mob families' : 'resources'} in zone</option>
                )}
                {targetOptions.map((target) => (
                  <option key={target} value={target}>{target}</option>
                ))}
              </select>
              <span className="text-xs text-[var(--rpg-text-secondary)] self-center whitespace-nowrap">
                Target ({template.targeting})
              </span>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <PixelButton
              size="sm"
              disabled={busy || (needsTarget && !selectedTarget)}
              onClick={handleSpawnEvent}
            >
              Spawn
            </PixelButton>
          </div>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Active Events ({activeEvents.length})</h3>
        {activeEvents.length === 0 && <div className="text-xs text-[var(--rpg-text-secondary)]">No active events</div>}
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {activeEvents.map((event) => (
            <div key={event.id} className="flex items-center justify-between bg-[var(--rpg-surface)] rounded px-2 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="text-[var(--rpg-text-primary)] truncate">{event.title}</div>
                <div className="text-xs text-[var(--rpg-text-secondary)]">{event.zoneName} | {event.effectType}</div>
              </div>
              <PixelButton size="sm" variant="danger" disabled={busy} onClick={() => handleCancel(event.id, event.title)}>
                Cancel
              </PixelButton>
            </div>
          ))}
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Spawn World Boss</h3>
        <div className="flex gap-2">
          <select
            value={bossMobId}
            onChange={(e) => setBossMobId(e.target.value)}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]"
          >
            {mobs.map((mob) => (
              <option key={mob.id} value={mob.id}>
                {mob.name} (Lv.{mob.level})
              </option>
            ))}
          </select>
          <select
            value={bossZoneId}
            onChange={(e) => setBossZoneId(e.target.value)}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]"
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </select>
          <PixelButton size="sm" disabled={busy} onClick={handleSpawnBoss}>Spawn</PixelButton>
        </div>
      </PixelCard>

      <StatusMsg msg={msg} />
    </div>
  );
}
