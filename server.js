const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());
// Serve the index.html file when visiting http://localhost:3000
// Serve the index.html file safely
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- Temporary In-Memory Database (Saving to db.json is recommended) ---
let db = {
    users: [], // { username, passwordHash }
    homes: {}, // { homeId: { devices: [], auditLogs: [] } }
};

let activeUsers = []; // { socketId, username, roomId }

// --- 1. Authentication System ---
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    db.users.push({ username, passwordHash });
    res.json({ message: 'Registration successful' });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.passwordHash)) {
        res.json({ message: 'Login successful', username });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// --- 2. Real-Time Communication (Socket.IO) ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join a Home Workspace
    socket.on('joinHome', ({ username, roomId }) => {
        socket.join(roomId);

        // Add user to active users list
        activeUsers.push({ socketId: socket.id, username, roomId });

        // Create home if it doesn't exist
        if (!db.homes[roomId]) {
            db.homes[roomId] = { devices: [], auditLogs: [] };
        }

        // Update all clients in the room with the new online user count
        io.to(roomId).emit('activeUsersUpdated', activeUsers.filter(u => u.roomId === roomId));
        socket.emit('homeData', db.homes[roomId]);
    });

    // --- 3. Virtual Device Management (CRUD) ---
    socket.on('addDevice', (data) => {
        const { roomId, device } = data; // device: { id, name, type, status }
        db.homes[roomId].devices.push(device);
        io.to(roomId).emit('homeLayoutUpdated', db.homes[roomId].devices);
    });

    socket.on('removeDevice', (data) => {
        const { roomId, deviceId } = data;
        db.homes[roomId].devices = db.homes[roomId].devices.filter(d => d.id !== deviceId);
        io.to(roomId).emit('homeLayoutUpdated', db.homes[roomId].devices);
    });

    // --- 4. Device Control & Validation ---
    socket.on('deviceAction', (data) => {
        const { roomId, deviceId, action, val, username } = data;
        const home = db.homes[roomId];
        const device = home.devices.find(d => d.id === deviceId);

        if (device) {
            let oldStatus = device.status;

            // Handle toggle action
            if (action === 'toggle') {
                device.status = !device.status; // Flip the state (true/false)
            } else if (action === 'setValue') {
                // Thermostat Temperature Validation (Clamp between 10-30°C)
                if (device.type === 'thermostat') {
                    device.status = Math.max(10, Math.min(30, Number(val)));
                } else {
                    device.status = val;
                }
            }

            // Broadcast the updated state to everyone in the home
            io.to(roomId).emit('deviceUpdated', device);

            // Add to Activity Audit Log
            const logEntry = {
                timestamp: new Date(),
                user: username,
                device: device.name,
                newState: device.status
            };
            home.auditLogs.push(logEntry);
            io.to(roomId).emit('newAuditLog', logEntry);
        }
    });

    // --- 5. Handle Disconnect (Ghost Users Bug Fix) ---
    socket.on('disconnect', () => {
        const userIndex = activeUsers.findIndex(u => u.socketId === socket.id);
        if (userIndex !== -1) {
            const user = activeUsers[userIndex];
            activeUsers.splice(userIndex, 1); // Remove user from active list

            // Update remaining clients in the home
            io.to(user.roomId).emit('activeUsersUpdated', activeUsers.filter(u => u.roomId === user.roomId));
            console.log(`User ${user.username} disconnected.`);
        }
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});