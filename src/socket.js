import { Server } from 'socket.io';
import { verifyAccessToken } from './utils/tokens.js';
import prisma from './config/prisma.js';

let io;

export function initializeSocket(server) {
    io = new Server(server, {
        cors: {
            origin: ['http://localhost:8000', 'https://bryanf1nes.github.io'],
        },
    });

    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;

            if (!token) {
                return next(new Error('Unauthorized'));
            }

            const decoded = verifyAccessToken(token);

            socket.data.user = {
                id: decoded.id,
                firstName: decoded.firstName,
                lastName: decoded.lastName,
                email: decoded.email,
                avatarColor: decoded.avatarColor ?? null,
            };

            next();

        } catch (error) {
            next(new Error('Unauthorized'));
        }
    });

    io.on('connection', socket => {
        console.log(`User connected: ${socket.data.user.id}`);

        socket.on('project:join', async (projectId, callback) => {
            try {
                projectId = Number(projectId);

                if (!Number.isSafeInteger(projectId) || projectId <= 0) {
                    return callback?.({
                        success: false,
                        message: 'Invalid project ID.',
                    });
                }

                const project = await prisma.project.findFirst({
                    where: {
                        id: projectId,
                        OR: [
                            { ownerId: socket.data.user.id },
                            {
                                members: {
                                    some: {
                                        userId: socket.data.user.id,
                                    },
                                },
                            },
                        ],
                    },
                    select: {
                        id: true,
                    },
                });

                if (!project) {
                    return callback?.({
                        success: false,
                        message: 'You do not have access to this project.',
                    });
                }

                if (socket.data.activeProjectRoom) {
                    await socket.leave(socket.data.activeProjectRoom);
                }

                const room = `project:${project.id}`;

                await socket.join(room);

                socket.data.activeProjectRoom = room;

                console.log(
                    `User ${socket.data.user.id} joined ${room}`
                );

                callback?.({
                    success: true,
                    projectId: project.id,
                });

            } catch (error) {
                console.error('Failed to join project room:', error);

                callback?.({
                    success: false,
                    message: 'Unable to join project room.',
                });
            }
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.data.user.id}`);
        });
    });

    return io;
}

export async function broadcastAvatarUpdate(userId, avatarColor) {
    const projects = await prisma.project.findMany({
        where: {
            OR: [
                { ownerId: userId },
                {
                    members: {
                        some: {
                            userId,
                        },
                    },
                },
            ],
        },
        select: {
            id: true,
        },
    });

    for (const project of projects) {
        getIO().to(`project:${project.id}`).emit('user:avatar-updated', {
            userId,
            avatarColor,
        });
    }
}

export function getIO() {
    if (!io) {
        throw new Error('Socket.IO has not been initialized.');
    }

    return io;
}

