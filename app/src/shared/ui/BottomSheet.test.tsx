import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { BottomSheet } from './BottomSheet';

afterEach(() => {
  vi.unstubAllGlobals();
});

function BottomSheetHarness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Open sheet</button>
      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Accessible sheet"
        description="A descriptive line for this sheet"
      >
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </BottomSheet>
    </>
  );
}

function SwipeDismissHarness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={() => {
        setIsOpen(false);
        onClose();
      }}
      title="Swipe sheet"
    >
      <p>Swipe content</p>
    </BottomSheet>
  );
}

describe('BottomSheet accessibility and dismissal', () => {
  it('acts as a named modal, exposes its description, and restores focus to its opener', async () => {
    const user = userEvent.setup();
    render(<BottomSheetHarness />);
    const opener = screen.getByRole('button', { name: 'Open sheet' });

    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Accessible sheet' });
    const description = screen.getByText('A descriptive line for this sheet');
    const dragArea = document.querySelector<HTMLElement>('.sheet-drag-handle-area')!;
    const handle = document.querySelector<HTMLElement>('.sheet-handle-bar')!;
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-describedby', description.id);
    expect(description).toHaveClass('sheet-description');
    expect(dragArea).toContainElement(handle);
    expect(dialog).toContainElement(dragArea);
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    const close = screen.getByRole('button', { name: 'Đóng' });
    const last = screen.getByRole('button', { name: 'Last action' });
    last.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.click(close);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 500 });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('locks body scrolling across simultaneous sheets and restores the original inline value', () => {
    document.body.style.overflow = 'scroll';
    const { rerender, unmount } = render(
      <>
        <BottomSheet isOpen onClose={() => {}} title="First sheet"><p>First</p></BottomSheet>
        <BottomSheet isOpen onClose={() => {}} title="Second sheet"><p>Second</p></BottomSheet>
      </>,
    );

    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <BottomSheet isOpen onClose={() => {}} title="First sheet">
        <p>First</p>
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });

  it('dismisses from the mobile indicator, backdrop, and Escape key', () => {
    const onClose = vi.fn();
    render(<BottomSheet isOpen onClose={onClose} title="Dismissible sheet"><p>Content</p></BottomSheet>);
    const handle = document.querySelector('.sheet-handle-bar')!;
    const backdrop = document.querySelector('.modal-backdrop')!;

    fireEvent.click(handle);
    fireEvent.click(backdrop);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('keeps the backdrop hidden during swipe dismissal', async () => {
    const onClose = vi.fn();
    render(<SwipeDismissHarness onClose={onClose} />);
    const dragArea = document.querySelector('.sheet-drag-handle-area')!;
    const backdrop = document.querySelector('.modal-backdrop')!;

    fireEvent.pointerDown(dragArea, { pointerId: 7, clientY: 0 });
    fireEvent.pointerMove(dragArea, { pointerId: 7, clientY: 120 });
    fireEvent.pointerUp(dragArea, { pointerId: 7, clientY: 120 });

    await waitFor(() => expect(backdrop).toHaveClass('native-drag-dismissed'));
    expect(backdrop).toHaveStyle({ opacity: '0' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss below the distance threshold or when content is scrolled', async () => {
    const onClose = vi.fn();
    const { unmount } = render(<BottomSheet isOpen onClose={onClose} title="Threshold sheet"><p>Content</p></BottomSheet>);
    const dragArea = document.querySelector('.sheet-drag-handle-area')!;
    const content = document.querySelector('.sheet-content-body') as HTMLDivElement;
    const performanceNow = vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1300);
    fireEvent.pointerDown(dragArea, { pointerId: 8, clientY: 0 });
    fireEvent.pointerMove(dragArea, { pointerId: 8, clientY: 60 });
    fireEvent.pointerUp(dragArea, { pointerId: 8, clientY: 60 });
    await Promise.resolve();
    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();
    performanceNow.mockRestore();

    content.scrollTop = 24;
    fireEvent.pointerDown(dragArea, { pointerId: 9, clientY: 0 });
    fireEvent.pointerMove(dragArea, { pointerId: 9, clientY: 120 });
    fireEvent.pointerUp(dragArea, { pointerId: 9, clientY: 120 });
    expect(onClose).not.toHaveBeenCalled();
    unmount();
  });

  it('does not start pointer dismissal on the centered desktop presentation', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const onClose = vi.fn();
    render(<BottomSheet isOpen onClose={onClose} title="Desktop sheet"><p>Content</p></BottomSheet>);
    const dragArea = document.querySelector('.sheet-drag-handle-area')!;
    const dialog = screen.getByRole('dialog', { name: 'Desktop sheet' });

    fireEvent.pointerDown(dragArea, { pointerId: 10, clientY: 0 });
    fireEvent.pointerMove(dragArea, { pointerId: 10, clientY: 160 });
    fireEvent.pointerUp(dragArea, { pointerId: 10, clientY: 160 });

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).not.toHaveStyle({ transform: 'translate3d(0, 160px, 0)' });
  });

  it('does not start any dismissal path when dismissible is false', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen onClose={onClose} title="Locked sheet" dismissible={false}>
        <button type="button">Action</button>
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Locked sheet' });
    const backdrop = document.querySelector('.modal-backdrop')!;
    const handle = document.querySelector('.sheet-handle-bar')!;

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(backdrop);
    fireEvent.click(handle);
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.pointerDown(dialog, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(dialog, { pointerId: 1, clientY: 120 });
    fireEvent.pointerUp(dialog, { pointerId: 1, clientY: 120 });

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).not.toHaveClass('closing');
  });

  it('portals the overlay to document.body so app stacking contexts cannot cover it', () => {
    const { container } = render(
      <div style={{ position: 'relative', zIndex: 2 }}>
        <BottomSheet isOpen onClose={() => {}} title="Nested sheet">
          <p>Nested content</p>
        </BottomSheet>
      </div>,
    );

    const backdrop = document.querySelector('.modal-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.parentElement).toBe(document.body);
    expect(container.querySelector('.modal-backdrop')).toBeNull();
  });

  it('renders fixed footer outside the scrollable content body', () => {
    render(
      <BottomSheet
        isOpen
        onClose={() => {}}
        title="Footer test"
        footer={<button type="button">Fixed Save</button>}
      >
        <p>Scrollable body content</p>
      </BottomSheet>,
    );

    expect(screen.getByRole('button', { name: 'Fixed Save' })).toBeInTheDocument();
    const footerEl = screen.getByRole('button', { name: 'Fixed Save' }).parentElement;
    expect(footerEl).toHaveClass('sheet-footer');
  });
});
