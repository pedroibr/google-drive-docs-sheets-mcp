import { describe, expect, it } from 'vitest';
import { OfflineGoogleProvider } from './offlineGoogleProvider.js';

class TestOfflineGoogleProvider extends OfflineGoogleProvider {
  public authorizationEndpoint(): string {
    return this.getAuthorizationEndpoint();
  }
}

describe('OfflineGoogleProvider', () => {
  it('requests offline access and consent from Google', () => {
    const provider = new TestOfflineGoogleProvider({
      baseUrl: 'https://example.com',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    const endpoint = new URL(provider.authorizationEndpoint());

    expect(endpoint.origin + endpoint.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(endpoint.searchParams.get('access_type')).toBe('offline');
    expect(endpoint.searchParams.get('prompt')).toBe('consent');
  });
});
