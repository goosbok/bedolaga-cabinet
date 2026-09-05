import { describe, expect, it } from 'vitest';

import { ticketsApi } from './tickets';

// The cabinet is built without VITE_API_URL — only the Docker build passes it
// (Dockerfile ARG), while the production bundle is built with a plain
// `npm run build` and deployed as static files. So every module has to fall
// back to '/api' on its own. A media URL that skips the prefix is served by the
// SPA catch-all instead of the backend: nginx answers `200 text/html` with
// index.html, and the browser renders the attachment as a broken image.
describe('ticketsApi.getMediaUrl', () => {
  it('keeps the /api prefix the rest of the client uses', () => {
    expect(ticketsApi.getMediaUrl('AgACAgIAAxkDAAIM1A')).toBe(
      '/api/cabinet/media/AgACAgIAAxkDAAIM1A',
    );
  });

  it('appends the signed token when one is given', () => {
    expect(ticketsApi.getMediaUrl('file-1', 'a b')).toBe('/api/cabinet/media/file-1?token=a%20b');
  });

  it('omits the query string when there is no token', () => {
    expect(ticketsApi.getMediaUrl('file-1', null)).toBe('/api/cabinet/media/file-1');
  });
});
