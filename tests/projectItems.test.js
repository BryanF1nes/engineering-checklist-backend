
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Project checklist item routes', () => {
    let ownerAgent;
    let contributorAgent;
    let viewerAgent;
    let outsiderAgent;

    let project;
    let createdUsers = [];

    const testUsers = [
        {
            username: 'project_owner',
            email: 'project_owner@test.com',
            password: 'Password123!',
        },
        {
            username: 'project_contributor',
            email: 'project_contributor@test.com',
            password: 'Password123!',
        },
        {
            username: 'project_viewer',
            email: 'project_viewer@test.com',
            password: 'Password123!',
        },
        {
            username: 'project_outsider',
            email: 'project_outsider@test.com',
            password: 'Password123!',
        },
    ];

    beforeAll(async () => {
        // Create test users.
        const passwordHash = await bcrypt.hash('Password123!', 12);

        for (const user of testUsers) {
            const createdUser = await prisma.user.create({
                data: {
                    username: user.username,
                    email: user.email,
                    password: passwordHash,
                },
            });

            createdUsers.push(createdUser);
        }

        // Create authenticated agents.
        ownerAgent = request.agent(app);
        contributorAgent = request.agent(app);
        viewerAgent = request.agent(app);
        outsiderAgent = request.agent(app);

        // Log in each user.
        for (const [index, agent] of [
            ownerAgent,
            contributorAgent,
            viewerAgent,
            outsiderAgent,
        ].entries()) {
            const response = await agent
                .post('/auth/login')
                .send({
                    email: testUsers[index].email,
                    password: testUsers[index].password,
                });

            expect(response.status).toBe(200);
        }

        // Create a project owned by the first user.
        project = await prisma.project.create({
            data: {
                name: 'Checklist Middleware Test Project',
                description: 'Testing project access and roles.',
                ownerId: createdUsers[0].id,
            },
        });

        // Add contributor and viewer memberships.
        await prisma.projectMember.createMany({
            data: [
                {
                    projectId: project.id,
                    userId: createdUsers[1].id,
                    role: 'CONTRIBUTOR',
                },
                {
                    projectId: project.id,
                    userId: createdUsers[2].id,
                    role: 'VIEWER',
                },
            ],
        });
    });

    afterAll(async () => {
        // Delete test project and its related records.
        if (project) {
            await prisma.project.deleteMany({
                where: { id: project.id },
            });
        }

        // Delete test users.
        if (createdUsers.length) {
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: createdUsers.map(user => user.id),
                    },
                },
            });
        }

        await prisma.$disconnect();
    });

    describe('GET /project/:projectId/items', () => {
        it('should allow the project owner to retrieve checklist items', async () => {
            const response = await ownerAgent
                .get(`/project/${project.id}/items`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('items');
            expect(response.body).toHaveProperty('count');
        });

        it('should allow a contributor to retrieve checklist items', async () => {
            const response = await contributorAgent
                .get(`/project/${project.id}/items`);

            expect(response.status).toBe(200);
        });

        it('should allow a viewer to retrieve checklist items', async () => {
            const response = await viewerAgent
                .get(`/project/${project.id}/items`);

            expect(response.status).toBe(200);
        });

        it('should deny access to users who are not project members', async () => {
            const response = await outsiderAgent
                .get(`/project/${project.id}/items`);

            expect(response.status).toBe(404);
        });

        it('should deny access to unauthenticated users', async () => {
            const response = await request(app)
                .get(`/project/${project.id}/items`);

            expect(response.status).toBe(401);
        });
    });

    describe('POST /project/:projectId/items', () => {
        it('should allow the project owner to create checklist items', async () => {
            const response = await ownerAgent
                .post(`/project/${project.id}/items`)
                .send({
                    title: 'Owner checklist item',
                });

            expect(response.status).toBe(201);
            expect(response.body.item.title).toBe('Owner checklist item');
            expect(response.body.item.projectId).toBe(project.id);
        });

        it('should allow contributors to create checklist items', async () => {
            const response = await contributorAgent
                .post(`/project/${project.id}/items`)
                .send({
                    title: 'Contributor checklist item',
                });

            expect(response.status).toBe(201);
            expect(response.body.item.title).toBe('Contributor checklist item');
        });

        it('should deny viewers from creating checklist items', async () => {
            const response = await viewerAgent
                .post(`/project/${project.id}/items`)
                .send({
                    title: 'Viewer checklist item',
                });

            expect(response.status).toBe(403);
        });

        it('should deny users who do not have project access', async () => {
            const response = await outsiderAgent
                .post(`/project/${project.id}/items`)
                .send({
                    title: 'Outsider checklist item',
                });

            expect(response.status).toBe(404);
        });

        it('should deny unauthenticated users from creating checklist items', async () => {
            const response = await request(app)
                .post(`/project/${project.id}/items`)
                .send({
                    title: 'Unauthenticated checklist item',
                });

            expect(response.status).toBe(401);
        });
    });
});

