import { describe, expect, it, vi } from 'vitest';
import { completeAdminLogout } from './adminLogout';

describe('completeAdminLogout', () => {
  it('clears local state and redirects only after server logout succeeds', async () => {
    const clearClientState = vi.fn();
    const redirectToLogin = vi.fn();

    await completeAdminLogout({
      clearClientState,
      logout: vi.fn().mockResolvedValue(undefined),
      redirectToLogin,
    });

    expect(clearClientState).toHaveBeenCalledOnce();
    expect(redirectToLogin).toHaveBeenCalledOnce();
  });

  it('preserves local state and the authenticated view when server logout fails', async () => {
    const clearClientState = vi.fn();
    const redirectToLogin = vi.fn();

    await expect(
      completeAdminLogout({
        clearClientState,
        logout: vi.fn().mockRejectedValue(new Error('Network unavailable')),
        redirectToLogin,
      }),
    ).rejects.toThrow('Network unavailable');

    expect(clearClientState).not.toHaveBeenCalled();
    expect(redirectToLogin).not.toHaveBeenCalled();
  });
});
