import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpSupportCard } from './HelpSupportCard';

afterEach(() => {
  cleanup();
});

describe('HelpSupportCard', () => {
  it('renders support links and opens the report bug action', () => {
    const onReportBug = vi.fn();

    render(
      <HelpSupportCard
        discordUrl="https://discord.gg/pocketrealm"
        knownIssuesUrl="https://status.pocketrealm.example/issues"
        onReportBug={onReportBug}
      />,
    );

    expect(screen.getByRole('link', { name: /wiki/i }).getAttribute('href')).toBe('/wiki');
    expect(screen.getByRole('link', { name: /discord/i }).getAttribute('href')).toBe('https://discord.gg/pocketrealm');
    expect(screen.getByRole('link', { name: /known issues/i }).getAttribute('href')).toBe('https://status.pocketrealm.example/issues');

    fireEvent.click(screen.getByRole('button', { name: /report bug/i }));

    expect(onReportBug).toHaveBeenCalledOnce();
  });
});
