import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConstantsTable } from './ConstantsTable';

describe('ConstantsTable', () => {
  it('limits numeric constant values to two decimal places', () => {
    render(
      <ConstantsTable
        rows={[
          { name: 'PASSIVE_REGEN_PER_MAGIC_LEVEL', value: 0.015, description: 'Mana regen per level' },
        ]}
      />,
    );

    expect(screen.getByText('0.02')).toBeTruthy();
    expect(screen.queryByText('0.015')).toBeNull();
  });
});
