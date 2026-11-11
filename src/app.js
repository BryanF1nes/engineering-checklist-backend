import express from "express";
import cors from "cors";

import apiRoutes from "./routes/index.js";
import authRoutes from "./routes/authRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import teamInvitationRoutes from "./routes/teamInvitationRoutes.js";

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

// API routes
app.use("/api", apiRoutes);
app.use("/auth", authRoutes);
app.use("/project", projectRoutes);
app.use("/project/:projectId/items", itemRoutes);
app.use("/invitations", invitationRoutes);
app.use("/teams", teamRoutes);
app.use("/team-invitations", teamInvitationRoutes);

// Error handling
app.use(errorHandler);

export default app;
