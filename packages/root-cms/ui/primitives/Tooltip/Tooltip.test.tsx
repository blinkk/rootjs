import {act, cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {forwardRef} from 'preact/compat';
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
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    // The tooltip attaches to the trigger itself, without a wrapper.
    expect(trigger.closest('.Tooltip')).toBeNull();

    fireEvent.pointerEnter(trigger);
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const tooltip = screen.getByRole('tooltip');
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(tooltip.parentElement!.hidden).toBe(false);

    fireEvent.pointerLeave(trigger);
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);

    fireEvent.pointerEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(trigger, {key: 'Escape'});
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
  });

  it('never shows on touch, and renders only the trigger when disabled', () => {
    const {rerender} = render(
      <Tooltip label="Opens the preview">
        <button type="button">Preview</button>
      </Tooltip>
    );
    fireEvent.pointerEnter(screen.getByRole('button'), {pointerType: 'touch'});
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();

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

  it('wraps triggers that cannot take a ref', () => {
    const Plain = () => <button type="button">Plain</button>;
    render(
      <Tooltip label="Wrapped">
        <Plain />
      </Tooltip>
    );
    const wrapper = screen.getByRole('button').parentElement!;
    expect(wrapper.classList.contains('Tooltip')).toBe(true);
    fireEvent.pointerEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(
      screen.getByRole('tooltip', {hidden: true}).parentElement!.hidden
    ).toBe(false);
  });

  it('keeps working when a forwardRef trigger swaps its DOM element', () => {
    const PolymorphicTrigger = forwardRef<HTMLElement, {href?: string}>(
      ({href, ...rest}, ref) =>
        href ? (
          <a ref={ref as any} href={href} {...rest}>
            Action
          </a>
        ) : (
          <button ref={ref as any} type="button" {...rest}>
            Action
          </button>
        )
    );
    const {rerender} = render(
      <Tooltip label="Open link">
        <PolymorphicTrigger />
      </Tooltip>
    );

    rerender(
      <Tooltip label="Open link">
        <PolymorphicTrigger href="/docs" />
      </Tooltip>
    );

    const link = screen.getByRole('link', {name: 'Action'});
    fireEvent.pointerEnter(link);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('tooltip').textContent).toBe('Open link');
  });

  it('plays the exit animation before unmounting for controlled tooltips', () => {
    const animations: Array<{onfinish?: () => void; cancel: () => void}> = [];
    const origAnimate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = vi.fn(() => {
      const anim = {
        onfinish: undefined as (() => void) | undefined,
        cancel: vi.fn(),
      };
      animations.push(anim);
      return anim as unknown as Animation;
    });
    try {
      const {rerender} = render(
        <Tooltip label="Controlled" open>
          <button type="button">Trigger</button>
        </Tooltip>
      );
      expect(screen.getByRole('tooltip')).toBeTruthy();

      rerender(
        <Tooltip label="Controlled" open={false}>
          <button type="button">Trigger</button>
        </Tooltip>
      );
      // Still mounted while the exit animation runs.
      expect(screen.getByRole('tooltip')).toBeTruthy();
      expect(animations.length).toBeGreaterThan(0);

      act(() => {
        animations[animations.length - 1].onfinish?.();
      });
      expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    } finally {
      HTMLElement.prototype.animate = origAnimate;
    }
  });
});
