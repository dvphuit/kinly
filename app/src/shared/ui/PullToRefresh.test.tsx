import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PullToRefresh } from './PullToRefresh';

function pull(root: Element, distance: number): void {
  fireEvent.touchStart(root, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(root, { touches: [{ clientY: distance }] });
  fireEvent.touchEnd(root);
}

function getRoot(container: HTMLElement): Element {
  const root = container.querySelector('.ptr-root');
  if (!root) throw new Error('Pull-to-refresh root was not rendered.');
  return root;
}

describe('PullToRefresh', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses the first threshold for a soft refresh without invoking hard reload', () => {
    const onSoftRefresh = vi.fn();
    const onHardRefresh = vi.fn();
    const { container } = render(
      <PullToRefresh onSoftRefresh={onSoftRefresh} onHardRefresh={onHardRefresh}>
        <div>Content</div>
      </PullToRefresh>,
    );
    const root = getRoot(container);

    fireEvent.touchStart(root, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(root, { touches: [{ clientY: 140 }] });
    expect(container.querySelector('.ptr-label')).toHaveTextContent('Thả để làm mới');
    fireEvent.touchEnd(root);

    expect(onSoftRefresh).toHaveBeenCalledTimes(1);
    expect(onHardRefresh).not.toHaveBeenCalled();
  });

  it('uses the deeper second threshold for an intentional hard refresh', () => {
    const onSoftRefresh = vi.fn();
    const onHardRefresh = vi.fn();
    const { container } = render(
      <PullToRefresh onSoftRefresh={onSoftRefresh} onHardRefresh={onHardRefresh}>
        <div>Content</div>
      </PullToRefresh>,
    );
    const root = getRoot(container);

    fireEvent.touchStart(root, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(root, { touches: [{ clientY: 260 }] });
    expect(container.querySelector('.ptr-label')).toHaveTextContent('Thả để tải lại ứng dụng');
    fireEvent.touchEnd(root);

    expect(onHardRefresh).toHaveBeenCalledTimes(1);
    expect(onSoftRefresh).not.toHaveBeenCalled();
  });

  it('does nothing when released before the soft threshold', () => {
    const onSoftRefresh = vi.fn();
    const onHardRefresh = vi.fn();
    const { container } = render(
      <PullToRefresh onSoftRefresh={onSoftRefresh} onHardRefresh={onHardRefresh}>
        <div>Content</div>
      </PullToRefresh>,
    );
    const root = getRoot(container);

    pull(root, 100);

    expect(onSoftRefresh).not.toHaveBeenCalled();
    expect(onHardRefresh).not.toHaveBeenCalled();
  });

  it('restores the content position after a soft refresh finishes', async () => {
    vi.useFakeTimers();
    const { container } = render(
      <PullToRefresh onSoftRefresh={vi.fn()} onHardRefresh={vi.fn()}>
        <div>Content</div>
      </PullToRefresh>,
    );
    const root = getRoot(container);
    const content = container.querySelector<HTMLElement>('.ptr-content');
    expect(content).not.toBeNull();
    expect(container.querySelector('.ptr-sprout-icon')).not.toBeNull();

    pull(root, 140);

    expect(root).toHaveClass('is-refreshing');
    expect(content?.style.transform).not.toBe('translate3d(0, 0px, 0)');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(root).not.toHaveClass('is-refreshing');
    expect(content?.style.transform).toBe('translate3d(0, 0px, 0)');
    expect(container.querySelector('.ptr-label')).toHaveTextContent('Kéo để làm mới');
  });

  it('settles after an asynchronous hard refresh returns without reloading', async () => {
    vi.useFakeTimers();
    const { container } = render(
      <PullToRefresh onSoftRefresh={vi.fn()} onHardRefresh={async () => undefined}>
        <div>Content</div>
      </PullToRefresh>,
    );
    const root = getRoot(container);

    pull(root, 260);
    expect(root).toHaveClass('is-hard-refreshing');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(root).not.toHaveClass('is-refreshing', 'is-hard-refreshing');
    expect(container.querySelector<HTMLElement>('.ptr-content')?.style.transform).toBe('translate3d(0, 0px, 0)');
  });
});
