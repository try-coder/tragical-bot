// utils/logger.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, data };
    
    const colors = {
        'ERROR': '\x1b[31m',
        'WARN': '\x1b[33m',
        'INFO': '\x1b[36m',
        'SUCCESS': '\x1b[32m',
        'RESET': '\x1b[0m'
    };
    
    const color = colors[level] || colors.INFO;
    console.log(`${color}[${level}]${colors.RESET} ${message}`);
    
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `${date}.log`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

export { log };
