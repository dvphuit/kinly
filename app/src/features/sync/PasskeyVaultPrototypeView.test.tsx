import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PasskeyVaultPrototypeView } from './PasskeyVaultPrototypeView';

vi.mock('./passkeyTokenVault', () => ({
  PasskeyTokenVaultError: class PasskeyTokenVaultError extends Error {},
  clearPasskeyTokenVault: vi.fn(async () => undefined),
  createPasskeyTokenVault: vi.fn(async () => undefined),
  hasPasskeyTokenVault: vi.fn(async () => false),
  isPasskeyTokenVaultSupported: vi.fn(async () => true),
  unlockPasskeyTokenVault: vi.fn(async () => 'probe-secret'),
}));

describe('PasskeyVaultPrototypeView', () => {
  it('renders as a body-level mobile page shell with explicit passkey typography', async () => {
    render(
      <MemoryRouter>
        <PasskeyVaultPrototypeView />
      </MemoryRouter>,
    );

    const page = screen.getByRole('main', { name: 'Thiết lập Passkey' });
    expect(page.parentElement).toBe(document.body);
    expect(screen.getByRole('heading', { name: 'Thiết lập Passkey' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Khóa dữ liệu bằng Passkey' })).toBeInTheDocument();
    expect(await screen.findByText('Thiết bị hỗ trợ Passkey')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tạo Passkey thử nghiệm/i })).toBeEnabled();
  });
});
