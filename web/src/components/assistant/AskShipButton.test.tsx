import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { AskShipButton } from './AskShipButton';

describe('AskShipButton', () => {
  it('renders an accessible rail button and handles clicks', () => {
    const handleClick = vi.fn();

    render(
      <TooltipProvider>
        <AskShipButton active={false} onClick={handleClick} />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: 'Ask Ship' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('reflects active state for assistive technology', () => {
    render(
      <TooltipProvider>
        <AskShipButton active onClick={() => {}} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Ask Ship' })).toHaveAttribute('aria-pressed', 'true');
  });
});
