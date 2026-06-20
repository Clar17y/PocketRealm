// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScreenContainer } from './ScreenContainer';

afterEach(() => cleanup());

describe('ScreenContainer', () => {
  it('reserves bottom padding when bottomInset is set', () => {
    render(
      <ScreenContainer bottomInset>
        <span>Body</span>
      </ScreenContainer>,
    );
    const root = screen.getByText('Body').parentElement as HTMLElement;
    expect(root.className).toContain('pb-[7.5rem]');
  });

  it('omits bottom padding by default', () => {
    render(
      <ScreenContainer>
        <span>Body</span>
      </ScreenContainer>,
    );
    const root = screen.getByText('Body').parentElement as HTMLElement;
    expect(root.className).not.toContain('pb-[7.5rem]');
  });
});
