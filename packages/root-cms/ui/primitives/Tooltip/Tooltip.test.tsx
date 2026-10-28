import {act, cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Tooltip} from './Tooltip.js';

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows after a delay on hover and hides on leave and Escape', () => {
    render(
      <Tooltip label="Opens the preview">
        <button type="button">Preview</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', {name: 'Preview'});
    const tooltip = screen.getByRole('tooltip', {hidden: true});
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(tooltip.parentElement!.hidden).toBe(true);

    fireEvent.pointerEnter(trigger.parentElement!);
    expect(tooltip.parentElement!.hidden).toBe(true);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(tooltip.parentElement!.hidden).toBe(false);

    fireEvent.pointerLeave(trigger.parentElement!);
    expect(tooltip.parentElement!.hidden).toBe(true);

    fireEvent.pointerEnter(trigger.parentElement!);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.keyDown(trigger, {key: 'Escape'});
    expect(tooltip.parentElement!.hidden).toBe(true);
  });

  it('never shows on touch, and renders only the trigger when disabled', () => {
    const {rerender} = render(
      <Tooltip label="Opens the preview">
        <button type="button">Preview</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole('button').parentElement!;
    fireEvent.pointerEnter(wrapper, {pointerType: 'touch'});
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole('tooltip', {hidden: true}).parentElement!.hidden
    ).toBe(true);

    rerender(
      <Tooltip label="Opens the preview" disabled>
        <button type="button">Preview</button>
      </Tooltip>
    );
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    expect(screen.getByRole('button').hasAttribute('aria-describedby')).toBe(
      false
    );
  });
});
