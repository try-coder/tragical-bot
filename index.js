// index.js - Main Bot Entry Point (NO SCHEDULE - 24/7 RESPONSIVE)
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

// Rate limiting stores (keep this for anti-spam)
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
        const qrPath = path.join(publicDir, 'qrcode.png');
        const qrFile = fs.readFileSync(qrPath);
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(qrFile);
    } else if (req.url === '/qr.txt' && fs.existsSync('qrcode.txt')) {
        const qrText = fs.readFileSync('qrcode.txt', 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(qrText);
    } else {
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
                    }
                    .qr-link:hover { background: #ff4444; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 TRAGICAL Bot</h1>
                    <div class="status">✅ BOT IS RUNNING 24/7</div>
                    <p>Bot is active and responding to commands!</p>
                </div>
            </body>
            </html>
        `);
    }
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

// Generate 8-digit code for user pairing
function generatePairCode() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Check rate limits (anti-spam)
function checkRateLimit(userId, groupId = null) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    
    const userKey = `${userId}-${minute}`;
    let userData = userRateLimits.get(userKey) || 0;
    
    if (userData >= 10) { // Max 10 messages per minute
        return false;
    }
    
    userRateLimits.set(userKey, userData + 1);
    
    if (groupId) {
        const groupKey = `${groupId}-${minute}`;
        let groupData = groupRateLimits.get(groupKey) || 0;
        if (groupData >= 20) { // Max 20 messages per minute in group
            return false;
        }
        groupRateLimits.set(groupKey, groupData + 1);
    }
    
    return true;
}

// Clean up old rate limits
setInterval(() => {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    
    for (const key of userRateLimits.keys()) {
        if (!key.includes(`-${minute}`)) {
            userRateLimits.delete(key);
        }
    }
    for (const key of groupRateLimits.keys()) {
        if (!key.includes(`-${minute}`)) {
            groupRateLimits.delete(key);
        }
    }
}, 60000);

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
        log('INFO', '🚀 Starting TRAGICAL Bot (24/7 Mode)...');
        
        // Load official group
        await loadOfficialGroup();

        const { version, isLatest } = await fetchLatestBaileysVersion();
        log('INFO', `📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        const authFolder = process.env.SESSION_FOLDER || 'auth';
        if (!fs.existsSync(authFolder)) {
            fs.mkdirSync(authFolder, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        
        const sock = makeWASocket({
            version,
            logger: Pino({ level: 'silent' }),
            auth: state,
            browser: ['TRAGICAL', 'Chrome', '3.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: true
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
                    color: { dark: '#000000', light: '#ffffff' },
                    width: 400
                });
                
                // Save QR as text
                fs.writeFileSync('qrcode.txt', qr);
                
                const railwayUrl = process.env.RAILWAY_STATIC_URL || `http://localhost:${process.env.PORT || 3000}`;
                console.log(`📱 Open ${railwayUrl} to scan QR code`);
                console.log('='.repeat(60));
            }
            
            if (connection === 'open') {
                console.log('\n' + '✅'.repeat(20));
                console.log('✅ Bot connected successfully!');
                console.log(`🤖 Bot JID: ${sock.user?.id}`);
                console.log('✅ Bot is now responding to commands 24/7');
                console.log('✅'.repeat(20) + '\n');
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut) {
                    log('WARN', '🔄 Connection closed, reconnecting in 5 seconds...');
                    setTimeout(startBot, 5000);
                } else {
                    log('ERROR', '❌ Bot logged out. Delete auth folder and restart.');
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Handle messages - NO SCHEDULE, ALWAYS RESPONDS
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

            // Rate limiting (anti-spam only)
            if (!checkRateLimit(sender, isGroup ? from : null)) {
                console.log('⚠️ Rate limit hit');
                return;
            }

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

            // Handle user pairing (for bot users, not bot connection)
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
                            text: `✅ *PAIRING SUCCESSFUL!* You can now use all bot commands in ANY group!`
                        });
                        
                        if (OFFICIAL_GROUP_JID) {
                            await sock.sendMessage(OFFICIAL_GROUP_JID, { 
                                text: `👤 New user paired: ${user.number}`
                            }).catch(() => {});
                        }
                    } else {
                        await sock.sendMessage(from, { 
                            text: `❌ Code expired! Get a new code by typing /pair in the official group.`
                        });
                        pendingPairs.delete(code);
                    }
                } else {
                    await sock.sendMessage(from, { 
                        text: `❌ Invalid code! Join ${WHATSAPP_GROUP} and type /pair to get a valid code.`
                    });
                }
                return;
            }

            // Handle commands - ALL COMMANDS HERE
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
│  ✦ *PUBLIC COMMANDS* ✦
│  📋 /menu     - Show this menu
│  ℹ️ /info     - Bot info
│  👤 /role     - Your profile
│  🎵 /play     - Search music
│  🔐 /pair     - Get pairing code
│  🏓 /ping     - Check response
│                            
│  ✦ *PAIRED COMMANDS* ✦
│  👢 /kick     - Kick user
│  ➕ /add      - Add members
│  🏢 /officialinfo - Group info
│                            
│  ✦ *OWNER COMMANDS* ✦
│  ⚙️ /setofficial - Set official group
╰─────────────────────────╯

