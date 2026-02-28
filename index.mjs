// index.mjs - Main Bot Entry Point (RapidAPI + Fixed /role)
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import makeWASocket from '@whiskeysockets/baileys';
import { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  downloadContentFromMessage 
} from '@whiskeysockets/baileys';
import Pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import axios from 'axios';
import connectDB from './config/database.js';
import { log } from './utils/logger.js';
import User from './models/User.js';
import Settings from './models/Settings.js';
import fs from 'fs';
import http from 'http';

// Constants
const BOT_PIC = "https://i.pinimg.com/736x/e8/2a/ca/e82acad97e2c9e1825f164b8e6903a4a.jpg";
const WHATSAPP_GROUP = "https://chat.whatsapp.com/L6YoHagKWjD1oEQUKvAZUx?mode=gi_t";
const DISCORD_SERVER = "discord.gg/Hc3nwWJyep";
const OWNER_NUMBER = "7989176070256";
const BOT_PHONE = "254787031145";

// RAPIDAPI (YOUR KEY)
const RAPIDAPI_KEY = 'c7f357aac3mshae2dac7f0a2e9c4p1c7a0fjsn5c292ac37fc3';
const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';

// Store pending downloads and pairs
const pendingDownloads = new Map();
const pendingPairs = new Map();

// Group settings
const antilinkGroups = new Set();
const antispamGroups = new Set();
const userWarnings = new Map();

// Official group JID
let OFFICIAL_GROUP_JID = null;
let OFFICIAL_GROUP_NAME = "TRAGICAL Official";
let OFFICIAL_GROUP_ICON = null;

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
                    
                    <h2>📱 SCAN QR CODE TO CONNECT</h2>
                    
                    <div class="qr-box">
                        <img src="/qr.png" alt="QR Code" style="max-width: 300px;" id="qrImage">
                    </div>
                    
                    <div>
                        <a href="/qr.png" class="qr-link" download>📥 Download QR</a>
                        <a href="/qr.txt" class="qr-link" target="_blank">📋 View Text</a>
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
                    
                    <script>
                        setInterval(() => {
                            document.getElementById('qrImage').src = '/qr.png?' + new Date().getTime();
                        }, 30000);
                    </script>
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

