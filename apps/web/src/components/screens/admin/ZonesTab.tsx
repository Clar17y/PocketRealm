import { useEffect, useState } from 'react';
import type { StateUpdates } from '@pocketrealm/shared';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  adminGetZones,
  adminGetMobFamilies,
  adminDiscoverAllZones,
  adminTeleport,
  adminSpawnEncounter,
  type AdminZone,
  type AdminMobFamily,
} from '@/lib/api';
import { StatusMsg } from './StatusMsg';
import { useAdminAction } from './useAdminAction';

export function ZonesTab({
  onStateUpdates,
  reloadZones,
}: {
  onStateUpdates: (updates: StateUpdates) => void;
  reloadZones: () => Promise<void>;
}) {
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [families, setFamilies] = useState<AdminMobFamily[]>([]);
  const [encZoneId, setEncZoneId] = useState('');
  const [encFamilyId, setEncFamilyId] = useState('');
  const [encSize, setEncSize] = useState<'small' | 'medium' | 'large'>('medium');
  const { busy, msg, act } = useAdminAction();

  useEffect(() => {
    adminGetZones().then((res) => {
      if (res.data) {
        setZones(res.data.zones);
        if (res.data.zones.length > 0) setEncZoneId(res.data.zones[0].id);
      }
    });
    adminGetMobFamilies().then((res) => {
      if (res.data) {
        setFamilies(res.data.families);
        if (res.data.families.length > 0) setEncFamilyId(res.data.families[0].id);
      }
    });
  }, []);

  return (
    <div className="space-y-4">
      <PixelCard>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--rpg-gold)]">Zones</h3>
          <PixelButton
            size="sm"
            variant="gold"
            disabled={busy}
            onClick={async () => {
              const ok = await act(
                'Discover all',
                () => adminDiscoverAllZones(),
                'Discover all zones on your account?',
              );
              if (ok) void reloadZones();
            }}
          >
            Discover All
          </PixelButton>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {zones.map((zone) => (
            <div key={zone.id} className="flex items-center justify-between bg-[var(--rpg-surface)] rounded px-2 py-1.5 text-sm">
              <div>
                <span className="text-[var(--rpg-text-primary)] font-almendra">{zone.name}</span>
                <span className="text-xs text-[var(--rpg-text-secondary)] ml-2">
                  Lv.<span className="font-pixel text-[8px]">{zone.difficulty}</span> | {zone.zoneType}
                </span>
              </div>
              <PixelButton
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const data = await act('Teleport', () => adminTeleport(zone.id), `Teleport to ${zone.name}?`);
                  if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
                }}
              >
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
            <select
              value={encFamilyId}
              onChange={(e) => setEncFamilyId(e.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]"
            >
              {families.map((family) => (
                <option key={family.id} value={family.id}>{family.name}</option>
              ))}
            </select>
            <select
              value={encZoneId}
              onChange={(e) => setEncZoneId(e.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]"
            >
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              value={encSize}
              onChange={(e) => setEncSize(e.target.value as 'small' | 'medium' | 'large')}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm text-[var(--rpg-text-primary)]"
            >
              <option value="small">Small (2-3)</option>
              <option value="medium">Medium (4-6)</option>
              <option value="large">Large (7-10)</option>
            </select>
            <PixelButton
              size="sm"
              disabled={busy}
              onClick={() => act('Spawn encounter', () => adminSpawnEncounter(encFamilyId, encZoneId, encSize))}
            >
              Spawn Encounter
            </PixelButton>
          </div>
        </div>
      </PixelCard>

      <StatusMsg msg={msg} />
    </div>
  );
}
