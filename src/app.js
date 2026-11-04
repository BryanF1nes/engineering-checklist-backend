import express from "express";
import session from "express-session";
import passport from "./config/passport.js";
import cors from "cors";

import apiRoutes from "./routes/index.js";
import authRoutes from "./routes/authRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import errorHandler from "./middleware/error.middleware.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24,
        }
    })
);
app.use(passport.initialize())
app.use(passport.session());

// API routes
app.use("/api", apiRoutes);
app.use("/auth", authRoutes);
app.use("/projects", projectRoutes);

// Error handling
app.use(errorHandler);

export default app;