// Check rate limits
function checkRateLimit(userId, groupId = null) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    
    const userKey = `${userId}-${minute}`;
    let userData = userRateLimits.get(userKey) || 0;
    
    if (userData >= 10) {
        return false;
    }
    
    userRateLimits.set(userKey, userData + 1);
    
    if (groupId) {
        const groupKey = `${groupId}-${minute}`;
        let groupData = groupRateLimits.get(groupKey) || 0;
        if (groupData >= 20) {
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
            timeout: 10000,
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

// RAPIDAPI SEARCH FUNCTION (FIXED)
async function searchYouTubeViaRapid(query) {
    try {
        const options = {
            method: 'GET',
            url: 'https://youtube-search-and-download.p.rapidapi.com/search',
            params: {
                q: query,
                type: 'v'
            },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'youtube-search-and-download.p.rapidapi.com'
            },
            timeout: 10000
        };

        const response = await axios.request(options);
        
        if (response.data?.contents?.length > 0) {
            const video = response.data.contents[0]?.video;
            if (video) {
                return {
                    videoId: video.videoId,
                    title: video.title,
                    channelName: video.author,
                    channelSubs: video.subscriberCountText || 'N/A',
                    views: video.viewCountText || 'N/A',
                    duration: video.lengthText || 'N/A',
                    publishedAt: video.publishedTimeText || 'N/A',
                    thumbnail: video.thumbnails[0]?.url || '',
                    url: `https://youtube.com/watch?v=${video.videoId}`
                };
            }
        }
        return null;
    } catch (error) {
        log('ERROR', `RapidAPI Search error: ${error.message}`);
        return null;
    }
}

// RAPIDAPI DOWNLOAD FUNCTION (FIXED)
async function downloadViaRapid(videoId) {
    try {
        const options = {
            method: 'GET',
            url: 'https://youtube-mp36.p.rapidapi.com/dl',
            params: { id: videoId },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST
            },
            timeout: 30000
        };

        const response = await axios.request(options);
        
        if (response.data?.status === 'ok' && response.data?.link) {
            const fileResponse = await axios.get(response.data.link, { 
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const filename = `${response.data.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}.mp3`;
            
            return {
                success: true,
                buffer: Buffer.from(fileResponse.data),
                filename: filename,
                title: response.data.title
            };
        }
        return { success: false, error: 'No download link' };
    } catch (error) {
        log('ERROR', `RapidAPI Download error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Download view-once media
async function downloadViewOnceMessage(msg) {
    try {
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return null;
        
        const quotedMsg = contextInfo.quotedMessage;
        let mediaType, stream;
        
        if (quotedMsg.imageMessage) {
            mediaType = 'image';
            stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
        } else if (quotedMsg.videoMessage) {
            mediaType = 'video';
            stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
        } else {
            return null;
        }
        
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        return {
            buffer,
            type: mediaType,
            caption: quotedMsg.imageMessage?.caption || quotedMsg.videoMessage?.caption || ''
        };
    } catch (error) {
        log('ERROR', `Failed to download view-once: ${error.message}`);
        return null;
    }
}

async function startBot() {
    try {
        log('INFO', '🚀 Starting TRAGICAL Bot with RapidAPI...');
        
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
            browser: ['TRAGICAL', 'Chrome', '3.0.0']
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;
            
            if (qr) {
                console.log('\n' + '='.repeat(60));
                console.log('📱 NEW QR CODE GENERATED');
                console.log('='.repeat(60));
                
                try {
                    const qrPath = path.join(publicDir, 'qrcode.png');
                    await QRCode.toFile(qrPath, qr, {
                        color: { dark: '#000000', light: '#ffffff' },
                        width: 400
                    });
                    fs.writeFileSync('qrcode.txt', qr);
                    const railwayUrl = process.env.RAILWAY_STATIC_URL || `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'}`;
                    console.log(`📱 QR Code saved! Open ${railwayUrl} to scan`);
                } catch (qrError) {
                    console.log('❌ Failed to save QR:', qrError.message);
                }
                
                qrcode.generate(qr, { small: true });
                console.log('='.repeat(60));
            }
            
            if (connection === 'open') {
                console.log('\n' + '✅'.repeat(20));
                console.log('✅ Bot connected successfully!');
                console.log(`🤖 Bot JID: ${sock.user?.id}`);
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
                console.log('⚠️ Rate limit hit');
                return;
            }

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

            let isGroupAdmin = false;
            let isGroupOwner = false;
            
            if (isGroup) {
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const participant = groupMetadata.participants.find(p => p.id === sender);
                    isGroupAdmin = participant?.admin === 'admin';
                    isGroupOwner = participant?.admin === 'superadmin';
                } catch (error) {
                    log('ERROR', `Failed to get group metadata: ${error.message}`);
                }
            }

            // Handle .cc command for view-once messages
            if (text === '.cc' && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                if (!user.paired && !isOwner) {
                    await sock.sendMessage(from, { text: '❌ You need to be paired to use this command' });
                    return;
                }
                
                const media = await downloadViewOnceMessage(msg);
                if (media) {
                    if (media.type === 'image') {
                        await sock.sendMessage(from, {
                            image: media.buffer,
                            caption: media.caption || '📸 View once media recovered'
                        });
                    } else if (media.type === 'video') {
                        await sock.sendMessage(from, {
                            video: media.buffer,
                            caption: media.caption || '🎥 View once media recovered'
                        });
                    }
                } else {
                    await sock.sendMessage(from, { text: '❌ Could not recover media' });
                }
                return;
            }

            // Handle download responses with RapidAPI
            if (pendingDownloads.has(sender) && /^[12]$/.test(text)) {
                const downloadData = pendingDownloads.get(sender);
                const choice = parseInt(text);
                
                if (downloadData.originalKey) {
                    await sock.sendMessage(from, {
                        react: {
                            text: '⏳',
                            key: downloadData.originalKey
                        }
                    }).catch(() => {});
                }
                
                const result = await downloadViaRapid(downloadData.video.videoId);
                
                if (result.success && result.buffer) {
                    if (choice === 1) {
                        await sock.sendMessage(from, {
                            audio: result.buffer,
                            mimetype: 'audio/mpeg',
                            fileName: result.filename
                        });
                    } else {
                        await sock.sendMessage(from, {
                            document: result.buffer,
                            mimetype: 'audio/mpeg',
                            fileName: result.filename,
                            caption: `📄 ${downloadData.video.title}`
                        });
                    }
                    
                    if (downloadData.originalKey) {
                        await sock.sendMessage(from, {
                            react: {
                                text: '✅',
                                key: downloadData.originalKey
                            }
                        }).catch(() => {});
                    }
                } else {
                    await sock.sendMessage(from, { 
                        text: `❌ *Download Failed*\n\n🎵 ${downloadData.video.title}\n🔗 ${downloadData.video.url}\n\n💡 Try downloading directly from the link above.`
                    });
                    
                    if (downloadData.originalKey) {
                        await sock.sendMessage(from, {
                            react: {
                                text: '❌',
                                key: downloadData.originalKey
                            }
                        }).catch(() => {});
                    }
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

            // Handle user pairing
            if (!isGroup && /^\d{8}$/.test(text)) {
                const code = text;
                const pairData = pendingPairs.get(code);
                
                if (pairData && pairData.jid === sender) {
                    const timeDiff = Date.now() - pairData.time;
                    
                    if (timeDiff < 600000) {
                        user.paired = true;
                        user.role = 'regular';
                        user.pairedSince = Date.now();
                        await user.save();
                        
                        pendingPairs.delete(code);
                        
                        await sock.sendMessage(from, { 
                            text: `✅ *PAIRING SUCCESSFUL!*\n\nYou can now use all bot commands in ANY group!\n\nTry /menu to see available commands.`
                        });
                        
                        if (OFFICIAL_GROUP_JID) {
                            await sock.sendMessage(OFFICIAL_GROUP_JID, { 
                                text: `👤 *New user paired!*\n📱 ${user.number}\n👤 ${user.name || 'Unknown'}`
                            }).catch(() => {});
                        }
                    } else {
                        await sock.sendMessage(from, { 
                            text: `❌ *Code expired!*\n\nGet a new code by typing /pair in the official group.`
                        });
                        pendingPairs.delete(code);
                    }
                } else {
                    await sock.sendMessage(from, { 
                        text: `❌ *Invalid code!*\n\nJoin ${WHATSAPP_GROUP} and type /pair to get a valid code.`
                    });
                }
                return;
            }

            // Handle commands
            if (text.startsWith(process.env.PREFIX)) {
                const args = text.slice(1).trim().split(/ +/);
                const command = args.shift().toLowerCase();
                
                log('INFO', `⚡ Command: ${command} from ${user.number}`);

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
                    case 'antilink': reaction = '🔗'; break;
                    case 'antispam': reaction = '🚫'; break;
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
│  🎵 /play     - Search & download music
│  🔐 /pair     - Get pairing code
│  🏓 /ping     - Check response
│  📸 .cc       - Recover view once
│                            
│  ✦ *PAIRED COMMANDS* ✦
│  👢 /kick     - Kick user (group admin)
│  ➕ /add      - Add members (numbers)
│  🏢 /officialinfo - Official group info
│  🔗 /antilink - Toggle anti-link
│  🚫 /antispam - Toggle anti-spam
│                            
│  ✦ *OWNER COMMANDS* ✦
│  ⚙️ /setofficial - Set official group
╰─────────────────────────╯

🌐 WhatsApp › ${WHATSAPP_GROUP}
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

                    case 'info':
                        const totalUsers = await User.countDocuments();
                        const infoText = `*🤖 TRAGICAL BOT*

👨‍💻 Dev: @${OWNER_NUMBER}
👥 Users: ${totalUsers}
📱 Status: 24/7 Online
🎵 Download: RapidAPI

📱 WhatsApp: ${WHATSAPP_GROUP}
💬 Discord: ${DISCORD_SERVER}

✨ Features:
• YouTube Downloads
• View Once Recovery
• Anti-Link Protection
• Anti-Spam System
• Group Moderation`;

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

                    // FIXED: /role now properly handles user lookup
                    case 'role':
                        let targetUser = user;
                        let targetSender = sender;
                        let targetName = user.name;
                        
                        if (args.length) {
                            const lookup = args[0];
                            
                            // Check if it's a mention
                            if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                                targetSender = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                                targetUser = await User.findOne({ jid: targetSender });
                                targetName = targetSender.split('@')[0];
                            } 
                            // Check if it's a phone number
                            else if (/^\d+$/.test(lookup) && lookup.length >= 10) {
                                targetSender = `${lookup}@s.whatsapp.net`;
                                targetUser = await User.findOne({ jid: targetSender });
                                targetName = lookup;
                            }
                        }
                        
                        // If user not found in DB, create temporary object
                        if (!targetUser) {
                            targetUser = {
                                name: targetName || 'Unknown',
                                number: targetSender.split('@')[0],
                                role: 'regular',
                                paired: false,
                                pairedSince: null,
                                usageCount: 0,
                                warningCount: 0,
                                totalGroups: 0
                            };
                        }
                        
                        let targetPic = null;
                        try {
                            const picUrl = await sock.profilePictureUrl(targetSender, 'image');
                            if (picUrl) {
                                const response = await axios.get(picUrl, { responseType: 'arraybuffer', timeout: 5000 });
                                targetPic = Buffer.from(response.data, 'binary');
                            }
                        } catch (e) {}
                        
                        const isTargetOwner = targetUser.number === OWNER_NUMBER;
                        const pairedSince = targetUser.pairedSince ? new Date(targetUser.pairedSince).toLocaleDateString() : 'Not paired';
                        
                        const roleText = `*✧ USER PROFILE ✧*

👤 *Name:* ${targetUser.name}
📱 *Number:* ${targetUser.number}
👑 *Role:* ${isTargetOwner ? '🌟 OWNER' : targetUser.role}
🔗 *Status:* ${targetUser.paired ? '✅ Paired' : '❌ Unpaired'}
📅 *Paired:* ${pairedSince}
📊 *Commands:* ${targetUser.usageCount}
⚠️ *Warnings:* ${targetUser.warningCount}`;

                        if (targetPic) {
                            await sock.sendMessage(from, { 
                                image: targetPic,
                                caption: roleText
                            });
                        } else if (botImage) {
                            await sock.sendMessage(from, { 
                                image: botImage,
                                caption: roleText
                            });
                        } else {
                            await sock.sendMessage(from, { text: roleText });
                        }
                        break;

                    case 'play':
                        if (!args.length) {
                            await sock.sendMessage(from, { text: '❌ Usage: /play <song name>' });
                            return;
                        }
                        
                        const query = args.join(' ');
                        await sock.sendPresenceUpdate('composing', from);
                        
                        const video = await searchYouTubeViaRapid(query);
                        
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

⏱️ *Duration:* ${video.duration}
🎤 *Artist:* ${video.channelName}
👁️ *Views:* ${video.views}

🔗 ${video.url}

*Select option:*
1️⃣ 🎵 Audio
2️⃣ 📄 Document
0️⃣ ❌ Cancel

⏰ *Expires in 2 minutes*`;

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

                    case 'antilink':
                        if (!user.paired && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be paired' });
                            return;
                        }
                        
                        if (!isGroup) {
                            await sock.sendMessage(from, { text: '❌ This command only works in groups' });
                            return;
                        }
                        
                        if (!isGroupAdmin && !isGroupOwner && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be a group admin' });
                            return;
                        }
                        
                        if (args[0] === 'on') {
                            antilinkGroups.add(from);
                            await sock.sendMessage(from, { text: '🔗 *Anti-Link Enabled*\n\nLinks will be automatically deleted.' });
                        } else if (args[0] === 'off') {
                            antilinkGroups.delete(from);
                            await sock.sendMessage(from, { text: '🔗 *Anti-Link Disabled*' });
                        } else {
                            const status = antilinkGroups.has(from) ? '✅ Enabled' : '❌ Disabled';
                            await sock.sendMessage(from, { text: `🔗 *Anti-Link Status:* ${status}\n\nUse /antilink on or /antilink off` });
                        }
                        break;

                    case 'antispam':
                        if (!user.paired && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be paired' });
                            return;
                        }
                        
                        if (!isGroup) {
                            await sock.sendMessage(from, { text: '❌ This command only works in groups' });
                            return;
                        }
                        
                        if (!isGroupAdmin && !isGroupOwner && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be a group admin' });
                            return;
                        }
                        
                        if (args[0] === 'on') {
                            antispamGroups.add(from);
                            await sock.sendMessage(from, { text: '🚫 *Anti-Spam Enabled*\n\nSpammers will be warned and kicked.' });
                        } else if (args[0] === 'off') {
                            antispamGroups.delete(from);
                            await sock.sendMessage(from, { text: '🚫 *Anti-Spam Disabled*' });
                        } else {
                            const status = antispamGroups.has(from) ? '✅ Enabled' : '❌ Disabled';
                            await sock.sendMessage(from, { text: `🚫 *Anti-Spam Status:* ${status}\n\nUse /antispam on or /antispam off` });
                        }
                        break;

                    case 'pair':
                        if (user.paired) {
                            await sock.sendMessage(from, { text: '✅ You are already paired!' });
                            return;
                        }
                        
                        if (isGroup) {
                            if (OFFICIAL_GROUP_JID && from !== OFFICIAL_GROUP_JID) {
                                await sock.sendMessage(from, { 
                                    text: `❌ *Wrong place!*\n\nJoin our official group first:\n${WHATSAPP_GROUP}`
                                });
                                return;
                            }
                            
                            const pairCode = generatePairCode();
                            pendingPairs.set(pairCode, {
                                jid: sender,
                                time: Date.now()
                            });
                            
                            await sock.sendMessage(from, { 
                                text: `🔐 *YOUR PAIRING CODE*

\`${pairCode}\`

📋 *INSTRUCTIONS:*
1️⃣ Copy this code
2️⃣ DM me at ${BOT_PHONE}
3️⃣ Paste the code there

⏰ *Expires in 10 minutes*`
                            });
                            
                            setTimeout(() => {
                                pendingPairs.delete(pairCode);
                            }, 600000);
                        } else {
                            await sock.sendMessage(from, { 
                                text: `❌ *No code found in DM*

Get a code from the official group first:\n${WHATSAPP_GROUP}`
                            });
                        }
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
                        
                        const groupInfo = await sock.groupMetadata(from);
                        const botInGroup = groupInfo.participants.find(p => p.id === sock.user?.id);
                        if (!botInGroup?.admin) {
                            await sock.sendMessage(from, { text: '❌ Bot needs to be admin' });
                            return;
                        }
                        
                        let targets = [];
                        
                        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                        if (mentions.length > 0) {
                            targets = mentions;
                        } else if (args[0] === 'all') {
                            if (!isOwner) {
                                await sock.sendMessage(from, { text: '❌ Only bot owner can kick all members' });
                                return;
                            }
                            targets = groupInfo.participants
                                .filter(p => !p.admin && p.id !== sock.user?.id)
                                .map(p => p.id);
                        } else if (/^\d+$/.test(args[0])) {
                            targets = [`${args[0]}@s.whatsapp.net`];
                        } else {
                            await sock.sendMessage(from, { text: '❌ Usage: /kick @user or /kick <number> or /kick all' });
                            return;
                        }
                        
                        if (targets.length === 0) {
                            await sock.sendMessage(from, { text: '❌ No valid users to kick' });
                            return;
                        }
                        
                        let kickedCount = 0;
                        let failedCount = 0;
                        
                        for (const target of targets) {
                            try {
                                if (target === sock.user?.id || target === sender) continue;
                                
                                await sock.groupParticipantsUpdate(from, [target], 'remove');
                                kickedCount++;
                                
                                await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
                            } catch (error) {
                                failedCount++;
                                log('ERROR', `Failed to kick ${target}: ${error.message}`);
                            }
                        }
                        
                        await sock.sendMessage(from, { 
                            text: `👢 *Kick Results*\n✅ Kicked: ${kickedCount}\n❌ Failed: ${failedCount}`
                        });
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
                        
                        const addGroup = await sock.groupMetadata(from);
                        const botInAddGroup = addGroup.participants.find(p => p.id === sock.user?.id);
                        if (!botInAddGroup?.admin) {
                            await sock.sendMessage(from, { text: '❌ Bot needs to be admin' });
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
                            const officialGroup = await sock.groupMetadata(OFFICIAL_GROUP_JID);
                            const admins = officialGroup.participants.filter(p => p.admin).length;
                            const owner = officialGroup.participants.find(p => p.admin === 'superadmin');
                            const ownerNumber = owner ? owner.id.split('@')[0] : 'Unknown';
                            
                            let groupIcon = null;
                            try {
                                const iconUrl = await sock.profilePictureUrl(OFFICIAL_GROUP_JID, 'image');
                                if (iconUrl) {
                                    groupIcon = await downloadImage(iconUrl);
                                }
                            } catch (e) {}
                            
                            const officialText = `*🏢 OFFICIAL GROUP INFO*

📛 *Name:* ${officialGroup.subject}
👥 *Members:* ${officialGroup.participants.length}
👑 *Admins:* ${admins}
👤 *Owner:* @${ownerNumber}
🔗 *Status:* Active

💡 *Users must be in this group to pair*`;

                            if (groupIcon) {
                                await sock.sendMessage(from, {
                                    image: groupIcon,
                                    caption: officialText,
                                    mentions: [owner?.id]
                                });
                            } else if (botImage) {
                                await sock.sendMessage(from, {
                                    image: botImage,
                                    caption: officialText
                                });
                            } else {
                                await sock.sendMessage(from, { text: officialText });
                            }
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
                        
                        const officialMeta = await sock.groupMetadata(from);
                        await saveOfficialGroup(from, officialMeta.subject);
                        await sock.sendMessage(from, { 
                            text: `✅ *Official Group Set!*\n\n📛 ${officialMeta.subject}\n👥 ${officialMeta.participants.length} members`
                        });
                        break;

                    default:
                        await sock.sendMessage(from, { text: '❓ Unknown command. Try /menu' });
                }
            }

            // Auto Anti-Link detection
            if (isGroup && antilinkGroups.has(from) && !isGroupAdmin && !isGroupOwner && !isOwner) {
                const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com|t\.me|discord\.gg)/i;
                if (linkRegex.test(text)) {
                    try {
                        await sock.sendMessage(from, {
                            delete: {
                                id: msg.key.id,
                                participant: sender,
                                remoteJid: from,
                                fromMe: false
                            }
                        });
                        
                        const warningKey = `${from}-${sender}`;
                        const warningData = userWarnings.get(warningKey) || { count: 0, lastWarn: 0 };
                        
                        if (Date.now() - warningData.lastWarn > 60000) {
                            warningData.count = 1;
                        } else {
                            warningData.count++;
                        }
                        warningData.lastWarn = Date.now();
                        userWarnings.set(warningKey, warningData);
                        
                        if (warningData.count >= 3) {
                            await sock.groupParticipantsUpdate(from, [sender], 'remove');
                            await sock.sendMessage(from, { 
                                text: `👢 @${sender.split('@')[0]} was kicked for posting links after warnings`,
                                mentions: [sender]
                            });
                            userWarnings.delete(warningKey);
                        } else {
                            await sock.sendMessage(from, {
                                text: `⚠️ @${sender.split('@')[0]} No links allowed! Warning ${warningData.count}/3`,
                                mentions: [sender]
                            });
                        }
                    } catch (e) {}
                }
            }

            // Auto Anti-Spam detection
            if (isGroup && antispamGroups.has(from) && !isGroupAdmin && !isGroupOwner && !isOwner) {
                const spamKey = `${from}-${sender}`;
                const spamData = userWarnings.get(spamKey) || { count: 0, lastMsg: 0 };
                
                if (Date.now() - spamData.lastMsg < 2000) {
                    spamData.count++;
                    
                    if (spamData.count >= 5) {
                        try {
                            await sock.groupParticipantsUpdate(from, [sender], 'remove');
                            await sock.sendMessage(from, { 
                                text: `👢 @${sender.split('@')[0]} was kicked for spamming`,
                                mentions: [sender]
                            });
                            userWarnings.delete(spamKey);
                        } catch (e) {}
                    } else if (spamData.count >= 3) {
                        await sock.sendMessage(from, {
                            text: `⚠️ @${sender.split('@')[0]} Stop spamming! Warning ${spamData.count-2}/3`,
                            mentions: [sender]
                        });
                    }
                } else {
                    spamData.count = 0;
                }
                
                spamData.lastMsg = Date.now();
                userWarnings.set(spamKey, spamData);
            }
        });

    } catch (error) {
        log('ERROR', `💥 Error: ${error.message}`);
        setTimeout(startBot, 5000);
    }
}

// Clean up old data
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
    
    for (const [key, data] of userWarnings.entries()) {
        if (now - data.lastWarn > 3600000) {
            userWarnings.delete(key);
        }
    }
}, 60000);

// Start the bot
startBot();
