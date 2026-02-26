// config/database.js
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        // Remove deprecated options
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected Successfully');
        return conn;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
