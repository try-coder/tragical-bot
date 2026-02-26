// utils/youtube.js
const axios = require('axios');
require('dotenv').config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

async function searchVideo(query) {
    try {
        // Search for video
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

        // Get video details (views, duration)
        const detailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'statistics,contentDetails',
                id: videoId,
                key: YOUTUBE_API_KEY
            }
        });

        const details = detailsResponse.data.items[0];

        // Get channel details (subscriber count)
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
            views: formatNumber(details?.statistics?.viewCount),
            duration: formatDuration(details?.contentDetails?.duration),
            publishedAt: formatDate(video.snippet.publishedAt),
            thumbnail: video.snippet.thumbnails.high.url
        };
    } catch (error) {
        console.error('YouTube API Error:', error.message);
        return null;
    }
}

// For downloading, we'll use a free service (more on this later)
async function getDownloadUrl(videoId) {
    // We'll implement this with y2mate or similar
    return null;
}

function formatNumber(num) {
    if (!num) return 'N/A';
    num = parseInt(num);
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDuration(duration) {
    if (!duration) return 'N/A';
    // Convert PT1H2M3S to 1:02:03
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

module.exports = { searchVideo, getDownloadUrl };
