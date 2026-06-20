// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DockedActionBar } from './DockedActionBar';

afterEach(() => cleanup());

describe('DockedActionBar', () => {
  it('portals its children onto document.body, not the React root container', () => {
    const { container } = render(
      <DockedActionBar>
        <button>Craft</button>
      </DockedActionBar>,
    );

    // Portaled out of the local render container...
    expect(container.querySelector('button')).toBeNull();
    // ...but present in the document, attached under <body>.
    const btn = screen.getByRole('button', { name: 'Craft' });
    expect(document.body.contains(btn)).toBe(true);
  });

  it('positions the fixed wrapper just above the bottom nav', () => {
    render(
      <DockedActionBar>
        <span>Content</span>
      </DockedActionBar>,
    );

    const fixedWrapper = screen.getByText('Content').closest('div.fixed') as HTMLElement | null;
    expect(fixedWrapper).not.toBeNull();
    expect(fixedWrapper!.style.bottom).toBe('var(--rpg-bottom-nav-offset)');
    expect(fixedWrapper!.className).toContain('z-30');
  });

  it('applies a custom className to the inner wrapper', () => {
    render(
      <DockedActionBar className="custom-pad">
        <span>Inner</span>
      </DockedActionBar>,
    );

    const inner = screen.getByText('Inner').parentElement as HTMLElement;
    expect(inner.className).toContain('custom-pad');
    expect(inner.className).toContain('max-w-lg');
  });
});
