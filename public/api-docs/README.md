# Cylinder Tracking Dashboard API - Documentation

## Overview

This RESTful API provides endpoints for managing RTSP cameras, real-time cylinder monitoring, data analysis and report generation.

**Version:** 1.2.0  
**Base URL:** `http://localhost:5000`  
**Server:** Flask + Socket.IO

---

## Authentication

The API uses **session-based authentication** (Flask-Login):

- After a successful login, a session cookie is set
- All protected endpoints require this cookie
- Use `withCredentials: true` in AJAX requests

### Login Example (FormData):
```bash
curl -X POST http://localhost:5000/login \
  -F "username=admin" \
  -F "password=yourpassword" \
  -c cookies.txt
```

### Login Example (JSON):
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}' \
  # Cylinder Tracking Dashboard API - Documentation

  ## Overview

  This RESTful API provides endpoints for managing RTSP cameras, real-time cylinder monitoring, data analysis and report generation.

  **Version:** 1.2.0  
  **Base URL:** `http://localhost:5000`  
  **Server:** Flask + Socket.IO

  ---

  ## Authentication

  The API uses **session-based authentication** (Flask-Login):

  - After a successful login, a session cookie is set
  - All protected endpoints require this cookie
  - Use `withCredentials: true` in AJAX requests

  ### Login Example (FormData):
  ```bash
  curl -X POST http://localhost:5000/login \
    -F "username=admin" \
    -F "password=yourpassword" \
    -c cookies.txt
  ```

  ### Login Example (JSON):
  ```bash
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"yourpassword"}' \
    -c cookies.txt
  ```

  ---

  ## Main Endpoints

  ### Cameras

  #### List Cameras
  ```http
  GET /api/v1/cameras
  ```
  Returns a list of configured cameras.

  #### Add Camera
  ```http
  POST /api/v1/add_camera
  Content-Type: application/json

  {
    "platform": "platform1",
    "name": "Main Camera",
    "url": "rtsp://192.168.1.100:554/stream"
  }
  ```
  **Note:** If the URL is already in use, a warning may be returned.

  #### Test Connection
  ```http
  GET /api/v1/test_connection_plat/platform1
  ```
  Tests whether the camera can connect to the RTSP stream.

  #### Delete Camera
  ```http
  POST /api/v1/delete_camera
  Content-Type: application/json

  {
    "platform": "platform1"
  }
  ```

  ---

  ### Detection Zones

  #### Get Zones
  ```http
  GET /get_zones/platform1
  ```

  #### Set Zones
  ```http
  POST /set_zones/platform1
  Content-Type: application/json

  {
    "loading_zone": {
      "p1": [100, 150],
      "p2": [400, 500]
    },
    "unloading_zone": {
      "p1": [500, 150],
      "p2": [800, 500]
    }
  }
  ```

  ---

  ### Analytics and Data

  #### Today's Summary
  ```http
  GET /api/v1/today-summary
  GET /api/v1/today-summary?platform=platform1
  ```
  Returns counts of loaded/unloaded cylinders.

  **Response:**
  ```json
  {
    "platforms": {
      "platform1": {
        "loaded": 45,
        "unloaded": 32,
        "status": "live"
      }
    },
    "total": {
      "loaded": 45,
      "unloaded": 32
    }
  }
  ```

  #### Chart Data
  ```http
  GET /api/v1/charts/{platform}_{period}
  ```
  Examples:
  - `/api/v1/charts/platform1_week`
  - `/api/v1/charts/all_month`
  - `/api/v1/charts/platform2_year`

  ---

  ### Video Streams

  #### MJPEG Stream
  ```http
  GET /video_feed/platform1
  ```
  Returns a continuous MJPEG stream. Use in an `<img>` tag:
  ```html
  <img src="http://localhost:5000/video_feed/platform1" />
  ```

  #### Snapshot
  ```http
  GET /snapshot/platform1
  ```
  Returns a single JPEG image.

  #### Snapshot (zones-only)
  ```http
  GET /snapshot/platform1/zones-only
  ```
  Returns a single JPEG that includes only the configured zones (no algorithm bounding boxes). Intended for the zone-drawing UI.

  ---

  ### Users (Admin only)

  #### List Users
  ```http
  GET /api/v1/users
  ```

  #### Add User
  ```http
  POST /api/v1/add_user
  Content-Type: application/json

  {
    "username": "newuser",
    "password": "yourpassword",
    "role": "viewer",
    "active": true
  }
  ```

  ---

  ## WebSocket (Socket.IO)

  The API also uses **Socket.IO** for real-time updates.

  ### Connect Example
  ```javascript
  import { io } from 'socket.io-client';

  const socket = io('http://localhost:5000', {
    withCredentials: true,
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('Connected!');
  });

  socket.on('dashboard_update', (data) => {
    console.log('Update:', data);
    // data.platforms, data.total, data.hourly
  });
  ```

  ### Event: `dashboard_update`
  Emitted by the server with updated dashboard data.

  **Payload Example:**

  ```json
  {
    "platforms": {
      "platform1": {
        "zones": {
          "loading_zone": {"loaded": 10, "unloaded": 5}
        },
        "total_loaded": 10,
        "total_unloaded": 5,
        "status": "live"
      }
    },
    "total": {
      "loaded": 10,
      "unloaded": 5,
      "balance": 5
    }
  }
  ```

  ---

  ## Common Filters and Parameters

  ### Query Parameters
  - `platform` - Filter by specific platform
  - `start` - Start date (YYYY-MM-DD)
  - `end` - End date (YYYY-MM-DD)
  - `dir` - Direction: `loaded`, `unloaded`, `all`

  ### Example
  ```http
  GET /get_report_data?start=2026-01-01&end=2026-01-17&plat=platform1&dir=loaded
  ```

  ---

  ## Performance

  ### Optimizations
  - **Reduced FPS:** 10 FPS for YOLO processing (previously 25 FPS)
  - **Frame Interval:** 50ms between frames (previously 10ms)
  - **Duplicate Detection:** Warns when same RTSP URL is used across multiple platforms

  ### Duplicate URLs
  ⚠️ **Avoid using the same RTSP URL across multiple platforms!**

  When the same camera is added to different platforms:
  - Multiple threads will process the same stream
  - CPU/memory usage increases significantly
  - The UI may become slow or unresponsive

  **Fix:** Use unique URLs or remove duplicate platforms.

  ---

  ## Usage Examples

  ### Frontend (React/TypeScript)
  ```typescript
  import api from '@/lib/api';

  // Get today's summary
  const response = await api.get('/api/v1/today-summary');
  console.log(response.data);

  // Add camera
  await api.post('/api/v1/add_camera', {
    platform: 'platform3',
    name: 'New Camera',
    url: 'rtsp://192.168.1.101:554/stream'
  });

  // Test connection
  const test = await api.get('/test_connection', {
    params: { url: 'rtsp://192.168.1.102:554/stream' }
  });
  ```

  ### cURL Examples
  ```bash
  # Login
  curl -X POST http://localhost:5000/login \
    -F "username=admin" -F "password=admin" \
    -c cookies.txt

  # Get cameras
  curl http://localhost:5000/api/v1/cameras -b cookies.txt

  # Add camera
  curl -X POST http://localhost:5000/api/v1/add_camera \
    -H "Content-Type: application/json" \
    -d '{"platform":"platform1","name":"Cam1","url":"rtsp://..."}' \
    -b cookies.txt
  ```

  ---

  ## Status Codes

  | Code | Description |
  |------|-------------|
  | 200  | Success |
  | 302  | Redirect (after login/logout) |
  | 401  | Not authenticated |
  | 403  | Forbidden (admin only) |
  | 404  | Not found |
  | 500  | Internal server error |

  ---

  ## Notes

  1. **Session Cookies:** Always send cookies with `withCredentials: true`
  2. **CORS:** Backend configured to accept credentials
  3. **RTSP Streams:** Ensure URLs are reachable on the network
  4. **Admin vs Viewer:** Some endpoints require the `admin` role

  ---

  ## Useful Links

  - [Swagger UI](http://localhost:5000/api-docs) - Interactive documentation
  - [Frontend code](../src/lib/server-api.ts) - Client TypeScript
  - [Backend code](../app.py) - Flask implementation

  ---

  **Last updated:** January 17, 2026
