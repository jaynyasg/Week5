import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FleetGraphComposer } from './FleetGraphComposer';

describe('FleetGraphComposer', () => {
  it('sends the message when Enter is pressed', () => {
    const onSend = vi.fn();
    render(<FleetGraphComposer disabled={false} onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /fleetgraph message/i });

    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith('hello', undefined);
  });

  it('passes findingId through when Enter is pressed', () => {
    const onSend = vi.fn();
    render(<FleetGraphComposer disabled={false} findingId="finding-123" onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /fleetgraph message/i });

    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('hello', 'finding-123');
  });

  it('does not send when Shift+Enter is pressed', () => {
    const onSend = vi.fn();
    render(<FleetGraphComposer disabled={false} onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /fleetgraph message/i });

    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send on Enter when the textarea is empty', () => {
    const onSend = vi.fn();
    render(<FleetGraphComposer disabled={false} onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /fleetgraph message/i });

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send on Enter when disabled', () => {
    const onSend = vi.fn();
    render(<FleetGraphComposer disabled={true} onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /fleetgraph message/i });

    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('clears the textarea after sending via Enter', () => {
    const onSend = vi.fn();
    render(<FleetGraphComposer disabled={false} onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /fleetgraph message/i });

    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect((textarea as HTMLTextAreaElement).value).toBe('');
  });
});