🌐 WhatsApp › ${WHATSAPP_GROUP}`;

                        if (botImage) {
                            await sock.sendMessage(from, { 
                                image: botImage,
                                caption: menuText
                            });
                        } else {
                            await sock.sendMessage(from, { text: menuText });
                        }
                        break;

                    case 'info':
                        const totalUsers = await User.countDocuments();
                        const infoText = `*🤖 TRAGICAL BOT*

👨‍💻 Dev: @${OWNER_NUMBER}
👥 Users: ${totalUsers}
📱 Status: 24/7 Online

📱 WhatsApp: ${WHATSAPP_GROUP}
💬 Discord: ${DISCORD_SERVER}`;

                        if (botImage) {
                            await sock.sendMessage(from, { 
                                image: botImage,
                                caption: infoText,
                                mentions: [sender]
                            });
                        } else {
                            await sock.sendMessage(from, { text: infoText });
                        }
                        break;

                    case 'play':
                        if (!args.length) {
                            await sock.sendMessage(from, { text: '❌ Usage: /play <song name>' });
                            return;
                        }
                        
                        const query = args.join(' ');
                        await sock.sendPresenceUpdate('composing', from);
                        
                        const video = await searchYouTube(query);
                        
                        if (!video) {
                            await sock.sendMessage(from, { 
                                react: { text: '❌', key: msg.key }
                            }).catch(() => {});
                            await sock.sendMessage(from, { text: '❌ No results found' });
                            return;
                        }
                        
                        const thumbnail = await downloadImage(video.thumbnail);
                        
                        pendingDownloads.set(sender, {
                            video: video,
                            timestamp: Date.now(),
                            originalKey: msg.key
                        });
                        
                        const resultText = `🎵 *${video.title}*

⏱️ ${video.duration}
🎤 ${video.channelName}
👁️ ${video.views}

🔗 ${video.url}

1️⃣ Audio
2️⃣ Document
0️⃣ Cancel`;

                        if (thumbnail) {
                            await sock.sendMessage(from, {
                                image: thumbnail,
                                caption: resultText
                            });
                        } else {
                            await sock.sendMessage(from, { text: resultText });
                        }
                        
                        setTimeout(() => {
                            if (pendingDownloads.has(sender)) {
                                pendingDownloads.delete(sender);
                            }
                        }, 120000);
                        break;

                    case 'pair':
                        if (user.paired) {
                            await sock.sendMessage(from, { text: '✅ You are already paired!' });
                            return;
                        }
                        
                        if (isGroup) {
                            if (OFFICIAL_GROUP_JID && from !== OFFICIAL_GROUP_JID) {
                                await sock.sendMessage(from, { 
                                    text: `❌ Join official group first:\n${WHATSAPP_GROUP}`
                                });
                                return;
                            }
                            
                            const pairCode = generatePairCode();
                            pendingPairs.set(pairCode, {
                                jid: sender,
                                time: Date.now()
                            });
                            
                            await sock.sendMessage(from, { 
                                text: `🔐 *YOUR CODE:* ${pairCode}\n\nDM me this code to pair!`
                            });
                            
                            setTimeout(() => {
                                pendingPairs.delete(pairCode);
                            }, 600000);
                        } else {
                            await sock.sendMessage(from, { 
                                text: `❌ Get code from official group first:\n${WHATSAPP_GROUP}`
                            });
                        }
                        break;

                    case 'role':
                        const roleText = `👤 *${user.name}*
