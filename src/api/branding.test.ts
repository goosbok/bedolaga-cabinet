import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandingInfo } from './branding';

const BRANDING: BrandingInfo = {
  name: 'MAX VPN',
  // Exactly what the backend returns (app/cabinet/routes/branding.py).
  logo_url: '/cabinet/branding/logo',
  logo_letter: 'M',
  has_custom_logo: true,
};

function stubStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('localStorage', storage);
}

beforeEach(() => {
  // preloadLogo caches the blob URL in module state, so each test needs a fresh copy.
  vi.resetModules();
  vi.unstubAllGlobals();
  stubStorage();
  Object.assign(URL, {
    createObjectURL: () => 'blob:logo',
    revokeObjectURL: () => {},
  });
});

describe('preloadLogo', () => {
  it('asks the API for the logo, not the SPA', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('png bytes', { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { preloadLogo, getLogoBlobUrl } = await import('./branding');
    await preloadLogo(BRANDING);

    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/branding/logo');
    expect(getLogoBlobUrl()).toBe('blob:logo');
  });

  // A path the backend does not own is answered by the SPA catch-all with
  // `200 text/html`, so `response.ok` is no guarantee that a logo came back.
  // Turning that page into a blob URL shows a broken image and marks the logo
  // as preloaded; falling through leaves the letter fallback in place.
  it('ignores an HTML page instead of showing it as a broken logo', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
        ),
    );

    const { preloadLogo, getLogoBlobUrl, isLogoPreloaded } = await import('./branding');
    await preloadLogo(BRANDING);

    expect(getLogoBlobUrl()).toBeNull();
    expect(isLogoPreloaded()).toBe(false);
  });

  it('does nothing when no custom logo is set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { preloadLogo } = await import('./branding');
    await preloadLogo({ ...BRANDING, has_custom_logo: false, logo_url: null });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
