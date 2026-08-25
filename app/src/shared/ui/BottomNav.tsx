import { memo, type MouseEvent, type SyntheticEvent, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, CalendarHeart, TrendingUp, Wallet, Plus } from 'lucide-react';

interface BottomNavProps {
  onOpenQuickLog: () => void;
  onRouteIntent?: (pathname: string) => void | Promise<void>;
}

const navItems = [
  { to: '/', label: 'Trang chủ', Icon: Home, id: 'navTabHome', theme: 'home' },
  { to: '/timeline', label: 'Nhật ký', Icon: CalendarHeart, id: 'navTabTimeline', theme: 'timeline' },
] as const;

const navItemsRight = [
  { to: '/growth', label: 'Tăng trưởng', Icon: TrendingUp, id: 'navTabGrowth', theme: 'growth' },
  { to: '/expenses', label: 'Chi tiêu', Icon: Wallet, id: 'navTabExpenses', theme: 'expenses' },
] as const;

const TAB_PATHS = ['/', '/timeline', '/growth', '/expenses'] as const;
type TabPath = (typeof TAB_PATHS)[number];
type NavItem = (typeof navItems)[number] | (typeof navItemsRight)[number];

const TAB_DIRECTION_RESET_MS = 480;

const NavContent = ({ label, Icon, isActive }: { label: string; Icon: typeof Home; isActive: boolean }) => (
  <>
    <span className="nav-tab-active-pill" aria-hidden="true" />
    <span className="nav-tab-icon-motion">
      <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
    </span>
    <span className="nav-tab-label">{label}</span>
  </>
);

export const BottomNav = memo(function BottomNav({ onOpenQuickLog, onRouteIntent }: BottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const directionResetTimer = useRef<number | null>(null);
  const preloadPromises = useRef(new Map<string, Promise<void>>());
  const preloadGeneration = useRef(0);
  const navigationIntent = useRef(0);

  useEffect(() => () => {
    if (directionResetTimer.current !== null) window.clearTimeout(directionResetTimer.current);
    delete document.documentElement.dataset.tabDirection;
  }, []);

  useEffect(() => {
    preloadGeneration.current += 1;
    preloadPromises.current.clear();
  }, [onRouteIntent]);

  useEffect(() => {
    navigationIntent.current += 1;
  }, [location.pathname]);

  const preloadRoute = (pathname: string): Promise<void> | undefined => {
    const cached = preloadPromises.current.get(pathname);
    if (cached) return cached;

    let preload: void | Promise<void>;
    try {
      preload = onRouteIntent?.(pathname);
    } catch (error: unknown) {
      return Promise.reject(error);
    }
    if (!preload) return undefined;

    const generation = preloadGeneration.current;
    const tracked = preload.catch((error: unknown) => {
      if (preloadGeneration.current === generation) preloadPromises.current.delete(pathname);
      throw error;
    });
    preloadPromises.current.set(pathname, tracked);
    return tracked;
  };

  const handleRouteIntent = (event: SyntheticEvent<HTMLAnchorElement>) => {
    const pathname = event.currentTarget.dataset.route;
    if (!pathname) return;
    const preload = preloadRoute(pathname);
    if (preload) void preload.catch(() => undefined);
  };

  const markTabDirection = (targetPath: TabPath) => {
    const currentIndex = TAB_PATHS.findIndex((path) => path === location.pathname);
    const targetIndex = TAB_PATHS.findIndex((path) => path === targetPath);
    if (currentIndex < 0 || currentIndex === targetIndex) return;

    document.documentElement.dataset.tabDirection = targetIndex > currentIndex ? 'forward' : 'backward';
    if (directionResetTimer.current !== null) window.clearTimeout(directionResetTimer.current);
    directionResetTimer.current = window.setTimeout(() => {
      delete document.documentElement.dataset.tabDirection;
      directionResetTimer.current = null;
    }, TAB_DIRECTION_RESET_MS);
  };

  const handleTabClick = (event: MouseEvent<HTMLAnchorElement>, targetPath: TabPath) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    ++navigationIntent.current;
    if (targetPath === location.pathname) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    event.preventDefault();
    markTabDirection(targetPath);
    void preloadRoute(targetPath)?.catch(() => undefined);
    void navigate(targetPath, { viewTransition: true });
  };

  const renderNavItem = ({ to, label, Icon, id, theme }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      viewTransition
      className={({ isActive }) => `nav-tab-item nav-tab-item-${theme} ${isActive ? 'active' : ''}`}
      id={id}
      data-route={to}
      onClick={(event) => handleTabClick(event, to)}
      onPointerDown={handleRouteIntent}
      onPointerEnter={handleRouteIntent}
      onFocus={handleRouteIntent}
    >
      {({ isActive }) => <NavContent label={label} Icon={Icon} isActive={isActive} />}
    </NavLink>
  );

  return (
    <nav className="bottom-nav-container">
      {navItems.map(renderNavItem)}

      <div className="fab-center-wrapper">
        <button
          type="button"
          className="fab-center-btn"
          id="fabCenterBtn"
          title="Ghi chép nhanh"
          aria-label="Ghi chép nhanh"
          onClick={onOpenQuickLog}
        >
          <Plus size={24} strokeWidth={2.6} />
        </button>
      </div>

      {navItemsRight.map(renderNavItem)}
    </nav>
  );
});
