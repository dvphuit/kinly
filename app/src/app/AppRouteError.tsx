import { useRouteError } from 'react-router-dom';

export function AppRouteError() {
  const error = useRouteError();
  console.error('[router] Không thể mở route:', error);

  return (
    <main className="app-container" id="appContainer">
      <div className="route-loading-state" role="alert">
        <div style={{ display: 'grid', justifyItems: 'center', gap: 10, maxWidth: 320, textAlign: 'center' }}>
          <strong>Không thể mở trang</strong>
          <span>Kinly chưa tải được phần này. Hãy kiểm tra kết nối rồi thử lại.</span>
          <button className="swipe-action-btn" type="button" onClick={() => window.location.reload()}>
            Tải lại ứng dụng
          </button>
        </div>
      </div>
    </main>
  );
}
