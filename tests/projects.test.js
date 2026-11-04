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
});

