// index.js - Main Bot Entry Point
require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const qrcode = require('qrcode-terminal');
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

// Create HTTP server for Railway (keeps bot alive)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>TRAGICAL Bot</title>
            <style>
                body { background: #000; color: #ff0000; font-family: monospace; padding: 20px; }
                h1 { color: #ff0000; }
                .qr { background: #fff; padding: 20px; display: inline-block; }
            </style>
        </head>
        <body>
            <h1>🤖 TRAGICAL Bot is Running!</h1>
            <p>Status: ✅ Online</p>
            <p>📱 Check Railway logs for QR code</p>
        </body>
        </html>
    `);
});
server.listen(process.env.PORT || 3000);
console.log('🌐 Web server started on port', process.env.PORT || 3000);

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
                console.log('📱 TRAGICAL BOT - SCAN THIS QR CODE');
                console.log('='.repeat(60));
                console.log('\n1️⃣ Open WhatsApp on your phone');
                console.log('2️⃣ Tap Menu (3 dots) or Settings');
                console.log('3️⃣ Go to "Linked Devices"');
                console.log('4️⃣ Tap "Link a Device"');
                console.log('5️⃣ Scan this QR code:\n');
                
                // Generate QR code in terminal
                qrcode.generate(qr, { small: true });
                
                // Also log the QR as text for Railway logs
                console.log('\n📱 QR Code Text (use with QR generator):');
                console.log(qr);
                console.log('\n' + '='.repeat(60));
                console.log('⏳ Waiting for scan...\n');
            }
            
            if (connection === 'open') {
                console.log('\n' + '='.repeat(60));
                log('SUCCESS', '✅ Bot connected successfully!');
                console.log(`🤖 Bot JID: ${sock.user?.id}`);
                console.log(`👥 Official Group: ${OFFICIAL_GROUP_NAME || 'Not set'}`);
                console.log('='.repeat(60) + '\n');
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

        // Handle messages
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

            if (!checkRateLimit(sender, isGroup ? from : null)) {
                console.log('⚠️ Rate limit hit for:', sender.split('@')[0]);
                return;
            }

            await humanDelay();

            // Find or create user
            let user = await User.findOne({ jid: sender });
            if (!user) {
                user = new User({
                    jid: sender,
                    number: sender.split('@')[0],
                    name: msg.pushName || 'Unknown'
                });
                await user.save();
                log('INFO', `👤 New user: ${user.number}`);
            }

            // Check if user is owner
            const isOwner = user.number === OWNER_NUMBER;
            
            if (isOwner && !user.paired) {
                user.paired = true;
                user.role = 'owner';
                user.pairedSince = Date.now();
                await user.save();
            }

            user.lastActive = Date.now();
            user.usageCount += 1;
            await user.save();

            // Get group admin status
            let isGroupAdmin = false;
            let isGroupOwner = false;
            
            if (isGroup) {
                try {
                    const metadata = await sock.groupMetadata(from);
                    const participant = metadata.participants.find(p => p.id === sender);
                    isGroupAdmin = participant?.admin === 'admin';
                    isGroupOwner = participant?.admin === 'superadmin';
                } catch (error) {
                    log('ERROR', `Failed to get group metadata: ${error.message}`);
                }
            }

            // Handle download responses
            if (pendingDownloads.has(sender) && /^[12]$/.test(text)) {
                const downloadData = pendingDownloads.get(sender);
                const choice = parseInt(text);
                
                if (downloadData.originalKey) {
                    await sock.sendMessage(from, {
                        react: {
                            text: '🫰',
                            key: downloadData.originalKey
                        }
                    }).catch(() => {});
                }
                
                await humanDelay();
                
                const audioFile = await downloadViaAPI(downloadData.video.videoId);
                
                if (audioFile) {
                    if (choice === 1) {
                        await sock.sendMessage(from, {
                            audio: audioFile.buffer,
                            mimetype: 'audio/mpeg',
                            fileName: audioFile.filename
                        });
                    } else {
                        await sock.sendMessage(from, {
                            document: audioFile.buffer,
                            mimetype: 'audio/mpeg',
                            fileName: audioFile.filename,
                            caption: `📄 ${downloadData.video.title}`
                        });
                    }
                } else {
                    await sock.sendMessage(from, { 
                        text: `❌ Download failed\n🔗 ${downloadData.video.url}`
                    });
                }
                
                pendingDownloads.delete(sender);
                return;
            }

            if (text === '0' && pendingDownloads.has(sender)) {
                const downloadData = pendingDownloads.get(sender);
                if (downloadData.originalKey) {
                    await sock.sendMessage(from, {
                        react: {
                            text: '❌',
                            key: downloadData.originalKey
                        }
                    }).catch(() => {});
                }
                pendingDownloads.delete(sender);
                return;
            }

            // Handle pairing in DM
            if (!isGroup && /^\d{8}$/.test(text)) {
                const code = text;
                const pairData = pendingPairs.get(code);
                
                if (pairData && pairData.jid === sender) {
                    const timeDiff = Date.now() - pairData.time;
                    
                    if (timeDiff < 600000) {
                        user.paired = true;
                        user.pairedSince = Date.now();
                        await user.save();
                        
                        pendingPairs.delete(code);
                        
                        await sock.sendMessage(from, { 
                            text: `✅ *PAIRING SUCCESSFUL!*

You can now use all bot commands in ANY group!

Try /menu to see available commands

Welcome to TRAGICAL! 🎉` 
                        });
                        
                        if (OFFICIAL_GROUP_JID) {
                            await sock.sendMessage(OFFICIAL_GROUP_JID, { 
                                text: `👤 *New user paired!*\n📱 ${user.number}\n👤 ${user.name || 'Unknown'}` 
                            }).catch(() => {});
                        }
                    } else {
                        await sock.sendMessage(from, { 
                            text: `❌ *Code expired!*

Please get a new code by typing /pair in the official group.

⏰ Codes expire after 10 minutes` 
                        });
                        pendingPairs.delete(code);
                    }
                } else {
                    await sock.sendMessage(from, { 
                        text: `❌ *Invalid code!*

Make sure you:
1️⃣ Joined the official group
2️⃣ Typed /pair there to get a code
3️⃣ Sent the EXACT code here

Group link: ${WHATSAPP_GROUP}` 
                    });
                }
                return;
            }

            // Handle commands
            if (text.startsWith(process.env.PREFIX)) {
                const args = text.slice(1).trim().split(/ +/);
                const command = args.shift().toLowerCase();
                
                log('INFO', `⚡ Command: ${command} from ${user.number}`);

                // React to command
                let reaction = '🤖';
                switch(command) {
                    case 'play': reaction = '⏳'; break;
                    case 'menu': reaction = '📋'; break;
                    case 'info': reaction = 'ℹ️'; break;
                    case 'role': reaction = '👤'; break;
                    case 'kick': reaction = '👢'; break;
                    case 'ping': reaction = '🏓'; break;
                    case 'pair': reaction = '🔐'; break;
                    case 'add': reaction = '➕'; break;
                    case 'officialinfo': reaction = '🏢'; break;
                    case 'setofficial': reaction = '⚙️'; break;
                }
                
                await sock.sendMessage(from, {
                    react: {
                        text: reaction,
                        key: msg.key
                    }
                }).catch(() => {});

                await sock.sendPresenceUpdate('composing', from);
                await humanDelay();

                const botImage = await downloadImage(BOT_PIC);

                switch(command) {
                    case 'ping':
                        const start = Date.now();
                        await sock.sendMessage(from, { text: '🏓 Pong!' });
                        const end = Date.now();
                        await sock.sendMessage(from, { text: `⚡ ${end - start}ms` });
                        break;

                    case 'menu':
                        const menuText = `╭── *✧ TRAGICAL BOT ✧* ──╮
│                            
│  👤 *Status* › ${user.paired ? '✅ Paired' : '❌ Unpaired'}
│  👑 *Role*    › ${isOwner ? '🌟 OWNER' : user.role}
│                            
│  ✦ *ᴘᴜʙʟɪᴄ ᴄᴏᴍᴍᴀɴᴅs* ✦
│  📋 /menu     - Show this menu
│  ℹ️ /info     - Bot info & community
│  👤 /role     - View your profile
│  🎵 /play     - Search & download music
│  🔐 /pair     - Get pairing code
│  🏓 /ping     - Check response time
│                            
│  ✦ *ᴘᴀɪʀᴇᴅ ᴄᴏᴍᴍᴀɴᴅs* ✦
│  👢 /kick     - Kick user (group admin)
│  ➕ /add      - Add members (numbers)
│  🏢 /officialinfo - Official group info
│                            
│  ✦ *ᴏᴡɴᴇʀ ᴄᴏᴍᴍᴀɴᴅs* ✦
│  ⚙️ /setofficial - Set official group
│                            
╰─────────────────────────╯

🌐 *Community*
📱 WhatsApp › ${WHATSAPP_GROUP}
💬 Discord  › ${DISCORD_SERVER}`;

                        if (botImage) {
                            await sock.sendMessage(from, { 
                                image: botImage,
                                caption: menuText
                            });
                        } else {
                            await sock.sendMessage(from, { text: menuText });
                        }
                        break;

                    // ... rest of the commands (keep all the other cases from your original code) ...
                    
                    default:
                        await sock.sendMessage(from, { text: '❓ Unknown command. Try /menu' });
                }
            }
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
