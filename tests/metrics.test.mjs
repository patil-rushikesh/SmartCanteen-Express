import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { observeRequests, startMetricsServer, metricsRegistry } from '../dist/services/shared/metrics.js';

test('metrics use bounded labels, count failures, and remain on a separate loopback listener', async () => {
  const app = express();
  app.use(observeRequests);
  app.get('/orders/:id', (_req, res) => res.sendStatus(500));
  app.get('/api/ready', (_req, res) => res.sendStatus(200));
  const api = app.listen(0, '127.0.0.1');
  const metrics = startMetricsServer(0);
  await Promise.all([once(api, 'listening'), once(metrics, 'listening')]);
  try {
    const base = `http://127.0.0.1:${api.address().port}`;
    await fetch(`${base}/orders/private-order-id?token=private-token`);
    await fetch(`${base}/missing-private-path`);
    await fetch(`${base}/api/ready`);
    assert.equal((await fetch(`${base}/metrics`)).status, 404);
    const response = await fetch(`http://127.0.0.1:${metrics.address().port}/metrics`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /smartcanteen_http_requests_total\{method="GET",route="\/orders\/:id",status_code="500"\} 1/);
    assert.match(body, /route="unmatched"/);
    assert.match(body, /smartcanteen_http_request_duration_seconds_bucket/);
    assert.doesNotMatch(body, /private-order-id|private-token|missing-private-path|route="\/api\/ready"/);
    assert.equal(metrics.address().address, '127.0.0.1');
    assert.equal((await fetch(`http://127.0.0.1:${metrics.address().port}/other`)).status, 404);
  } finally {
    await Promise.all([new Promise(r => api.close(r)), new Promise(r => metrics.close(r))]);
    metricsRegistry.clear();
  }
});
