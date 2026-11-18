import { apiClient } from '@/lib/api';
import { clearSession } from '@/lib/auth';

export async function logout() {
  try {
    const refresh = localStorage.getItem('refresh_token');
    if (refresh) await apiClient.logout(refresh);
  } catch {
    // The local session is cleared either way.
  } finally {
    clearSession();
  }
}
