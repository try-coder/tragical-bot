// models/User.js
const mongoose = require('mongoose');

const WarningSchema = new mongoose.Schema({
    groupId: { type: String, required: true },
    reason: { type: String, required: true },
    date: { type: Date, default: Date.now },
    issuedBy: { type: String, required: true }
});

const UserSchema = new mongoose.Schema({
    // Basic Info
    jid: { type: String, required: true, unique: true },
    number: { type: String, required: true },
    name: { type: String, default: 'Unknown' },
    
    // Status
    paired: { type: Boolean, default: false },
    role: { 
        type: String, 
        enum: ['owner', 'admin', 'regular'],
        default: 'regular'
    },
    pairedSince: { type: Date },
    
    // Stats
    totalGroups: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now },
    
    // Moderation
    warnings: [WarningSchema],
    warningCount: { type: Number, default: 0 },
    
    // Groups where user is admin (from bot's perspective)
    adminGroups: [{ type: String }],
    
    // Metadata
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Update timestamp on save - FIXED: removed next() parameter
UserSchema.pre('save', function() {
    this.updatedAt = Date.now();
});

module.exports = mongoose.model('User', UserSchema);
