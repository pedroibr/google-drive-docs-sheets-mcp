import { GoogleProvider } from 'fastmcp';

/**
 * Google OAuth provider that always requests offline access so the upstream
 * token exchange can yield a refresh token when the user consents.
 */
export class OfflineGoogleProvider extends GoogleProvider {
  protected getAuthorizationEndpoint(): string {
    const authUrl = new URL(super.getAuthorizationEndpoint());
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    return authUrl.toString();
  }
}