📱 ${user.number}
👑 ${isOwner ? 'OWNER' : user.role}
🔗 ${user.paired ? '✅ Paired' : '❌ Unpaired'}`;
                        await sock.sendMessage(from, { text: roleText });
                        break;

                    case 'kick':
                        if (!user.paired && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be paired' });
                            return;
                        }
                        
                        if (!isGroup) {
                            await sock.sendMessage(from, { text: '❌ Groups only' });
                            return;
                        }
                        
                        if (!isGroupAdmin && !isGroupOwner && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be admin' });
                            return;
                        }
                        
                        const metadata = await sock.groupMetadata(from);
                        const botParticipant = metadata.participants.find(p => p.id === sock.user?.id);
                        if (!botParticipant?.admin) {
                            await sock.sendMessage(from, { text: '❌ Bot needs to be admin' });
                            return;
                        }
                        
                        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                        if (!mentions.length) {
                            await sock.sendMessage(from, { text: '❌ Mention user: /kick @user' });
                            return;
                        }
                        
                        for (const target of mentions) {
                            try {
                                await sock.groupParticipantsUpdate(from, [target], 'remove');
                                await sock.sendMessage(from, { 
                                    text: `✅ Kicked @${target.split('@')[0]}`,
                                    mentions: [target]
                                });
                            } catch (error) {
                                log('ERROR', `Failed to kick: ${error.message}`);
                            }
                        }
                        break;

                    case 'add':
                        if (!user.paired && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be paired' });
                            return;
                        }
                        
                        if (!isGroup) {
                            await sock.sendMessage(from, { text: '❌ Groups only' });
                            return;
                        }
                        
                        if (!isGroupAdmin && !isGroupOwner && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be admin' });
                            return;
                        }
                        
                        const numbers = args.filter(num => /^\d+$/.test(num));
                        if (!numbers.length) {
                            await sock.sendMessage(from, { text: '❌ Usage: /add 254712345678' });
                            return;
                        }
                        
                        let added = 0;
                        for (const num of numbers) {
                            try {
                                await sock.groupParticipantsUpdate(from, [`${num}@s.whatsapp.net`], 'add');
                                added++;
                            } catch (error) {
                                log('ERROR', `Failed to add ${num}`);
                            }
                        }
                        
                        await sock.sendMessage(from, { text: `✅ Added ${added} members` });
                        break;

                    case 'officialinfo':
                        if (!user.paired && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be paired' });
                            return;
                        }
                        
                        if (!OFFICIAL_GROUP_JID) {
                            await sock.sendMessage(from, { text: '❌ Official group not set' });
                            return;
                        }
                        
                        try {
                            const metadata = await sock.groupMetadata(OFFICIAL_GROUP_JID);
                            await sock.sendMessage(from, { 
                                text: `🏢 *Official Group*\n📛 ${metadata.subject}\n👥 ${metadata.participants.length} members`
                            });
                        } catch (error) {
                            await sock.sendMessage(from, { text: '❌ Error fetching group info' });
                        }
                        break;

                    case 'setofficial':
                        if (!isOwner) {
                            await sock.sendMessage(from, { text: '❌ Owner only' });
                            return;
                        }
                        
                        if (!isGroup) {
                            await sock.sendMessage(from, { text: '❌ Use this in the group you want to set as official' });
                            return;
                        }
                        
                        const metadata = await sock.groupMetadata(from);
                        await saveOfficialGroup(from, metadata.subject);
                        await sock.sendMessage(from, { 
                            text: `✅ Official group set to: ${metadata.subject}`
                        });
                        break;

                    default:
                        await sock.sendMessage(from, { text: '❓ Unknown command. Try /menu' });
                }
            }
        });

    } catch (error) {
        log('ERROR', `💥 Error: ${error.message}`);
        setTimeout(startBot, 5000);
    }
}

// Clean up old pending downloads
setInterval(() => {
    const now = Date.now();
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
