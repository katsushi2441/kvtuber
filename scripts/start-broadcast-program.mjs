#!/usr/bin/env node

const programId = process.argv[2] || 'vibe-coding-intro';
const baseUrl = process.env.KURAGE_LIVE_URL || 'http://127.0.0.1:18308';
const token = process.env.KURAGE_ADMIN_TOKEN || 'kurage-admin';
const autoplay = process.env.KURAGE_AUTOPLAY !== '0';

const url = new URL('/control/start-program', baseUrl);
url.searchParams.set('token', token);

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ programId, autoplay }),
});

const result = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      programId: result.program?.id || programId,
      title: result.program?.title || '',
      clients: result.clients,
      autoplay: result.autoplay,
    },
    null,
    2,
  ),
);
