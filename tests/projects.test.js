import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Project routes', () => {
    let ownerAgent;
    let memberAgent;
    let unrelatedAgent;

    let projectId;

    const password = 'TestPassword123!';

    const testId = Date.now();

    const users = [
        {
            username: 'project_owner',
            email: `owner_${testId}@example.com`,
        },
        {
            username: 'project_member',
            email: `member_${testId}@example.com`,
        },
        {
            username: 'unrelated_user',
            email: `unrelated_${testId}@example.com`,
        },
    ];

    // Register a user and establish an authenticated session.
    async function createAuthenticatedUser(user) {
        const registerResponse = await request(app)
            .post('/auth/register')
            .send({
                ...user,
                password,
            });

        expect(registerResponse.statusCode).toBe(201);

        const agent = request.agent(app);

        const loginResponse = await agent
            .post('/auth/login')
            .send({
                email: user.email,
                password,
            });

        expect(loginResponse.statusCode).toBe(200);

        return agent;
    }

    beforeAll(async () => {
        // Prevent accidentally running these tests against development.
        if (process.env.NODE_ENV !== 'test') {
            throw new Error(
                'Tests must run with NODE_ENV=test.'
            );
        }

        // Create three authenticated users.
        ownerAgent = await createAuthenticatedUser(users[0]);
        memberAgent = await createAuthenticatedUser(users[1]);
        unrelatedAgent = await createAuthenticatedUser(users[2]);

        const member = await prisma.user.findUnique({
            where: {
                email: users[1].email,
            },
            select: {
                id: true,
            },
        });

        expect(member).toBeDefined();

        // Create a project through the actual API.
        const projectResponse = await ownerAgent
            .post('/project')
            .send({
                name: 'Test Wastewater Project',
                description: 'Project created for integration testing.',
                stage: 'THIRTY',
            });

        expect(projectResponse.statusCode).toBe(201);

        projectId = projectResponse.body.project.id;

        // Add the second user as a project member.
        await prisma.projectMember.create({
            data: {
                projectId,
                userId: member.id,
                role: 'CONTRIBUTOR',
            },
        });
    });

    afterAll(async () => {
        try {
            await prisma.user.deleteMany({
                where: {
                    email: {
                        in: users.map((user) => user.email),
                    },
                },
            });
        } finally {
            await prisma.$disconnect();
        }
    });

    describe('GET /project/:id', () => {
        it('should allow the project owner to retrieve their project', async () => {
            const response = await ownerAgent
                .get(`/project/${projectId}`);

            expect(response.statusCode).toBe(200);
            expect(response.body.project).toBeDefined();

            expect(response.body.project.id).toBe(projectId);
            expect(response.body.project.name).toBe(
                'Test Wastewater Project'
            );
        });

        it('should allow a project member to retrieve the project', async () => {
            const response = await memberAgent
                .get(`/project/${projectId}`);

            expect(response.statusCode).toBe(200);
            expect(response.body.project.id).toBe(projectId);
        });

        it('should reject users who are not project members', async () => {
            const response = await unrelatedAgent
                .get(`/project/${projectId}`);

            expect(response.statusCode).toBe(404);
        });

        it('should return 404 when the project does not exist', async () => {
            const response = await ownerAgent
                .get('/project/999999999');

            expect(response.statusCode).toBe(404);
        });

        it('should reject invalid project IDs', async () => {
            const response = await ownerAgent
                .get('/project/abc');

            expect(response.statusCode).toBe(400);
        });

        it('should reject unauthenticated users', async () => {
            const response = await request(app)
                .get(`/project/${projectId}`);

            expect(response.statusCode).toBe(401);
        });
    });
    describe('PATCH /project/:id', () => {
        it('should allow the project owner to update the project name', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({ name: 'Updated Wastewater Project' });

            expect(response.statusCode).toBe(200);
            expect(response.body.project.name).toBe('Updated Wastewater Project');
        });

        it('should allow the project owner to update the description', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({ description: 'Updated project description.' });

            expect(response.statusCode).toBe(200);
            expect(response.body.project.description).toBe(
                'Updated project description.'
            );
        });

        it('should allow the project owner to update the stage and status', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({
                    stage: 'SIXTY',
                    status: 'COMPLETED',
                });

            expect(response.statusCode).toBe(200);
            expect(response.body.project.stage).toBe('SIXTY');
            expect(response.body.project.status).toBe('COMPLETED');
        });

        it('should allow the project owner to update multiple fields', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({
                    name: 'Final Project Name',
                    description: 'Final project description.',
                    stage: 'CONSTRUCTION',
                    status: 'ONGOING',
                });

            expect(response.statusCode).toBe(200);
            expect(response.body.project.name).toBe('Final Project Name');
            expect(response.body.project.description).toBe(
                'Final project description.'
            );
            expect(response.body.project.stage).toBe('CONSTRUCTION');
            expect(response.body.project.status).toBe('ONGOING');
        });

        it('should allow the owner to clear the project description', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({ description: null });

            expect(response.statusCode).toBe(200);
            expect(response.body.project.description).toBeNull();
        });

        it('should reject an empty update request', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({});

            expect(response.statusCode).toBe(400);
        });

        it('should reject an invalid project name', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({ name: '   ' });

            expect(response.statusCode).toBe(400);
        });

        it('should reject a project name exceeding 100 characters', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({ name: 'A'.repeat(101) });

            expect(response.statusCode).toBe(400);
        });

        it('should reject an invalid project stage', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({ stage: 'INVALID_STAGE' });

            expect(response.statusCode).toBe(400);
        });

        it('should reject an invalid project status', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({ status: 'INVALID_STATUS' });

            expect(response.statusCode).toBe(400);
        });

        it('should reject an invalid description type', async () => {
            const response = await ownerAgent
                .patch(`/project/${projectId}`)
                .send({ description: 123 });

            expect(response.statusCode).toBe(400);
        });

        it('should reject an invalid project ID', async () => {
            const response = await ownerAgent
                .patch('/project/abc')
                .send({ name: 'Updated Project' });

            expect(response.statusCode).toBe(400);
        });

        it('should reject project members who attempt to update the project', async () => {
            const response = await memberAgent
                .patch(`/project/${projectId}`)
                .send({ name: 'Unauthorized Update' });

            expect(response.statusCode).toBe(404);
        });

        it('should reject unrelated users who attempt to update the project', async () => {
            const response = await unrelatedAgent
                .patch(`/project/${projectId}`)
                .send({ name: 'Unauthorized Update' });

            expect(response.statusCode).toBe(404);
        });

        it('should reject unauthenticated users', async () => {
            const response = await request(app)
                .patch(`/project/${projectId}`)
                .send({ name: 'Unauthorized Update' });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('DELETE /project/:id', () => {
        let deletionProjectId;

        beforeEach(async () => {
            const response = await ownerAgent
                .post('/project')
                .send({
                    name: 'Project Deletion Test',
                    stage: 'THIRTY',
                });

            expect(response.statusCode).toBe(201);

            deletionProjectId = response.body.project.id;
        });

        it('should allow the project owner to delete the project', async () => {

            const response = await ownerAgent
                .delete(`/project/${deletionProjectId}`);

            expect(response.statusCode).toBe(200);

            expect(response.body.message).toBe(
                'Project deleted successfully.'
            );

            const deletedProject = await prisma.project.findUnique({
                where: { id: deletionProjectId },
            });

            expect(deletedProject).toBeNull();
        });

        it('should delete associated checklist items, memberships, and invitations', async () => {
            const member = await prisma.user.findUnique({
                where: { email: users[1].email },
                select: { id: true },
            });

            await prisma.checklistItem.create({
                data: {
                    title: 'Test checklist item',
                    projectId: deletionProjectId,
                },
            });

            await prisma.projectMember.create({
                data: {
                    projectId: deletionProjectId,
                    userId: member.id,
                    role: 'CONTRIBUTOR',
                },
            });

            await prisma.projectInvite.create({
                data: {
                    projectId: deletionProjectId,
                    createdById: ownerAgent.user?.id ?? (
                        await prisma.user.findUnique({
                            where: { email: users[0].email },
                            select: { id: true },
                        })
                    ).id,
                    tokenHash: `test-token-${Date.now()}`,
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                },
            });

            const response = await ownerAgent
                .delete(`/project/${deletionProjectId}`);

            expect(response.statusCode).toBe(200);

            const [items, memberships, invitations] = await Promise.all([
                prisma.checklistItem.count({
                    where: { projectId: deletionProjectId },
                }),
                prisma.projectMember.count({
                    where: { projectId: deletionProjectId },
                }),
                prisma.projectInvite.count({
                    where: { projectId: deletionProjectId },
                }),
            ]);

            expect(items).toBe(0);
            expect(memberships).toBe(0);
            expect(invitations).toBe(0);
        });

        it('should reject project members who attempt to delete the project', async () => {
            const member = await prisma.user.findUnique({
                where: { email: users[1].email },
                select: { id: true },
            });

            await prisma.projectMember.create({
                data: {
                    projectId: deletionProjectId,
                    userId: member.id,
                    role: 'CONTRIBUTOR',
                },
            });

            const response = await memberAgent
                .delete(`/project/${deletionProjectId}`);

            expect(response.statusCode).toBe(404);
        });

        it('should reject unrelated users who attempt to delete the project', async () => {
            const response = await unrelatedAgent
                .delete(`/project/${deletionProjectId}`);

            expect(response.statusCode).toBe(404);
        });

        it('should reject invalid project IDs', async () => {
            const response = await ownerAgent
                .delete('/project/abc');

            expect(response.statusCode).toBe(400);
        });

        it('should reject unauthenticated users', async () => {
            const response = await request(app)
                .delete(`/project/${deletionProjectId}`);

            expect(response.statusCode).toBe(401);
        });
    });
});

