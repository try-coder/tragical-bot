// pair.js - Minimal WhatsApp Pairing Script
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

async function pairBot() {
    console.log('🚀 Starting minimal pairing script...');
    const { state, saveCreds } = await useMultiFileAuthState('auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['TRAGICAL Pair', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        // --- This is the only thing that matters ---
        if (!sock.authState.creds.registered) {
            try {
                console.log('📱 Requesting 8-digit pairing code for number: 254787031145');
                // Request the code
                const pairingCode = await sock.requestPairingCode('254787031145');
                
                // Display it CLEARLY
                console.log('\n' + '='.repeat(40));
                console.log('✅ SUCCESS! YOUR 8-DIGIT CODE:');
                console.log('='.repeat(40));
                console.log(`\n   👉 ${pairingCode} 👈\n`);
                console.log('='.repeat(40));
                console.log('1. Open WhatsApp on your phone');
                console.log('2. Go to Linked Devices');
                console.log('3. Tap "Link with phone number"');
                console.log('4. Enter the code above');
                console.log('5. This code expires in 60 seconds\n');

            } catch (error) {
                console.log('❌ Failed to get code:', error.message);
            }
            // Don't exit, keep waiting for connection
        }

        if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
            console.log('🤖 JID:', sock.user?.id);
            process.exit(0); // Exit successfully
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error?.message;
            if (!sock.authState.creds.registered) {
                console.log('⏳ Connection closed, but still waiting for code entry...');
                // Don't exit, let the process run
            } else {
                console.log('❌ Connection closed:', error);
                process.exit(1);
            }
        }
    });

    console.log('⏳ Waiting for WhatsApp connection...');
}

pairBot();
