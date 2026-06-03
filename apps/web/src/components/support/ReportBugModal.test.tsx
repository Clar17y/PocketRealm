import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportBugModal } from './ReportBugModal';

describe('ReportBugModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('submits a support ticket with current screen context', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ publicId: 'SUP-1' });

    render(<ReportBugModal open currentScreen="forge" onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: 'account' },
    });
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'Forge result did not update' },
    });
    fireEvent.change(screen.getByLabelText(/what happened/i), {
      target: { value: 'The result modal showed, but inventory stayed stale.' },
    });
    fireEvent.change(screen.getByLabelText(/steps/i), {
      target: { value: 'Open forge, upgrade an item, close result.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Forge result did not update',
          description: 'The result modal showed, but inventory stayed stale.',
          reproductionSteps: 'Open forge, upgrade an item, close result.',
          privacy: 'not_sure',
          category: 'account',
          area: 'other',
          screen: 'forge',
          browser: expect.any(String),
        }),
      ),
    );
    expect(await screen.findByText(/report sup-1 created/i)).toBeTruthy();
  });

  it('clears report details after a successful submit to prevent duplicate resubmission', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ publicId: 'SUP-1' });

    render(<ReportBugModal open currentScreen="forge" onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'Forge result did not update' },
    });
    fireEvent.change(screen.getByLabelText(/what happened/i), {
      target: { value: 'The result modal showed, but inventory stayed stale.' },
    });
    fireEvent.change(screen.getByLabelText(/steps/i), {
      target: { value: 'Open forge, upgrade an item, close result.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect(await screen.findByText(/report sup-1 created/i)).toBeTruthy();
    expect(screen.getByLabelText(/title/i)).toHaveProperty('value', '');
    expect(screen.getByLabelText(/what happened/i)).toHaveProperty('value', '');
    expect(screen.getByLabelText(/steps/i)).toHaveProperty('value', '');

    const submit = screen.getByRole('button', { name: /send report/i });
    expect(submit).toHaveProperty('disabled', true);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('disables submit until the required title and description are usable', () => {
    render(<ReportBugModal open currentScreen="inventory" onClose={vi.fn()} onSubmit={vi.fn()} />);

    const submit = screen.getByRole('button', { name: /send report/i });
    expect(submit).toHaveProperty('disabled', true);
    expect(screen.getByText('Title needs at least 5 characters.')).toBeTruthy();
    expect(screen.getByText('Description needs at least 10 characters.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'Bag bug' },
    });
    fireEvent.change(screen.getByLabelText(/what happened/i), {
      target: { value: 'Items disappeared after sorting.' },
    });

    expect(submit).toHaveProperty('disabled', false);
    expect(screen.queryByText('Title needs at least 5 characters.')).toBeNull();
    expect(screen.queryByText('Description needs at least 10 characters.')).toBeNull();
  });

  it('shows an error when submission fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Support is unavailable'));

    render(<ReportBugModal open currentScreen="combat" onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'Combat action failed' },
    });
    fireEvent.change(screen.getByLabelText(/what happened/i), {
      target: { value: 'The attack button did not resolve the turn.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect((await screen.findByRole('alert')).textContent).toBe('Support is unavailable');
  });

  it('calls onClose from the close button', () => {
    const onClose = vi.fn();

    render(<ReportBugModal open currentScreen="settings" onClose={onClose} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
