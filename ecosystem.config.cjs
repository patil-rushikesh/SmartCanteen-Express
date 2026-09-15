module.exports = {
  apps: [{
    name: 'smartcanteen-api',
    script: 'dist/index.js',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 1000,
    max_memory_restart: '750M',
    kill_timeout: 26000,
    out_file: '/dev/stdout',
    error_file: '/dev/stderr',
    merge_logs: true,
    time: true
  }]
};
