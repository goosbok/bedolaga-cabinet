/**
 * Launch a custom-scheme app deep link (happ://, v2rayng://, vless://, …) without
 * crashing the page inside in-app browsers.
 *
 * iOS Safari (16+): iframe custom-scheme navigation is silently dropped — the app never
 * opens. Direct window.location.href IS triggered by user gesture and reliably launches
 * the app; if not installed iOS shows a dismissible "Cannot Open Page" dialog, which is
 * acceptable. We detect iOS and use direct navigation there.
 *
 * Android in-app browsers (Telegram/Yandex/…): direct navigation to an unknown scheme
 * paints a full-page net::ERR_UNKNOWN_URL_SCHEME. A hidden <iframe> is contained so
 * the page survives and the user can tap the fallback "Copy link" button.
 *
 * http(s) links are normal navigations and are passed straight to location.href.
 */
export function openAppScheme(url: string): void {
  const isHttp = /^https?:\/\//i.test(url);
  if (isHttp) {
    window.location.href = url;
    return;
  }

  // iOS Safari: iframe doesn't launch apps since iOS 16; use direct navigation.
  const isIOS = /iP(hone|ad|od)/i.test(navigator.userAgent);
  if (isIOS) {
    window.location.href = url;
    return;
  }

  // Android / other: use iframe so ERR_UNKNOWN_URL_SCHEME stays contained.
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* already detached */
      }
    }, 2000);
  } catch {
    // iframe creation blocked — fall back to direct navigation.
    window.location.href = url;
  }
}
