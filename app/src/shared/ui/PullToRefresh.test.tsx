import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PullToRefresh } from './PullToRefresh';

function pull(root: Element, distance: number): void {
  fireEvent.touchStart(root, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(root, { touches: [{ clientY: distance }] });
  fireEvent.touchEnd(root);
}

describe('PullToRefresh', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
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
    const root = container.querySelector('.ptr-root');
    expect(root).not.toBeNull();

    fireEvent.touchStart(root!, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(root!, { touches: [{ clientY: 140 }] });
    expect(container.querySelector('.ptr-label')).toHaveTextContent('Thả để làm mới');
    fireEvent.touchEnd(root!);

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
    const root = container.querySelector('.ptr-root');
    expect(root).not.toBeNull();

    fireEvent.touchStart(root!, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(root!, { touches: [{ clientY: 260 }] });
    expect(container.querySelector('.ptr-label')).toHaveTextContent('Thả để tải lại ứng dụng');
    fireEvent.touchEnd(root!);

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
    const root = container.querySelector('.ptr-root');
    expect(root).not.toBeNull();

    pull(root!, 100);

    expect(onSoftRefresh).not.toHaveBeenCalled();
    expect(onHardRefresh).not.toHaveBeenCalled();
  });
});
