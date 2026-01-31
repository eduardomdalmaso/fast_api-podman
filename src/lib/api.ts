import axios from 'axios';
import i18n from '../i18n';

// Use environment variables for sensitive keys
const API_KEY = import.meta.env.VITE_API_KEY || 'cylinder-api-secret-2026';
const isDev = import.meta.env.DEV;
// In development use a relative URL so Vite's dev server proxy forwards requests
// to the Flask backend (avoids CORS). In production use the same origin.
const API_URL = import.meta.env.VITE_API_URL || (isDev ? '' : window.location.origin);

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
    },
    withCredentials: true, // Enable cookies for session-based auth
});

// Interceptor for logging and error handling
api.interceptors.request.use(
    (config) => {
        // Add current language to requests so backend can localize/normalize
        try {
            const lang = i18n.language;
            if (lang) {
                config.headers = config.headers || {};
                config.headers['X-Lang'] = lang;
            }
        } catch (e) {
            // ignore
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Optional: Response interceptor for global error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            console.error('Unauthorized access - potential invalid token');
            // Redirect to login or handle logout here
        }
        return Promise.reject(error);
    }
);

export default api;
