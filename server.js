const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors()); // Allows your local dashboard to fetch data without security errors

// Replace with your real API Key!
const API_KEY = process.env.AISSTREAM_API_KEY || "4002c55a2bfedbbdb2478eb853779eb33cd0ffa6";
const PORT = process.env.PORT || 3000;

// This object will hold the latest positions of all ships in memory
let ships = {};

// 1. CONNECT TO AISSTREAM VIA WEBSOCKET (Cloud server handles this)
function connectAIS() {
    console.log("Connecting to AISStream...");
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

    ws.on('open', () => {
        console.log("✅ Cloud Server connected to AISStream!");
        const subscription = {
            APIKey: API_KEY,
            BoundingBoxes: [[[1.0, 95.0], [6.0, 105.0]]],
            FilterMessageTypes: ["PositionReport"]
        };
        ws.send(JSON.stringify(subscription));
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            if (message.MessageType === "PositionReport") {
                const mmsi = message.MetaData.MMSI;
                // Save the latest ship data to our memory dictionary
                ships[mmsi] = {
                    MMSI: mmsi,
                    ShipName: message.MetaData.ShipName ? message.MetaData.ShipName.trim() : `Vessel ${mmsi}`,
                    Latitude: message.Message.PositionReport.Latitude,
                    Longitude: message.Message.PositionReport.Longitude,
                    TrueHeading: message.Message.PositionReport.TrueHeading === 511 ? 0 : message.Message.PositionReport.TrueHeading,
                    Sog: message.Message.PositionReport.Sog / 10, // Speed in knots
                    LastUpdated: Date.now()
                };
            }
        } catch (e) {
            console.error("Error parsing message", e);
        }
    });

    ws.on('close', () => {
        console.log("⚠️ Connection closed. Reconnecting in 5s...");
        setTimeout(connectAIS, 5000);
    });

    ws.on('error', (err) => {
        console.error("❌ WebSocket error:", err);
    });
}

connectAIS();

// Memory cleanup: Remove ships that haven't moved in 15 minutes so memory doesn't overload
setInterval(() => {
    const now = Date.now();
    for (let mmsi in ships) {
        if (now - ships[mmsi].LastUpdated > 900000) {
            delete ships[mmsi];
        }
    }
}, 60000);

// 2. CREATE THE REST API FOR YOUR DASHBOARD
app.get('/api/ships', (req, res) => {
    // When your dashboard visits this URL, it sends back the JSON array of ships!
    res.json(Object.values(ships));
});

app.listen(PORT, () => {
    console.log(`🚀 Proxy server running on port ${PORT}`);
});