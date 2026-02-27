// index.js - Main Bot Entry Point with WEB QR DISPLAY
require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const axios = require('axios');
const connectDB = require('./config/database');
const { log } = require('./utils/logger');
const User = require('./models/User');
const Settings = require('./models/Settings');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Constants
const BOT_PIC = "https://i.pinimg.com/736x/e8/2a/ca/e82acad97e2c9e1825f164b8e6903a4a.jpg";
const WHATSAPP_GROUP = "https://chat.whatsapp.com/L6YoHagKWjD1oEQUKvAZUx?mode=gi_t";
const DISCORD_SERVER = "discord.gg/Hc3nwWJyep";
const OWNER_NUMBER = "7989176070256";
const BOT_PHONE = "254787031145";

// YouTube API Key
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;

// Store pending downloads and pairs
const pendingDownloads = new Map();
const pendingPairs = new Map();

// Official group JID
let OFFICIAL_GROUP_JID = null;
let OFFICIAL_GROUP_NAME = "TRAGICAL Official";
let OFFICIAL_GROUP_ICON = null;

// Anti-Detection Configuration
const DETECTION_PROTECTION = {
    minDelay: 2000,
    maxDelay: 5000,
    messagesPerMinute: 8,
    messagesPerHour: 50,
    groupMessagesPerMinute: 5,
};

// Rate limiting stores
const userRateLimits = new Map();
const groupRateLimits = new Map();

