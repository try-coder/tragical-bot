// config/database.js
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        
        if (!mongoURI) {
            console.error('❌ MONGODB_URI is not defined!');
            console.log('📝 Available env vars:', Object.keys(process.env));
            process.exit(1);
        }

        console.log('📡 Connecting to MongoDB...');
        
        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${conn.connection.name}`);
        return conn;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.log('💡 Check your MONGODB_URI in Railway variables');
        process.exit(1);
    }
};

module.exports = connectDB;
