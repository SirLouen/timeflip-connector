module.exports = {
  apps: [{
    name: 'timeflip-connector',
    script: 'index.js',
    cwd: '/path/to/timeflip-node-app',  // Change this to your installation path
    interpreter: 'node',
    env: {
      NODE_ENV: 'production'
    },
    // The app runs continuously and handles BLE reconnections internally
    // No auto-restart needed - the app never crashes, it just waits for BLE events
    autorestart: false,
    watch: false,
    // Logging
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }]
};