// Create public directory for QR codes
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// Create HTTP server for Railway with QR display
const server = http.createServer((req, res) => {
    if (req.url === '/qr.png' && fs.existsSync(path.join(publicDir, 'qrcode.png'))) {
        // Serve the QR code image
        const qrPath = path.join(publicDir, 'qrcode.png');
        const qrFile = fs.readFileSync(qrPath);
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(qrFile);
    } else if (req.url === '/qr.txt' && fs.existsSync('qrcode.txt')) {
        // Serve the QR text
        const qrText = fs.readFileSync('qrcode.txt', 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(qrText);
    } else {
        // Main page
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>TRAGICAL Bot</title>
                <style>
                    body { 
                        background: #000; 
                        color: #ff0000; 
                        font-family: 'Courier New', monospace; 
                        padding: 20px; 
                        text-align: center;
                        margin: 0;
                        min-height: 100vh;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    .container { 
                        background: #1a1a1a; 
                        padding: 40px; 
                        border-radius: 20px; 
                        border: 2px solid #ff0000;
                        max-width: 600px;
                        width: 90%;
                    }
                    h1 { color: #ff0000; font-size: 3em; margin-bottom: 10px; }
                    h2 { color: #ff4444; }
                    .status { 
                        background: #00aa00; 
                        color: white; 
                        padding: 10px; 
                        border-radius: 10px; 
                        margin: 20px 0;
                        font-size: 1.2em;
                    }
                    .qr-box { 
                        background: white; 
                        padding: 20px; 
                        border-radius: 10px; 
                        margin: 20px 0;
                        display: inline-block;
                    }
                    .qr-link {
                        display: inline-block;
                        background: #ff0000;
                        color: white;
                        padding: 15px 30px;
                        border-radius: 10px;
                        text-decoration: none;
                        font-size: 1.2em;
                        margin: 10px;
                        transition: all 0.3s;
                    }
                    .qr-link:hover {
                        background: #ff4444;
                        transform: scale(1.05);
                    }
                    .footer {
                        margin-top: 30px;
                        color: #666;
                        font-size: 0.9em;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 TRAGICAL Bot</h1>
                    <div class="status">✅ BOT IS RUNNING ON RAILWAY</div>
                    
                    <h2>📱 SCAN QR CODE TO CONNECT</h2>
                    
                    <div class="qr-box">
                        <img src="/qr.png" alt="QR Code" style="max-width: 300px;" onerror="this.style.display='none'">
                    </div>
                    
                    <div>
                        <a href="/qr.png" class="qr-link" download>📥 Download QR Image</a>
                        <a href="/qr.txt" class="qr-link" target="_blank">📋 View QR Text</a>
                    </div>
                    
                    <div style="margin: 20px 0; color: #ccc; text-align: left;">
                        <h3>📋 Instructions:</h3>
                        <ol style="line-height: 2;">
                            <li>Open WhatsApp on your phone</li>
                            <li>Go to Linked Devices</li>
                            <li>Tap "Link a Device"</li>
                            <li>Scan the QR code above</li>
                        </ol>
                    </div>
                    
                    <div class="footer">
                        ⚡ QR code refreshes every 60 seconds<br>
                        🔴 If QR doesn't show, wait a moment
                    </div>
                </div>
            </body>
            </html>
        `);
    }
});
server.listen(process.env.PORT || 3000);
console.log('🌐 Web server started on port', process.env.PORT || 3000);
console.log(`📱 Open your browser at: http://localhost:${process.env.PORT || 3000}`);

// Connect to MongoDB
connectDB();

// Load official group from database
async function loadOfficialGroup() {
    try {
        const settings = await Settings.findOne({ key: 'official_group' });
        if (settings) {
            OFFICIAL_GROUP_JID = settings.value.jid;
            OFFICIAL_GROUP_NAME = settings.value.name || 'TRAGICAL Official';
            OFFICIAL_GROUP_ICON = settings.value.icon || null;
        }
    } catch (error) {
        log('ERROR', `Failed to load official group: ${error.message}`);
    }
}

// Save official group to database
async function saveOfficialGroup(jid, name, icon = null) {
    try {
        await Settings.findOneAndUpdate(
            { key: 'official_group' },
            { value: { jid, name, icon } },
            { upsert: true }
        );
        OFFICIAL_GROUP_JID = jid;
        OFFICIAL_GROUP_NAME = name;
        OFFICIAL_GROUP_ICON = icon;
    } catch (error) {
        log('ERROR', `Failed to save official group: ${error.message}`);
    }
}

// Generate 8-digit code
function generatePairCode() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Simulate human typing delay
async function humanDelay() {
    const delay = Math.floor(Math.random() * (DETECTION_PROTECTION.maxDelay - DETECTION_PROTECTION.minDelay)) + DETECTION_PROTECTION.minDelay;
    return new Promise(resolve => setTimeout(resolve, delay));
}

// Check rate limits
function checkRateLimit(userId, groupId = null) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);
    
    const userKey = `${userId}-${minute}`;
    const userHourKey = `${userId}-${hour}`;
    
    let userMinuteData = userRateLimits.get(userKey) || 0;
    let userHourData = userRateLimits.get(userHourKey) || 0;
    
    if (userMinuteData >= DETECTION_PROTECTION.messagesPerMinute || 
        userHourData >= DETECTION_PROTECTION.messagesPerHour) {
        return false;
    }
    
    userRateLimits.set(userKey, userMinuteData + 1);
    userRateLimits.set(userHourKey, userHourData + 1);
    
    if (groupId) {
        const groupKey = `${groupId}-${minute}`;
        let groupData = groupRateLimits.get(groupKey) || 0;
        
        if (groupData >= DETECTION_PROTECTION.groupMessagesPerMinute) {
            return false;
        }
        
        groupRateLimits.set(groupKey, groupData + 1);
    }
    
    return true;
}

// Image download function
async function downloadImage(url) {
    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return Buffer.from(response.data, 'binary');
    } catch (error) {
        log('ERROR', `Failed to download image: ${error.message}`);
        return null;
    }
}

// YouTube Search Function
async function searchYouTube(query) {
    try {
        const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                q: query,
                type: 'video',
                maxResults: 1,
                key: YOUTUBE_API_KEY
            }
        });

        if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
            return null;
        }

        const video = searchResponse.data.items[0];
        const videoId = video.id.videoId;

        const statsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'statistics,contentDetails',
                id: videoId,
                key: YOUTUBE_API_KEY
            }
        });

        const stats = statsResponse.data.items[0];

        const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: {
                part: 'statistics',
                id: video.snippet.channelId,
                key: YOUTUBE_API_KEY
            }
        });

        const channel = channelResponse.data.items[0];

        return {
            videoId: videoId,
            title: video.snippet.title,
            channelName: video.snippet.channelTitle,
            channelSubs: formatNumber(channel?.statistics?.subscriberCount),
            views: formatNumber(stats?.statistics?.viewCount),
            duration: formatDuration(stats?.contentDetails?.duration),
            publishedAt: formatDate(video.snippet.publishedAt),
            thumbnail: video.snippet.thumbnails.high.url,
            url: `https://youtube.com/watch?v=${videoId}`
        };
    } catch (error) {
        log('ERROR', `YouTube API Error: ${error.message}`);
        return null;
    }
}

// Download using RapidAPI
async function downloadViaAPI(videoId) {
    try {
        const options = {
            method: 'GET',
            url: 'https://youtube-mp36.p.rapidapi.com/dl',
            params: { id: videoId },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST
            },
            timeout: 60000
        };

        const response = await axios.request(options);
        
        if (response.data && response.data.status === 'ok') {
            await humanDelay();
            
            const fileResponse = await axios.get(response.data.link, { 
                responseType: 'arraybuffer',
                timeout: 60000
            });
            
            const filename = `${response.data.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}.mp3`;
            
            return {
                buffer: Buffer.from(fileResponse.data),
                filename: filename,
                title: response.data.title
            };
        }
        return null;
    } catch (error) {
        log('ERROR', `API download error: ${error.message}`);
        return null;
    }
}

