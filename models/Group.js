// models/Group.js
const mongoose = require('mongoose');

const ModerationLogSchema = new mongoose.Schema({
    action: { type: String, required: true }, // 'warn', 'kick', 'ban'
    target: { type: String, required: true },
    targetNumber: String,
    reason: String,
    date: { type: Date, default: Date.now },
    issuedBy: { type: String, required: true }
});

// Schema for warned users
const WarnedUserSchema = new mongoose.Schema({
    userJid: { type: String, required: true },
    count: { type: Number, default: 0 },
    lastWarn: { type: Date, default: Date.now }
});

const GroupSchema = new mongoose.Schema({
    // Basic Info
    jid: { type: String, required: true, unique: true },
    name: { type: String, default: 'Unknown Group' },
    
    // Settings
    antilinkEnabled: { type: Boolean, default: false },
    antispamEnabled: { type: Boolean, default: false },
    autokickEnabled: { type: Boolean, default: true },
    warnLimit: { type: Number, default: 4 },
    
    // Stats
    totalMembers: { type: Number, default: 0 },
    pairedMembers: { type: Number, default: 0 },
    
    // Admins in this group (JIDs)
    admins: [{ type: String }],
    
    // Moderation history
    moderationLog: [ModerationLogSchema],
    
    // Track warned users with counts
    warnedUsers: [WarnedUserSchema],
    
    // Metadata
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Update timestamp on save - FIXED: removed next() parameter
GroupSchema.pre('save', function() {
    this.updatedAt = Date.now();
});

module.exports = mongoose.model('Group', GroupSchema);
