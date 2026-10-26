// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Kapcsolat
mongoose.connect(config.MONGO_URI, {
}).then(() => {
    console.log("🔥 MongoDB sikeresen csatlakoztatva!");
}).catch(err => {
    console.error("❌ MongoDB csatlakozási hiba:", err);
});

// Teljes körű Felhasználói Séma (Minden adat egy helyen, biztonságosan)
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true }, // Titkosított jelszó (Hash)
    avatar: { type: String, default: 'avatar1.png' }, // Kiválasztott alap avatár kép
    
    // Karakter adatok (pénz, státusz, leltár, felszerelés)
    playerData: {
        hp: { type: Number, default: 100 },
        maxHp: { type: Number, default: 100 },
        money: { type: Number, default: 100 }, // Kezdő pénz
        level: { type: Number, default: 1 },
        xp: { type: Number, default: 0 },
        fatigue: { type: Number, default: 0 },
        inventory: { type: Array, default: [] },
        equipment: { 
            weapon: { type: String, default: null },
            armor: { type: String, default: null },
            shoes: { type: String, default: null }
        },
        status: {
            food: { type: Number, default: 100 },
            water: { type: Number, default: 100 }
        }
    },
    
    // Épületek állapota (loot, idők, zárolások) mentése
    buildings: { type: Array, default: [] }
});

const PlayerModel = mongoose.model('SurvivalUser', userSchema);

// --- REGISZTRÁCIÓS VÉGPONT ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, avatar } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Minden mezőt ki kell tölteni!' });
        }

        const existingUser = await PlayerModel.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Ez a felhasználónév már foglalt!' });
        }

        // Jelszó biztonságos titkosítása
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new PlayerModel({
            username,
            email,
            password: hashedPassword,
            avatar: avatar || 'avatar1.png',
            playerData: {
                hp: 100,
                maxHp: 100,
                money: 100,
                level: 1,
                xp: 0,
                fatigue: 0,
                inventory: [],
                equipment: { weapon: null, armor: null, shoes: null },
                status: { food: 100, water: 100 }
            },
            buildings: []
        });

        await newUser.save();
        res.json({ success: true, message: 'Sikeres regisztráció!' });
    } catch (e) {
        console.error("Hiba regisztrációnál:", e);
        res.status(500).json({ success: false, message: 'Szerverhiba történt a regisztráció során.' });
    }
});

// --- BEJELENTKEZÉSI VÉGPONT ---
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await PlayerModel.findOne({ username });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Hibás felhasználónév vagy jelszó!' });
        }

        // Jelszó összehasonlítása a hash-el
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Hibás felhasználónév vagy jelszó!' });
        }

        // Visszaküldjük a teljes mentett karakterállapotot és az épületeket
        res.json({
            success: true,
            username: user.username,
            avatar: user.avatar,
            player: user.playerData,
            buildings: user.buildings
        });
    } catch (e) {
        console.error("Hiba bejelentkezéskor:", e);
        res.status(500).json({ success: false, message: 'Szerverhiba történt a bejelentkezés során.' });
    }
});

// --- VALÓS IDEJŰ MULTIPLAYER & MENTÉS SOCKET.IO-VAL ---
const activePlayers = {};

io.on('connection', (socket) => {
    console.log(`🔌 Új kliens csatlakozott: ${socket.id}`);

    // Pozíció és avatár frissítés a többieknek
    socket.on('update_position', (data) => {
        if (data && data.username && data.lat && data.lng) {
            activePlayers[socket.id] = {
                username: data.username,
                lat: data.lat,
                lng: data.lng,
                avatar: data.avatar || 'avatar1.png' // Küldi a saját képét is
            };
            socket.broadcast.emit('players_update', activePlayers);
        }
    });

    // Játékállás (leltár, HP, pénz, épületek állapota) mentése adatbázisba
    socket.on('save_player', async (data) => {
        try {
            if (!data.username) return;
            await PlayerModel.findOneAndUpdate(
                { username: data.username },
                { 
                    playerData: data.player, 
                    buildings: data.buildings 
                },
                { upsert: true }
            );
            socket.emit('save_success');
        } catch (e) {
            console.error("Hiba mentéskor:", e);
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Kliens levált: ${socket.id}`);
        delete activePlayers[socket.id];
        io.emit('players_update', activePlayers);
    });
});

server.listen(config.PORT, () => {
    console.log(`🚀 Survival GO szerver fut a http://localhost:${config.PORT} porton.`);
});