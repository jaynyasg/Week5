import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from './Toast';

describe('ToastProvider', () => {
  it('keeps mobile toast notifications above the pinned assistant composer area', () => {
    render(
      <ToastProvider>
        <ToastLauncher />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));

    const toast = screen.getByRole('alert');
    expect(toast).toHaveTextContent('FleetGraph finding');
    expect(toast.parentElement).toHaveClass('bottom-36');
    expect(toast.parentElement).toHaveClass('sm:bottom-20');
  });
});

function ToastLauncher() {
  const { showToast } = useToast();

  return (
    <button type="button" onClick={() => showToast('FleetGraph finding', 'info', 3000)}>
      Show toast
    </button>
  );
}
