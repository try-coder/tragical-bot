import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now }
});

SettingsSchema.pre('save', function() {
    this.updatedAt = Date.now();
});

export default mongoose.model('Settings', SettingsSchema);
