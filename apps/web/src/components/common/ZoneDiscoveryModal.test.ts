import React from 'react';
import { fireEvent, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZoneDiscoveryModal } from './ZoneDiscoveryModal';

afterEach(() => {
  cleanup();
});

describe('ZoneDiscoveryModal', () => {
  it('renders the discovery copy, zone name, and continue button', () => {
    const onDismiss = vi.fn();

    render(
      React.createElement(ZoneDiscoveryModal, {
        zoneName: 'Ancient Grove',
        imageSrc: '/assets/zones/zone_ancient_grove.webp',
        onDismiss,
      }),
    );

    expect(screen.getByText('New Zone Discovered')).toBeTruthy();
    expect(screen.getByText('Ancient Grove')).toBeTruthy();
    expect(screen.getByText('This zone is now available for travel.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Ancient Grove' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders cleanly without an image source', () => {
    render(
      React.createElement(ZoneDiscoveryModal, {
        zoneName: 'Ancient Grove',
        onDismiss: vi.fn(),
      }),
    );

    expect(screen.getByText('Ancient Grove')).toBeTruthy();
    expect(screen.getByText('This zone is now available for travel.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Ancient Grove' })).toBeNull();
  });

  it('hides a broken image and keeps the text content visible', () => {
    render(
      React.createElement(ZoneDiscoveryModal, {
        zoneName: 'Ancient Grove',
        imageSrc: '/assets/zones/zone_ancient_grove.webp',
        onDismiss: vi.fn(),
      }),
    );

    fireEvent.error(screen.getByRole('img', { name: 'Ancient Grove' }));

    expect(screen.queryByRole('img', { name: 'Ancient Grove' })).toBeNull();
    expect(screen.getByText('Ancient Grove')).toBeTruthy();
    expect(screen.getByText('This zone is now available for travel.')).toBeTruthy();
  });
});
