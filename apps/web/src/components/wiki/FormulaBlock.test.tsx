import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormulaBlock } from './FormulaBlock';

describe('FormulaBlock', () => {
  it('limits numeric constants to two decimal places', () => {
    render(
      <FormulaBlock>
        <FormulaBlock.Const>{0.015}</FormulaBlock.Const>
      </FormulaBlock>,
    );

    expect(screen.getByText('0.02')).toBeTruthy();
    expect(screen.queryByText('0.015')).toBeNull();
  });
});
