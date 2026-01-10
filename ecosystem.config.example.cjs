module.exports = {
  apps: [{
    name: 'timeflip-connector',
    script: 'index.js',
    cwd: '/path/to/timeflip-node-app',  // Change this to your installation path
    interpreter: 'node',
    env: {
      NODE_ENV: 'production'
    },
    // Auto-restart settings
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,
    // Logging
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    // Wait for device to be ready on boot
    wait_ready: true,
    listen_timeout: 10000,
  }]
};
