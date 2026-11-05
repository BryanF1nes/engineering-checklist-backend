import express from "express";
import session from "express-session";
import passport from "./config/passport.js";
import cors from "cors";

import apiRoutes from "./routes/index.js";
import authRoutes from "./routes/authRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import errorHandler from "./middleware/error.middleware.js";

const app = express();

app.set('trust proxy', 1);

const allowedOrigins = [
    'http://localhost:8000',
    'https://bryanf1nes.github.io',
];

// Middleware
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));
app.use(express.json());

export const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24,
    }
});

app.use(sessionMiddleware);
app.use(passport.initialize())
app.use(passport.session());

// API routes
app.use("/api", apiRoutes);
app.use("/auth", authRoutes);
app.use("/project", projectRoutes);
app.use("/project/:projectId/items", itemRoutes);
app.use("/invitations", invitationRoutes);

// Error handling
app.use(errorHandler);

export default app;
