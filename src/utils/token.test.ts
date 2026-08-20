import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStorage } from './token';

/**
 * The reported failure: storage throws, the write is swallowed, and the app goes
 * on believing it is signed in while every request leaves without a token.
 */
const throwingStorage = {
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('storage disabled');
  },
  removeItem: () => {
    throw new Error('storage disabled');
  },
  clear: () => {},
};

const workingStorage = () => {
  const backing = new Map<string, string>();
  return {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, v);
    },
    removeItem: (k: string) => {
      backing.delete(k);
    },
    clear: () => backing.clear(),
  };
};

beforeEach(() => {
  tokenStorage.clearTokens();
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokenStorage.clearTokens();
});

describe('tokenStorage with unwritable storage', () => {
  it('keeps the session usable when both stores throw', () => {
    vi.stubGlobal('sessionStorage', throwingStorage);
    vi.stubGlobal('localStorage', throwingStorage);

    tokenStorage.setTokens('access-1', 'refresh-1');

    expect(tokenStorage.getAccessToken()).toBe('access-1');
    expect(tokenStorage.getRefreshToken()).toBe('refresh-1');
  });

  // The original bug in miniature: both writes shared one try block, so a throw
  // on the access token silently cost the refresh token as well — leaving
  // nothing to recover the session with.
  it('still keeps the refresh token when only sessionStorage throws', () => {
    vi.stubGlobal('sessionStorage', throwingStorage);
    vi.stubGlobal('localStorage', workingStorage());

    tokenStorage.setTokens('access-2', 'refresh-2');

    expect(tokenStorage.getRefreshToken()).toBe('refresh-2');
    expect(tokenStorage.getAccessToken()).toBe('access-2');
  });

  it('clearTokens drops the in-memory copy too', () => {
    vi.stubGlobal('sessionStorage', throwingStorage);
    vi.stubGlobal('localStorage', throwingStorage);

    tokenStorage.setTokens('access-3', 'refresh-3');
    tokenStorage.clearTokens();

    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('prefers persisted storage over the memory copy when it works', () => {
    const session = workingStorage();
    vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('localStorage', workingStorage());

    tokenStorage.setTokens('access-4', 'refresh-4');
    expect(tokenStorage.getAccessToken()).toBe('access-4');
  });
});
