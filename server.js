// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Kapcsolat & Séma
mongoose.connect(config.MONGO_URI, {
}).then(() => {
    console.log("🔥 MongoDB sikeresen csatlakoztatva!");
}).catch(err => {
    console.error("❌ MongoDB csatlakozási hiba:", err);
});

const playerSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    playerData: { type: Object, required: true },
    buildings: { type: Array, default: [] }
});

const PlayerModel = mongoose.model('SurvivalPlayer', playerSchema);

// Socket.io kapcsolatok kezelése
io.on('connection', (socket) => {
    console.log(`🔌 Új kliens csatlakozott: ${socket.id}`);

    socket.on('load_player', async (username) => {
        try {
            let record = await PlayerModel.findOne({ username });
            if (record) {
                socket.emit('player_loaded', { player: record.playerData, buildings: record.buildings });
            } else {
                socket.emit('player_loaded', { player: null, buildings: [] });
            }
        } catch (e) {
            console.error("Hiba adatbetöltéskor:", e);
        }
    });

    socket.on('save_player', async (data) => {
        try {
            await PlayerModel.findOneAndUpdate(
                 { username: data.username },
                 { playerData: data.player, buildings: data.buildings },
                 { upsert: true, returnDocument: 'after' }
            );
            socket.emit('save_success');
        } catch (e) {
            console.error("Hiba mentéskor:", e);
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Kliens levált: ${socket.id}`);
    });
});

server.listen(config.PORT, () => {
    console.log(`🚀 Survival GO szerver fut a http://localhost:${config.PORT} porton.`);
});