import { createServer } from 'node:http';
import type { RequestHandler } from 'express';
import { Registry, Counter, Histogram, collectDefaultMetrics } from '@prometheus-io/client';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'smartcanteen_' });
const requests = new Counter({
  name: 'smartcanteen_http_requests_total', help: 'Completed API requests',
  labelNames: ['method', 'route', 'status_code'], registers: [metricsRegistry]
});
const duration = new Histogram({
  name: 'smartcanteen_http_request_duration_seconds', help: 'API request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], registers: [metricsRegistry]
});
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

export const observeRequests: RequestHandler = (req, res, next) => {
  // Health probes are measured separately by the operations controller.
  if (['/api/health', '/api/ready'].includes(req.path)) return next();
  const started = process.hrtime.bigint();
  res.once('finish', () => {
    // Only route templates: never export URLs, query strings, tenant IDs or user IDs.
    const labels = {
      method: methods.has(req.method) ? req.method : 'OTHER',
      route: typeof req.route?.path === 'string' ? req.route.path : 'unmatched',
      status_code: String(res.statusCode)
    };
    requests.inc(labels);
    duration.observe(labels, Number(process.hrtime.bigint() - started) / 1e9);
  });
  next();
};

export function startMetricsServer(port = 9091) {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    void metricsRegistry.metrics().then(body => {
      res.writeHead(200, { 'Content-Type': metricsRegistry.contentType });
      res.end(body);
    }).catch(() => res.writeHead(500).end());
  });
  // Fargate containers in a task share localhost. No ALB route or public port.
  server.listen(port, '127.0.0.1');
  return server;
}
