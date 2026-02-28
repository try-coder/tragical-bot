import mongoose from 'mongoose';

const WarningSchema = new mongoose.Schema({
    groupId: { type: String, required: true },
    reason: { type: String, required: true },
    date: { type: Date, default: Date.now },
    issuedBy: { type: String, required: true }
});

const UserSchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    number: { type: String, required: true },
    name: { type: String, default: 'Unknown' },
    paired: { type: Boolean, default: false },
    role: { 
        type: String, 
        enum: ['owner', 'admin', 'regular'],
        default: 'regular'
    },
    pairedSince: { type: Date },
    totalGroups: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now },
    warnings: [WarningSchema],
    warningCount: { type: Number, default: 0 },
    adminGroups: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', function() {
    this.updatedAt = Date.now();
});

export default mongoose.model('User', UserSchema);
