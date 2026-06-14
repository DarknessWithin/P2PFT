# P2P Web Share — Phase 1: WebSocket Connectivity

Direct browser-to-browser file transfer. Phase 1 establishes the WebSocket communication layer between the frontend and backend. WebRTC, rooms, and file transfer are not yet implemented.

---

## Project Structure

```
p2p-webshare/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app, CORS, /ws endpoint
│   │   ├── websocket_manager.py  # ConnectionManager class
│   │   └── config.py             # Reads HOST, PORT, ALLOWED_ORIGINS from .env
│   ├── requirements.txt
│   └── .env                      # Environment variables
│
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/websocket.js
│
└── README.md
```

---

## Installation

### 1. Clone / navigate to the project

```bash
cd p2p-webshare/backend
```

### 2. Create and activate a virtual environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

---

## Running the Backend

From the `backend/` folder (with the virtual environment active):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected terminal output:

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Application startup complete.
```

Health-check — open in a browser:

```
http://localhost:8000
```

You should see:

```json
{ "status": "ok", "message": "P2P Web Share backend is running" }
```

---

## Running the Frontend

The frontend is plain HTML/CSS/JS — no build step needed.

**Option A — VS Code Live Server (recommended)**

1. Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer).
2. Right-click `frontend/index.html` → **Open with Live Server**.
3. Browser opens at `http://localhost:5500`.

**Option B — Python HTTP server**

```bash
cd frontend
python -m http.server 8080
# open http://localhost:8080
```

---

## Testing

1. Start the backend (`uvicorn` command above).
2. Open the frontend in a browser.
3. Click **Connect**.

### Expected behaviour

| Step | Status badge | Console message |
|------|-------------|-----------------|
| Click Connect | Connecting… (yellow pulse) | `Connecting to ws://localhost:8000/ws …` |
| Handshake complete | Connected (green pulse) | `WebSocket connection established.` |
| Server welcome | Connected | `Server: Connected to P2P Web Share Server` |
| Click Disconnect | Disconnected (red) | `Disconnected — User disconnected (code 1000)` |

### Backend terminal (connection logs)

```
12:00:01  INFO      app.websocket_manager  Client connected. Total active connections: 1
12:00:01  INFO      app.main               Sent welcome message to new client
12:00:05  INFO      app.websocket_manager  Client disconnected. Total active connections: 0
```

### Error case — backend not running

If you click Connect while the backend is offline, the console shows:

```
Connection error. Is the backend server running on port 8000?
```

---

## Environment Variables (backend/.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Interface to bind |
| `PORT` | `8000` | Port to listen on |
| `ALLOWED_ORIGINS` | `http://localhost:5500,...` | CORS whitelist (comma-separated) |

---

## What's NOT in Phase 1

- WebRTC peer connections
- Room creation / joining
- File upload or transfer
- SHA-256 hashing
- AES-GCM encryption
