import { useEffect, useState } from 'react';
import type { StateUpdates } from '@pocketrealm/shared';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  adminGetItemTemplates,
  adminGrantItem,
  type AdminItemTemplate,
} from '@/lib/api';
import { handleKeyActivate } from '@/lib/utils';
import { StatusMsg } from './StatusMsg';
import { useAdminAction } from './useAdminAction';

export function ItemsTab({ onStateUpdates }: { onStateUpdates: (updates: StateUpdates) => void }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [templates, setTemplates] = useState<AdminItemTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [rarity, setRarity] = useState('common');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const { busy, msg, act } = useAdminAction();

  const loadTemplates = async () => {
    setLoading(true);
    const res = await adminGetItemTemplates(search || undefined, typeFilter || undefined);
    if (res.data) setTemplates(res.data.templates);
    setLoading(false);
  };

  useEffect(() => {
    void loadTemplates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = templates.find((template) => template.id === selectedId);

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Search Items</h3>
        <div className="flex gap-2 mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name..."
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm flex-1 text-[var(--rpg-text-primary)]"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm text-[var(--rpg-text-primary)]"
          >
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
          {templates.map((template) => (
            <div
              key={template.id}
              onClick={() => setSelectedId(template.id)}
              role="button"
              tabIndex={0}
              onKeyDown={handleKeyActivate(() => setSelectedId(template.id))}
              className={`px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                template.id === selectedId
                  ? 'bg-[var(--rpg-gold)]/20 border border-[var(--rpg-gold)]/40'
                  : 'bg-[var(--rpg-surface)] hover:bg-[var(--rpg-surface-hover)]'
              }`}
            >
              <span className="text-[var(--rpg-text-primary)] font-almendra">{template.name}</span>
              <span className="text-xs text-[var(--rpg-text-secondary)] ml-2">
                {template.itemType} {template.slot ? `(${template.slot})` : ''} T<span className="font-pixel text-[8px]">{template.tier}</span>
              </span>
            </div>
          ))}
        </div>
      </PixelCard>

      {selected && (
        <PixelCard>
          <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Grant: {selected.name}</h3>
          <div className="flex items-center gap-2">
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm text-[var(--rpg-text-primary)]"
            >
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
            </select>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              min={1}
              max={1000}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-20 text-[var(--rpg-text-primary)]"
            />
            <PixelButton
              size="sm"
              disabled={busy}
              onClick={async () => {
                const data = await act('Grant item', () => adminGrantItem(selectedId, rarity, quantity));
                if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
              }}
            >
              Grant
            </PixelButton>
          </div>
        </PixelCard>
      )}

      <StatusMsg msg={msg} />
    </div>
  );
}
