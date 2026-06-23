/**
 * Launch a custom-scheme app deep link (happ://, v2rayng://, vless://, …).
 *
 * This function is only called when isTelegramWebApp=false (regular browser).
 * Telegram WebApp deep links use sdkOpenLink / redirect.html separately.
 *
 * Modern browsers (iOS Safari 16+, Android Chrome 66+) block custom-scheme
 * iframe navigation silently or outright. Direct window.location.href from
 * a user gesture is the only reliable way to launch an app. If the app is
 * not installed: iOS shows a dismissible "Cannot Open Page" dialog, Android
 * shows ERR_UNKNOWN_URL_SCHEME — both are acceptable UX since the user
 * explicitly tapped a button.
 *
 * http(s) links navigate normally.
 */
export function openAppScheme(url: string): void {
  window.location.href = url;
}
