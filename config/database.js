// config/database.js
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        
        // Check if URI exists
        if (!mongoURI) {
            console.error('❌ MONGODB_URI is not defined in environment variables!');
            console.log('📝 Available env vars:', Object.keys(process.env).filter(key => !key.includes('SECRET')));
            process.exit(1);
        }

        console.log('📡 Connecting to MongoDB...');
        console.log('📍 URI starts with:', mongoURI.substring(0, 20) + '...');
        
        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds
        });
        
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${conn.connection.name}`);
        return conn;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.log('💡 Check that:');
        console.log('   1. MONGODB_URI is set in Railway variables');
        console.log('   2. MongoDB Atlas allows connections from anywhere (0.0.0.0/0)');
        console.log('   3. Your password has no special characters needing encoding');
        process.exit(1);
    }
};

module.exports = connectDB;
