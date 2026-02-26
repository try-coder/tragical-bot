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
                console.clear();
                console.log('\n' + '='.repeat(60));
                console.log('📱 TRAGICAL BOT - SCAN THIS QR CODE');
                console.log('='.repeat(60));
                console.log('\n1️⃣ Open WhatsApp on your phone');
                console.log('2️⃣ Tap Menu (3 dots) or Settings');
                console.log('3️⃣ Go to "Linked Devices"');
                console.log('4️⃣ Tap "Link a Device"');
                console.log('5️⃣ Scan this QR code:\n');
                
                qrcode.generate(qr, { small: true });
                
                console.log('\n' + '='.repeat(60));
                console.log('⏳ Waiting for scan...\n');
            }
            
            if (connection === 'open') {
                console.clear();
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
                    console.log('\n💡 Run: rm -rf auth/ && npm run dev\n');
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

                    case 'info':
                        const totalUsers = await User.countDocuments();
                        const totalCommandsAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: "$usageCount" } } }]);
                        const totalCommands = totalCommandsAgg[0]?.total || 0;
                        
                        const infoText = `*✧ TRAGICAL BOT INFORMATION ✧*

╭──「 *ᴀʙᴏᴜᴛ* 」──
│ 🎯 *Name* › TRAGICAL
│ 👨‍💻 *Dev*  › @${OWNER_NUMBER}
│ 🔧 *Core*  › Baileys MD
│ ⚡ *Ver*   › 3.0.0
╰────────────────

╭──「 *ᴄᴏᴍᴍᴜɴɪᴛʏ* 」──
│ 📱 *WhatsApp*
│ ${WHATSAPP_GROUP}
│
│ 💬 *Discord*
│ ${DISCORD_SERVER}
│
│ 👥 *Users* › ${totalUsers}
│ 📊 *Commands* › ${totalCommands}
╰────────────────

╭──「 *ᴏꜰꜰɪᴄɪᴀʟ ɢʀᴏᴜᴘ* 」──
│ 📛 *Name* › ${OFFICIAL_GROUP_NAME || 'Not set'}
│ 🔗 *Status* › ${OFFICIAL_GROUP_JID ? '✅ Set' : '❌ Not set'}
╰────────────────

💡 *Use /pair to get access*
👑 *Owner-only: /setofficial*`;

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

                    case 'role':
                        let targetUser = user;
                        let targetSender = sender;
                        
                        if (args.length) {
                            const lookup = args[0];
                            const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                            if (mention) {
                                targetSender = mention;
                                targetUser = await User.findOne({ jid: mention });
                            } else if (/^\d+$/.test(lookup)) {
                                targetSender = `${lookup}@s.whatsapp.net`;
                                targetUser = await User.findOne({ jid: targetSender });
                            }
                        }
                        
                        if (!targetUser) {
                            targetUser = {
                                name: 'Unknown',
                                number: targetSender.split('@')[0],
                                role: 'regular',
                                paired: false,
                                usageCount: 0,
                                warningCount: 0,
                                totalGroups: 0
                            };
                        }
                        
                        let targetPic = null;
                        try {
                            const picUrl = await sock.profilePictureUrl(targetSender, 'image');
                            if (picUrl) {
                                const response = await axios.get(picUrl, { responseType: 'arraybuffer' });
                                targetPic = Buffer.from(response.data, 'binary');
                            }
                        } catch (e) {}

                        const isTargetOwner = targetUser.number === OWNER_NUMBER;
                        const pairedSince = targetUser.pairedSince ? new Date(targetUser.pairedSince).toLocaleDateString() : 'Not paired';
                        
                        const roleText = `*✧ USER PROFILE ✧*

👤 *Name* › ${targetUser.name}
📱 *Number* › ${targetUser.number}
👑 *Role* › ${isTargetOwner ? '🌟 OWNER' : targetUser.role}
🔗 *Status* › ${targetUser.paired ? '✅ Paired' : '❌ Unpaired'}
📅 *Paired* › ${pairedSince}
📊 *Commands* › ${targetUser.usageCount}
⚠️ *Warnings* › ${targetUser.warningCount}
👥 *Groups* › ${targetUser.totalGroups}

💡 *Use /pair to get access*`;

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
                            await sock.sendMessage(from, { text: '❌ Usage: /play <song name>\nExample: /play Gimmidat Rayvanny' });
                            return;
                        }
                        
                        const query = args.join(' ');
                        
                        await sock.sendPresenceUpdate('composing', from);
                        
                        const video = await searchYouTube(query);
                        
                        if (!video) {
                            await sock.sendMessage(from, {
                                react: {
                                    text: '❌',
                                    key: msg.key
                                }
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

⏱️ *Duration* › ${video.duration}
🎤 *Artist* › ${video.channelName}
👁️ *Views* › ${video.views}

🔗 ${video.url}

*Select option:*

1️⃣ 🎵 Audio (Play)
2️⃣ 📄 Document (Save)

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

                    case 'kick':
                        if (!user.paired && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be paired to use this command' });
                            return;
                        }
                        
                        if (!isGroup) {
                            await sock.sendMessage(from, { text: '❌ This command can only be used in groups' });
                            return;
                        }
                        
                        if (!isGroupAdmin && !isGroupOwner && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be a group admin to kick members' });
                            return;
                        }
                        
                        const metadata = await sock.groupMetadata(from);
                        const botParticipant = metadata.participants.find(p => p.id === sock.user?.id);
                        if (!botParticipant?.admin) {
                            await sock.sendMessage(from, { text: '❌ Bot needs to be an admin to kick members' });
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
                            targets = metadata.participants
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
                            await sock.sendMessage(from, { text: '❌ You need to be paired to use this command' });
                            return;
                        }
                        
                        if (!isGroup) {
                            await sock.sendMessage(from, { text: '❌ This command can only be used in groups' });
                            return;
                        }
                        
                        if (!isGroupAdmin && !isGroupOwner && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be a group admin to add members' });
                            return;
                        }
                        
                        const botAddParticipant = await sock.groupMetadata(from);
                        const botAddStatus = botAddParticipant.participants.find(p => p.id === sock.user?.id);
                        if (!botAddStatus?.admin) {
                            await sock.sendMessage(from, { text: '❌ Bot needs to be an admin to add members' });
                            return;
                        }
                        
                        if (args.length === 0) {
                            await sock.sendMessage(from, { text: '❌ Usage: /add 254712345678 254798765432' });
                            return;
                        }
                        
                        const numbers = args.filter(num => /^\d+$/.test(num));
                        
                        if (numbers.length === 0) {
                            await sock.sendMessage(from, { text: '❌ No valid numbers provided' });
                            return;
                        }
                        
                        await sock.sendMessage(from, { text: `➕ Adding ${numbers.length} members...` });
                        
                        let addedCount = 0;
                        let failedAddCount = 0;
                        
                        for (const num of numbers) {
                            try {
                                const jid = `${num}@s.whatsapp.net`;
                                await sock.groupParticipantsUpdate(from, [jid], 'add');
                                addedCount++;
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            } catch (error) {
                                failedAddCount++;
                                log('ERROR', `Failed to add ${num}: ${error.message}`);
                            }
                        }
                        
                        await sock.sendMessage(from, { 
                            text: `➕ *Add Results*\n✅ Added: ${addedCount}\n❌ Failed: ${failedAddCount}`
                        });
                        break;

                    case 'officialinfo':
                        if (!user.paired && !isOwner) {
                            await sock.sendMessage(from, { text: '❌ You need to be paired to use this command' });
                            return;
                        }
                        
                        if (!OFFICIAL_GROUP_JID) {
                            await sock.sendMessage(from, { text: '❌ Official group not set yet' });
                            return;
                        }
                        
                        try {
                            const metadata = await sock.groupMetadata(OFFICIAL_GROUP_JID);
                            const admins = metadata.participants.filter(p => p.admin).length;
                            const owner = metadata.participants.find(p => p.admin === 'superadmin');
                            const ownerNumber = owner ? owner.id.split('@')[0] : 'Unknown';
                            
                            let groupIcon = null;
                            try {
                                const iconUrl = await sock.profilePictureUrl(OFFICIAL_GROUP_JID, 'image');
                                if (iconUrl) {
                                    groupIcon = await downloadImage(iconUrl);
                                }
                            } catch (e) {}
                            
                            const officialText = `*🏢 OFFICIAL GROUP INFO*

📛 *Name:* ${metadata.subject}
👥 *Members:* ${metadata.participants.length}
👑 *Admins:* ${admins}
👤 *Owner:* @${ownerNumber}
🔗 *Status:* Active

💡 *This is the official group where users can pair*`;

                            if (groupIcon) {
                                await sock.sendMessage(from, {
                                    image: groupIcon,
                                    caption: officialText,
                                    mentions: [owner?.id]
                                });
                            } else if (botImage) {
                                await sock.sendMessage(from, {
                                    image: botImage,
                                    caption: officialText,
                                    mentions: [owner?.id]
                                });
                            } else {
                                await sock.sendMessage(from, { text: officialText });
                            }
                        } catch (error) {
                            await sock.sendMessage(from, { text: `❌ Error fetching group info: ${error.message}` });
                        }
                        break;

                    case 'setofficial':
                        if (!isOwner) {
                            await sock.sendMessage(from, { text: '❌ This command is only for the bot owner' });
                            return;
                        }
                        
                        if (!isGroup) {
                            await sock.sendMessage(from, { text: '❌ This command must be used in the group you want to set as official' });
                            return;
                        }
                        
                        try {
                            const metadata = await sock.groupMetadata(from);
                            let groupIcon = null;
                            
                            try {
                                const iconUrl = await sock.profilePictureUrl(from, 'image');
                                if (iconUrl) {
                                    groupIcon = await downloadImage(iconUrl);
                                }
                            } catch (e) {}
                            
                            await saveOfficialGroup(from, metadata.subject, groupIcon);
                            
                            await sock.sendMessage(from, { 
                                text: `✅ *Official Group Set!*

📛 *Name:* ${metadata.subject}
👥 *Members:* ${metadata.participants.length}

Users can now pair by typing /pair in this group!` 
                            });
                            
                            log('SUCCESS', `Official group set to: ${from}`);
                        } catch (error) {
                            await sock.sendMessage(from, { text: `❌ Error setting official group: ${error.message}` });
                        }
                        break;

                    case 'pair':
                        if (user.paired) {
                            await sock.sendMessage(from, { 
                                text: `✅ *You're already paired!*

Enjoy using commands in any group!

Try /menu to see what you can do.` 
                            });
                            return;
                        }
                        
                        if (isGroup) {
                            if (OFFICIAL_GROUP_JID && from !== OFFICIAL_GROUP_JID) {
                                await sock.sendMessage(from, { 
                                    text: `❌ *Wrong place!*

To get a pairing code:
1️⃣ Join our official group
2️⃣ Type /pair THERE

Group link: ${WHATSAPP_GROUP}` 
                                });
                                return;
                            }
                            
                            const pairCode = generatePairCode();
                            pendingPairs.set(pairCode, {
                                jid: sender,
                                time: Date.now()
                            });
                            
                            const pairMessage = `🔐 *YOUR PAIRING CODE*

\`${pairCode}\`

📋 *INSTRUCTIONS:*
1️⃣ Copy this code
2️⃣ DM me at ${BOT_PHONE}
3️⃣ Paste the code there

⏰ *Expires in 10 minutes*

After that, you'll have FULL access! 🎉`;
                            
                            await sock.sendMessage(from, { text: pairMessage });
                            
                            setTimeout(() => {
                                pendingPairs.delete(pairCode);
                            }, 600000);
                        } else {
                            await sock.sendMessage(from, { 
                                text: `❌ *No code found in DM*

To get a pairing code:
1️⃣ Join our official group
2️⃣ Type /pair THERE
3️⃣ Copy the code
4️⃣ Send it here

Group link: ${WHATSAPP_GROUP}` 
                            });
                        }
                        break;

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
