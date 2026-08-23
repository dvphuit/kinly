import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PasskeyVaultPrototypeView } from './PasskeyVaultPrototypeView';

vi.mock('./index', () => ({
  isGoogleSessionActive: vi.fn(() => false),
  restoreGoogleSession: vi.fn(async () => true),
  startGoogleOAuth: vi.fn(async () => undefined),
}));

vi.mock('./passkeyTokenVault', () => ({
  PasskeyTokenVaultError: class PasskeyTokenVaultError extends Error {},
  clearPasskeyTokenVault: vi.fn(async () => undefined),
  hasGoogleRefreshTokenInPasskeyVault: vi.fn(async () => false),
  hasPasskeyTokenVault: vi.fn(async () => false),
  isPasskeyTokenVaultSupported: vi.fn(async () => true),
}));

describe('PasskeyVaultPrototypeView', () => {
  it('renders the production Google Drive passkey setup as a body-level mobile page', async () => {
    render(
      <MemoryRouter>
        <PasskeyVaultPrototypeView />
      </MemoryRouter>,
    );

    const page = screen.getByRole('main', { name: 'Google Drive bằng Passkey' });
    expect(page.parentElement).toBe(document.body);
    expect(screen.getByRole('heading', { name: 'Google Drive bằng Passkey' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Không cần đăng nhập Google mỗi lần' })).toBeInTheDocument();
    expect(await screen.findByText('Sẵn sàng thiết lập')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kết nối Google Drive một lần/i })).toBeEnabled();
    expect(screen.queryByText(/Prototype/i)).not.toBeInTheDocument();
  });
});
