/**
 * Server API Client for Flask Backend
 * 
 * Complete integration with Flask endpoints for:
 * - Authentication (login, signup, logout)
 * - Camera management (add, update, delete)
 * - Dashboard data (today's summary, reports)
 * - Real-time data via Socket.io
 * 
 * All requests are made with credentials to support Flask-Login sessions
 * Some endpoints require X-API-Key header for programmatic access
 */

import api from './api';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);

// ============================================================================
// TYPES
// ============================================================================

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'viewer';
  active: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SignupCredentials {
  username: string;
  password: string;
}

export interface Camera {
  platform: string;
  name: string;
  url: string;
  zones?: {
    [key: string]: {
      p1: [number, number];
      p2: [number, number];
    };
  };
}

export interface CountData {
  date: string;
  platform: string;
  zone: string;
  direction: 'loaded' | 'unloaded';
  count: number;
}

export interface TodaySummary {
  platforms: {
    [key: string]: {
      loaded: number;
      unloaded: number;
      status?: string;
    };
  };
  total: {
    loaded: number;
    unloaded: number;
  };
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Login with username and password
 * Returns user data and sets Flask session cookie
 * 
 * Note: Flask /login endpoint expects form data, not JSON
 */
export async function login(credentials: LoginCredentials): Promise<{ success: boolean }> {
  try {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    await api.post('/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Login failed');
  }
}

/**
 * Sign up new user with viewer role
 * Form-based registration
 */
export async function signup(credentials: SignupCredentials): Promise<{ success: boolean }> {
  try {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    await api.post('/signup', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Signup failed');
  }
}

/**
 * Logout current user
 * Clears Flask session
 */
export async function logout(): Promise<{ success: boolean }> {
  try {
    await api.get('/logout');
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Logout failed');
  }
}

// ============================================================================
// CAMERA MANAGEMENT
// ============================================================================

/**
 * Get all available platforms/cameras
 * Requires X-API-Key header
 */
export async function getPlatforms(): Promise<Record<string, string>> {
  try {
    const response = await api.get('/api/v1/platforms');
    return response.data || {};
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to fetch platforms');
  }
}

/**
 * Get zones for a specific platform
 */
export async function getZones(platform: string): Promise<Record<string, any>> {
  try {
    const response = await api.get(`/get_zones/${platform}`);
    return response.data || {};
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to fetch zones');
  }
}

/**
 * Set/update zones for a platform (admin only)
 * 
 * @param platform Platform identifier
 * @param zones Zone coordinates { A: { p1: [x,y], p2: [x,y] }, ... }
 */
export async function setZones(platform: string, zones: Record<string, any>): Promise<{ success: boolean }> {
  try {
    await api.post(`/set_zones/${platform}`, zones);
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to set zones');
  }
}

/**
 * Add new camera (admin only)
 */
export async function addCamera(camera: Camera): Promise<{ success: boolean }> {
  try {
    await api.post('/add_camera', camera);
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to add camera');
  }
}

/**
 * Update camera (admin only)
 */
export async function updateCamera(camera: Camera): Promise<{ success: boolean }> {
  try {
    await api.post('/update_camera', camera);
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to update camera');
  }
}

/**
 * Delete camera (admin only)
 * 
 * @param platform Platform identifier to delete
 */
export async function deleteCamera(platform: string): Promise<{ success: boolean }> {
  try {
    await api.get(`/delete_camera/${platform}`);
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to delete camera');
  }
}

/**
 * Test camera connection
 */
export async function testConnection(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await api.get('/test_connection', { params: { url } });
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Connection test failed');
  }
}

// ============================================================================
// DASHBOARD DATA
// ============================================================================

/**
 * Get today's summary of cylinder counts
 * Requires X-API-Key header
 */
export async function getTodaySummary(): Promise<TodaySummary> {
  try {
    const response = await api.get('/api/v1/today-summary');
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch today summary:', error);
    return {
      platforms: {},
      total: { loaded: 0, unloaded: 0 }
    };
  }
}

/**
 * Get detailed count report with optional filtering
 * 
 * @param filters Optional filters:
 *   - start: Date string (YYYY-MM-DD)
 *   - end: Date string (YYYY-MM-DD)
 *   - plat: Platform identifier (or 'all')
 *   - dir: Direction ('loaded', 'unloaded', or 'all')
 */
export async function getReportData(filters?: {
  start?: string;
  end?: string;
  plat?: string;
  dir?: string;
}): Promise<CountData[]> {
  try {
    const response = await api.get('/get_report_data', { params: filters });
    return response.data || [];
  } catch (error: any) {
    console.error('Failed to fetch report data:', error);
    return [];
  }
}

// ============================================================================
// VIDEO STREAMS (NOT API CALLS - SEE VideoStream COMPONENT)
// ============================================================================

/**
 * VIDEO STREAM NOTES:
 * 
 * The /video_feed/<platform> endpoint returns an MJPEG stream.
 * This is NOT called via API - instead use the <VideoStream /> component:
 * 
 *   import { VideoStream } from '@/components/VideoStream'
 *   <VideoStream platform="platform1" title="Camera 1" />
 * 
 * The VideoStream component handles:
 * - Creating an <img> tag pointing to /video_feed/<platform>
 * - Loading/error states
 * - Automatic reconnection
 * - Proper CORS/credentials handling
 * 
 * Backend: Flask endpoint generates continuous MJPEG boundary frames
 *   @app.route('/video_feed/<platform>')
 *   @login_required
 *   def video_feed(platform):
 *     return Response(gen_video(platform), mimetype='multipart/x-mixed-replace; boundary=frame')
 */
export function getVideoStreamUrl(platform: string): string {
  return `${API_BASE}/video_feed/${platform}`;
}

/**
 * Get single snapshot/frame from platform
 */
export async function getSnapshot(platform: string): Promise<Blob> {
  try {
    const response = await api.get(`/snapshot/${platform}`, {
      responseType: 'blob'
    });
    return response.data;
  } catch (error: any) {
    throw new Error('Failed to fetch snapshot');
  }
}

export async function getSnapshotZonesOnly(platform: string): Promise<Blob> {
  try {
    const response = await api.get(`/snapshot/${platform}/zones-only`, {
      responseType: 'blob'
    });
    return response.data;
  } catch (error: any) {
    throw new Error('Failed to fetch snapshot');
  }
}

// ============================================================================
// USER MANAGEMENT (ADMIN ONLY)
// ============================================================================

/**
 * Get user details (admin only)
 */
export async function getUser(userId: number): Promise<User> {
  try {
    const response = await api.get(`/get_user/${userId}`);
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to fetch user');
  }
}

/**
 * Add new user (admin only)
 */
export async function addUser(userData: {
  username: string;
  password: string;
  role: 'admin' | 'viewer';
  active?: boolean;
}): Promise<{ success: boolean }> {
  try {
    await api.post('/add_user', userData);
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to add user');
  }
}

/**
 * Update user (admin only)
 */
export async function updateUser(userData: {
  id: number;
  password?: string;
  role?: 'admin' | 'viewer';
  active?: boolean;
}): Promise<{ success: boolean }> {
  try {
    await api.post('/update_user', userData);
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to update user');
  }
}

/**
 * Delete user (admin only)
 */
export async function deleteUser(userId: number): Promise<{ success: boolean }> {
  try {
    await api.delete(`/delete_user/${userId}`);
    return { success: true };
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to delete user');
  }
}

// ============================================================================
// EXAMPLE USAGE IN COMPONENTS
// ============================================================================

/*
import { useEffect, useState } from 'react'
import * as serverApi from '@/lib/server-api'

export function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    serverApi.getTodaySummary()
      .then(setSummary)
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div>Loading...</div>
  if (!summary) return <div>No data</div>

  return (
    <div>
      <h1>Total: {summary.total.loaded} loaded</h1>
      {Object.entries(summary.platforms).map(([platform, data]) => (
        <div key={platform}>
          {platform}: {data.loaded} loaded, {data.unloaded} unloaded
        </div>
      ))}
    </div>
  )
}
*/

