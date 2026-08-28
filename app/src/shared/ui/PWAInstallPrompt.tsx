import React, { useState, useEffect } from 'react';
import { BottomSheet } from './BottomSheet';
import { Smartphone, Plus, X, Share2, PlusSquare, Check, Menu } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type BrowserType = 'samsung' | 'ios' | 'android' | 'other';

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [browserType, setBrowserType] = useState<BrowserType>('other');

  useEffect(() => {
    // Check if already in standalone mode
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Detect browser type
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice =
      /iphone|ipad|ipod/.test(userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isSamsung = /samsungbrowser/.test(userAgent);

    if (isSamsung) {
      setBrowserType('samsung');
    } else if (isIosDevice) {
      setBrowserType('ios');
    } else if (/android/.test(userAgent)) {
      setBrowserType('android');
    } else {
      setBrowserType('other');
    }

    // Listen for beforeinstallprompt event (Chrome / Edge / Android WebView)
    // NOTE: Samsung Internet does NOT fire this event, so it falls back to manual guide.
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Samsung Internet has no native install button & no beforeinstallprompt event.
    // Auto-open the manual install guide so users immediately see how to install.
    let guideTimer: ReturnType<typeof setTimeout> | undefined;
    if (isSamsung && !isStandaloneMode) {
      guideTimer = setTimeout(() => {
        setShowGuide(true);
      }, 1200);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      if (guideTimer) clearTimeout(guideTimer);
    };
  }, []);

  if (isStandalone || isDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsDismissed(true);
      }
      setDeferredPrompt(null);
    } else {
      // Samsung, iOS, or browsers without beforeinstallprompt → show manual guide
      setShowGuide(true);
    }
  };

  const renderGuideSteps = () => {
    if (browserType === 'samsung') {
      return (
        <>
          <div className="ios-step-item">
            <div className="ios-step-num">1</div>
            <div className="ios-step-content">
              <span className="ios-step-text">
                Bấm vào biểu tượng <strong>Menu (⋮)</strong>{' '}
                <Menu size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} /> ở góc dưới bên phải trình duyệt Samsung Internet.
              </span>
            </div>
          </div>

          <div className="ios-step-item">
            <div className="ios-step-num">2</div>
            <div className="ios-step-content">
              <span className="ios-step-text">
                Chọn <strong>"Thêm vào màn hình chính" (Add to Home screen)</strong>{' '}
                <PlusSquare size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} />.
              </span>
            </div>
          </div>

          <div className="ios-step-item">
            <div className="ios-step-num">3</div>
            <div className="ios-step-content">
              <span className="ios-step-text">
                Nhấn nút <strong>"Thêm" (Add)</strong> để hoàn tất. App sẽ xuất hiện trên màn hình chính.
              </span>
            </div>
          </div>
        </>
      );
    }

    if (browserType === 'ios') {
      return (
        <>
          <div className="ios-step-item">
            <div className="ios-step-num">1</div>
            <div className="ios-step-content">
              <span className="ios-step-text">
                Bấm vào biểu tượng <strong>Chia sẻ (Share)</strong>{' '}
                <Share2 size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} /> ở thanh công cụ dưới đáy trình duyệt Safari.
              </span>
            </div>
          </div>

          <div className="ios-step-item">
            <div className="ios-step-num">2</div>
            <div className="ios-step-content">
              <span className="ios-step-text">
                Cuộn xuống và chọn <strong>"Thêm vào MH chính" (Add to Home Screen)</strong>{' '}
                <PlusSquare size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} />.
              </span>
            </div>
          </div>

          <div className="ios-step-item">
            <div className="ios-step-num">3</div>
            <div className="ios-step-content">
              <span className="ios-step-text">
                Nhấn nút <strong>"Thêm" (Add)</strong> ở góc trên bên phải để hoàn tất.
              </span>
            </div>
          </div>
        </>
      );
    }

    // Android / other browsers
    return (
      <>
        <div className="ios-step-item">
          <div className="ios-step-num">1</div>
          <div className="ios-step-content">
            <span className="ios-step-text">
              Bấm vào biểu tượng <strong>Menu (⋮)</strong>{' '}
              <Menu size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} /> ở góc trên bên phải trình duyệt.
            </span>
          </div>
        </div>

        <div className="ios-step-item">
          <div className="ios-step-num">2</div>
          <div className="ios-step-content">
            <span className="ios-step-text">
              Chọn <strong>"Thêm vào màn hình chính" (Add to Home screen)</strong>{' '}
              <PlusSquare size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} />.
            </span>
          </div>
        </div>

        <div className="ios-step-item">
          <div className="ios-step-num">3</div>
          <div className="ios-step-content">
            <span className="ios-step-text">
              Nhấn nút <strong>"Thêm" (Add)</strong> để hoàn tất. App sẽ xuất hiện trên màn hình chính.
            </span>
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <div className="pwa-install-banner">
        <div className="pwa-install-info">
          <div className="pwa-install-icon">
            <Smartphone size={20} strokeWidth={2.2} />
          </div>
          <div className="pwa-install-text">
            <span className="pwa-install-title">Cài đặt Kinly</span>
            <span className="pwa-install-sub">Trải nghiệm toàn màn hình & dùng offline</span>
          </div>
        </div>

        <div className="pwa-install-actions">
          <button className="pwa-install-btn" onClick={handleInstallClick}>
            <span>Cài đặt</span>
            <Plus size={13} strokeWidth={2.5} />
          </button>
          <button
            className="pwa-dismiss-btn"
            onClick={() => setIsDismissed(true)}
            title="Đóng thông báo"
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Manual Installation Instruction Modal */}
      <BottomSheet
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        title="Hướng Dẫn Cài Đặt PWA"
        footer={
          <button
            className="sheet-action sheet-action-primary"
            onClick={() => setShowGuide(false)}
          >
            <span>Đã Hiểu</span>
            <Check size={16} strokeWidth={2.4} />
          </button>
        }
      >
        <div style={{ padding: '4px 0 8px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              background: 'var(--color-sage-subtle)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '16px',
            }}
          >
            <div style={{ color: 'var(--color-sage-dark)' }}>
              <Smartphone size={32} strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                Cài đặt lên màn hình chính
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                Sử dụng như ứng dụng gốc không cần tải từ App Store.
              </div>
            </div>
          </div>

          <div className="ios-install-steps">{renderGuideSteps()}</div>
        </div>
      </BottomSheet>
    </>
  );
};