// Helper functions
function formatNumber(num) {
    if (!num) return 'N/A';
    num = parseInt(num);
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDuration(duration) {
    if (!duration) return 'N/A';
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');
    
    let result = '';
    if (hours) result += hours + ':';
    result += (minutes.padStart(2, '0') || '00') + ':';
    result += seconds.padStart(2, '0') || '00';
    return result;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 1) return 'Today';
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
}

async function startBot() {
    try {
        log('INFO', '🚀 Starting TRAGICAL Bot...');
        
        // Load official group
        await loadOfficialGroup();

        const { version, isLatest } = await fetchLatestBaileysVersion();
        log('INFO', `📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        const authFolder = process.env.SESSION_FOLDER || 'auth';
        if (!fs.existsSync(authFolder)) {
            fs.mkdirSync(authFolder, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        
        const browsers = [
            ['Chrome', '120.0.0.0'],
            ['Firefox', '110.0'],
            ['Safari', '17.0'],
        ];
        const randomBrowser = browsers[Math.floor(Math.random() * browsers.length)];
        
        const sock = makeWASocket({
            version,
            logger: Pino({ level: 'silent' }),
            auth: state,
            browser: ['TRAGICAL', ...randomBrowser.slice(1)],
            syncFullHistory: false,
            markOnlineOnConnect: false
        });

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;
            
            if (qr) {
                console.log('\n' + '='.repeat(60));
                console.log('📱 NEW QR CODE GENERATED');
                console.log('='.repeat(60));
                
                // Save QR as image
                const qrPath = path.join(publicDir, 'qrcode.png');
                await QRCode.toFile(qrPath, qr, {
                    color: {
                        dark: '#000000',
                        light: '#ffffff'
                    },
                    width: 400
                });
                
                // Save QR as text
                fs.writeFileSync('qrcode.txt', qr);
                
                // Get the Railway URL
                const railwayUrl = process.env.RAILWAY_STATIC_URL || `http://localhost:${process.env.PORT || 3000}`;
                
                console.log(`✅ QR Code saved as image!`);
                console.log(`📱 Open this URL in your browser to scan:`);
                console.log(`👉 ${railwayUrl}`);
                console.log('\n' + '='.repeat(60));
            }
            
            if (connection === 'open') {
                console.log('\n' + '✅'.repeat(20));
                console.log('✅ Bot connected successfully!');
                console.log(`🤖 Bot JID: ${sock.user?.id}`);
                console.log('✅'.repeat(20) + '\n');
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || '';
                
                if (statusCode === 401 || errorMessage.includes('logged out')) {
                    log('ERROR', '❌ Bot logged out. Delete auth folder and restart.');
                    process.exit(1);
                }
                
                const reconnectDelay = Math.floor(Math.random() * 30000) + 30000;
                log('WARN', `🔄 Connection closed, reconnecting in ${reconnectDelay/1000} seconds...`);
                setTimeout(startBot, reconnectDelay);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Handle messages (keep your existing message handling code here)
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            
            const msg = messages[0];
            if (!msg.message) return;
            
            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const isGroup = from.endsWith('@g.us');
            const text = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         '';

            if (!text) return;

            console.log(`📨 ${isGroup ? '[GROUP]' : '[DM]'} ${sender.split('@')[0]}: ${text.substring(0, 50)}`);

            // Your existing message handling code continues here...
            // (I'm not including all the commands for brevity, but they stay the same)
        });

    } catch (error) {
        log('ERROR', `💥 Error: ${error.message}`);
        console.error(error);
        
        const errorDelay = Math.floor(Math.random() * 30000) + 30000;
        log('WARN', `🔄 Error occurred, reconnecting in ${errorDelay/1000} seconds...`);
        setTimeout(startBot, errorDelay);
    }
}

// Clean up old data
setInterval(() => {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);
    
    for (const key of userRateLimits.keys()) {
        if (!key.includes(`-${minute}`) && !key.includes(`-${hour}`)) {
            userRateLimits.delete(key);
        }
    }
    for (const key of groupRateLimits.keys()) {
        if (!key.includes(`-${minute}`)) {
            groupRateLimits.delete(key);
        }
    }
    
    for (const [user, data] of pendingDownloads.entries()) {
        if (now - data.timestamp > 120000) {
            pendingDownloads.delete(user);
        }
    }
    
    for (const [code, data] of pendingPairs.entries()) {
        if (now - data.time > 600000) {
            pendingPairs.delete(code);
        }
    }
}, 60000);

// Start the bot
startBot();
