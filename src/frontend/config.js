// API Configuration
// This file allows you to configure the backend API URL
// For production, you can set this via environment variables or build-time configuration

// Default to localhost:8000 for development
// In production, this should point to your backend server URL
const API_BASE_URL = window.API_BASE_URL || 'http://localhost:8000';

// Helper function to build API URLs
function getApiUrl(endpoint) {
    // Remove leading slash if present to avoid double slashes
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    // Ensure API_BASE_URL doesn't end with a slash
    const cleanBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    return `${cleanBaseUrl}/${cleanEndpoint}`;
}

