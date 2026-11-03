import express from "express";
import cors from "cors";

import apiRoutes from "./routes/index.js";
import errorHandler from "./middleware/error.middleware.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use("/api", apiRoutes);

// Error handling
app.use(errorHandler);

export default app;
