import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from './BottomNav';

function renderNav(onRouteIntent = vi.fn(), onOpenQuickLog = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <BottomNav onOpenQuickLog={onOpenQuickLog} onRouteIntent={onRouteIntent} />
      <Routes>
        <Route path="/" element={<div>Home route</div>} />
        <Route path="/timeline" element={<div>Timeline route</div>} />
        <Route path="/growth" element={<div>Growth route</div>} />
        <Route path="/expenses" element={<div>Expenses route</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return { onRouteIntent, onOpenQuickLog };
}

afterEach(() => {
  delete document.documentElement.dataset.tabDirection;
});

describe('BottomNav', () => {
  it('prefetches on interaction intent before navigation', () => {
    const { onRouteIntent } = renderNav();
    const timelineLink = screen.getByRole('link', { name: 'Nhật ký' });

    fireEvent.pointerDown(timelineLink);
    expect(onRouteIntent).toHaveBeenLastCalledWith('/timeline');
    expect(screen.getByText('Home route')).toBeInTheDocument();

    fireEvent.focus(timelineLink);
    expect(onRouteIntent).toHaveBeenLastCalledWith('/timeline');

    fireEvent.click(timelineLink);
    expect(screen.getByText('Timeline route')).toBeInTheDocument();
  });

  it('navigates immediately even when an async route preload is pending', async () => {
    let finishPreload: (() => void) | undefined;
    const onRouteIntent = vi.fn(() => new Promise<void>((resolve) => {
      finishPreload = resolve;
    }));
    renderNav(onRouteIntent);

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Nhật ký' }));
    fireEvent.click(screen.getByRole('link', { name: 'Nhật ký' }));
    // Navigation happens immediately — no blocking on preload
    expect(screen.getByText('Timeline route')).toBeInTheDocument();
    expect(onRouteIntent).toHaveBeenCalledTimes(1);

    // Preload resolves in background — no effect on already-navigated route
    finishPreload?.();
    expect(screen.getByText('Timeline route')).toBeInTheDocument();
  });

  it('navigates to the last clicked tab regardless of preload resolution order', async () => {
    const finishPreload = new Map<string, () => void>();
    const onRouteIntent = vi.fn((pathname: string) => new Promise<void>((resolve) => {
      finishPreload.set(pathname, resolve);
    }));
    renderNav(onRouteIntent);

    fireEvent.click(screen.getByRole('link', { name: 'Nhật ký' }));
    fireEvent.click(screen.getByRole('link', { name: 'Tăng trưởng' }));

    // Navigation is immediate — last click wins
    expect(screen.getByText('Growth route')).toBeInTheDocument();
    expect(screen.queryByText('Timeline route')).not.toBeInTheDocument();

    await act(async () => finishPreload.get('/growth')?.());
    await act(async () => finishPreload.get('/timeline')?.());
    expect(screen.getByText('Growth route')).toBeInTheDocument();
  });

  it('keeps the center Quick Log action functional', () => {
    const { onOpenQuickLog } = renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'Ghi chép nhanh' }));

    expect(onOpenQuickLog).toHaveBeenCalledTimes(1);
  });

  it('applies the matching selected color theme to each tab', () => {
    renderNav();

    const homeLink = screen.getByRole('link', { name: 'Trang chủ' });
    const growthLink = screen.getByRole('link', { name: 'Tăng trưởng' });
    const expensesLink = screen.getByRole('link', { name: 'Chi tiêu' });
    const timelineLink = screen.getByRole('link', { name: 'Nhật ký' });

    expect(homeLink).toHaveClass('nav-tab-item-home', 'active');
    fireEvent.click(timelineLink);
    expect(timelineLink).toHaveClass('nav-tab-item-timeline', 'active');
    fireEvent.click(growthLink);
    expect(growthLink).toHaveClass('nav-tab-item-growth', 'active');
    fireEvent.click(expensesLink);
    expect(expensesLink).toHaveClass('nav-tab-item-expenses', 'active');
  });

  it('marks whether the next primary tab is forward or backward', () => {
    renderNav();

    fireEvent.click(screen.getByRole('link', { name: 'Tăng trưởng' }));
    expect(document.documentElement).toHaveAttribute('data-tab-direction', 'forward');

    fireEvent.click(screen.getByRole('link', { name: 'Nhật ký' }));
    expect(document.documentElement).toHaveAttribute('data-tab-direction', 'backward');
  });
});
