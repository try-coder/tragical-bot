// utils/logger.js
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        data
    };
    
    // Console colors
    const colors = {
        'ERROR': '\x1b[31m', // Red
        'WARN': '\x1b[33m',  // Yellow
        'INFO': '\x1b[36m',  // Cyan
        'SUCCESS': '\x1b[32m', // Green
        'DEBUG': '\x1b[35m', // Magenta
        'RESET': '\x1b[0m'
    };
    
    const color = colors[level] || colors.INFO;
    console.log(`${color}[${level}]${colors.RESET} ${message}`);
    
    // Write to file (daily log files)
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `${date}.log`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

module.exports = { log };
