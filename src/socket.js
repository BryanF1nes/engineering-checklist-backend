import { Server } from 'socket.io';
import passport from './config/passport.js';
import { sessionMiddleware } from './app.js';
import prisma from './config/prisma.js';

export function initializeSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: 'http://localhost:8000',
            credentials: true,
        },
    });

    io.engine.use(sessionMiddleware);
    io.engine.use(passport.initialize());
    io.engine.use(passport.session());

    io.use((socket, next) => {
        if (!socket.request.user) {
            return next(new Error('Unauthorized'));
        }

        next();
    });

    io.on('connection', socket => {
        console.log(`User connected: ${socket.request.user.id}`);

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
                            { ownerId: socket.request.user.id },
                            {
                                members: {
                                    some: {
                                        userId: socket.request.user.id,
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

                // Leave the previously active project room.
                if (socket.data.activeProjectRoom) {
                    await socket.leave(socket.data.activeProjectRoom);
                }

                const room = `project:${project.id}`;

                await socket.join(room);

                socket.data.activeProjectRoom = room;

                console.log(
                    `User ${socket.request.user.id} joined ${room}`
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
            console.log(`User disconnected: ${socket.request.user.id}`);
        });
    });

    return io;
}
