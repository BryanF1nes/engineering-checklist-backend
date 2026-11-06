import dotenv from "dotenv";

dotenv.config({
    path: process.env.NODE_ENV === 'development' ? '.env.dev' : '.env',
});

import { createServer } from 'node:http';

import app from './app.js';
import { initializeSocket } from './socket.js';

const PORT = process.env.PORT || 3000;

const server = createServer(app);

initializeSocket(server);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
