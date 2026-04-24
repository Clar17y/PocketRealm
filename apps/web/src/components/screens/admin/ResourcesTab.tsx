import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  adminGetZones,
  adminGetResourceNodes,
  adminSpawnResourceNode,
  type AdminZone,
  type AdminResourceNode,
} from '@/lib/api';
import { handleKeyActivate } from '@/lib/utils';
import { StatusMsg } from './StatusMsg';
import { useAdminAction } from './useAdminAction';

export function ResourcesTab() {
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [nodes, setNodes] = useState<AdminResourceNode[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [capacity, setCapacity] = useState('');
  const { busy, msg, act } = useAdminAction();

  useEffect(() => {
    adminGetZones().then((res) => {
      if (res.data) {
        setZones(res.data.zones);
        if (res.data.zones.length > 0) setZoneId(res.data.zones[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!zoneId) return;
    adminGetResourceNodes(zoneId).then((res) => {
      if (res.data) {
        setNodes(res.data.nodes);
        setSelectedNodeId('');
      }
    });
  }, [zoneId]);

  const selected = nodes.find((node) => node.id === selectedNodeId);

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Spawn Resource Node</h3>
        <div className="space-y-2">
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-full text-[var(--rpg-text-primary)]"
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name} (Lv.{zone.difficulty})
              </option>
            ))}
          </select>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {nodes.length === 0 && <div className="text-xs text-[var(--rpg-text-secondary)]">No resource nodes in this zone</div>}
            {nodes.map((node) => (
              <div
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                role="button"
                tabIndex={0}
                onKeyDown={handleKeyActivate(() => setSelectedNodeId(node.id))}
                className={`px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                  node.id === selectedNodeId
                    ? 'bg-[var(--rpg-gold)]/20 border border-[var(--rpg-gold)]/40'
                    : 'bg-[var(--rpg-surface)] hover:bg-[var(--rpg-surface-hover)]'
                }`}
              >
                <span className="text-[var(--rpg-text-primary)]">{node.resourceType}</span>
                <span className="text-xs text-[var(--rpg-text-secondary)] ml-2">
                  {node.skillRequired} Lv.{node.levelRequired} | Cap: {node.minCapacity}-{node.maxCapacity}
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
            <input
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={`Random (${selected.minCapacity}-${selected.maxCapacity})`}
              min={1}
              max={10000}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-48 text-[var(--rpg-text-primary)]"
            />
            <PixelButton
              size="sm"
              disabled={busy}
              onClick={() => act(
                'Spawn node',
                () => adminSpawnResourceNode(selectedNodeId, capacity ? Number(capacity) : undefined),
              )}
            >
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
