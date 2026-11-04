
import request from 'supertest';
import { createHash } from 'node:crypto';

import app from '../src/app.js';
import prisma from '../src/config/prisma.js';

const password = 'test-password-123';

const users = [
    {
        username: 'invite-owner',
        email: `invite-owner-${Date.now()}@example.com`,
        password,
    },
    {
        username: 'invite-member',
        email: `invite-member-${Date.now()}@example.com`,
        password,
    },
    {
        username: 'invite-outsider',
        email: `invite-outsider-${Date.now()}@example.com`,
        password,
    },
    {
        username: 'invite-second-outsider',
        email: `invite-second-outsider-${Date.now()}@example.com`,
        password,
    },
];

let ownerAgent;
let memberAgent;
let outsiderAgent;
let secondOutsiderAgent;

let ownerId;
let memberId;
let outsiderId;
let secondOutsiderId;
let projectId;

async function createAuthenticatedUser(user) {
    await request(app)
        .post('/auth/register')
        .send(user)
        .expect(201);

    const agent = request.agent(app);

    await agent
        .post('/auth/login')
        .send({
            email: user.email,
            password: user.password,
        })
        .expect(200);

    return agent;
}

function createInvitation(role = 'CONTRIBUTOR') {
    return ownerAgent
        .post(`/project/${projectId}/invitations`)
        .send({ role });
}

async function createProject(name = 'Invitation Acceptance Test Project') {
    const response = await ownerAgent
        .post('/project')
        .send({
            name,
            stage: 'TEN',
        })
        .expect(201);

    return response.body.project.id;
}

function createInvitationForProject(projectId, role = 'CONTRIBUTOR') {
    return ownerAgent
        .post(`/project/${projectId}/invitations`)
        .send({ role });
}

describe('Project invitation routes', () => {
    beforeAll(async () => {
        // Create authenticated users.
        ownerAgent = await createAuthenticatedUser(users[0]);
        memberAgent = await createAuthenticatedUser(users[1]);
        outsiderAgent = await createAuthenticatedUser(users[2]);
        secondOutsiderAgent = await createAuthenticatedUser(users[3]);

        // Retrieve user IDs.
        const owner = await prisma.user.findUnique({
            where: { email: users[0].email },
            select: { id: true },
        });

        const member = await prisma.user.findUnique({
            where: { email: users[1].email },
            select: { id: true },
        });

        const outsider = await prisma.user.findUnique({
            where: { email: users[2].email },
            select: { id: true },
        });

        const secondOutsider = await prisma.user.findUnique({
            where: { email: users[3].email },
            select: { id: true },
        });

        ownerId = owner.id;
        memberId = member.id;
        outsiderId = outsider.id;
        secondOutsiderId = secondOutsider.id;

        // Create a project owned by the first user.
        const response = await ownerAgent
            .post('/project')
            .send({
                name: 'Invitation Test Project',
                description: 'Project used for invitation tests.',
                stage: 'TEN',
            })
            .expect(201);

        projectId = response.body.project.id;

        // Add the second user as a project contributor.
        await prisma.projectMember.create({
            data: {
                projectId,
                userId: memberId,
                role: 'CONTRIBUTOR',
            },
        });
    });

    afterAll(async () => {
        // Deleting users cascades their owned projects and related records.
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: users.map(user => user.email),
                },
            },
        });

        await prisma.$disconnect();
    });

    describe('POST /project/:id/invitations', () => {
        it('should allow the owner to create a CONTRIBUTOR invitation', async () => {
            const response = await createInvitation('CONTRIBUTOR');

            expect(response.status).toBe(201);
            expect(response.body.invitation).toBeDefined();
            expect(response.body.invitation.role).toBe('CONTRIBUTOR');
            expect(response.body.invitation.token).toBeDefined();
            expect(response.body.invitation.id).toBeDefined();
        });

        it('should allow the owner to create a VIEWER invitation', async () => {
            const response = await createInvitation('VIEWER');

            expect(response.status).toBe(201);
            expect(response.body.invitation.role).toBe('VIEWER');
        });

        it('should reject an invalid invitation role', async () => {
            const response = await createInvitation('ADMIN');

            expect(response.status).toBe(400);
        });

        it('should reject a missing invitation role', async () => {
            const response = await ownerAgent
                .post(`/project/${projectId}/invitations`)
                .send({});

            expect(response.status).toBe(400);
        });

        it('should reject an invitation created by a project member', async () => {
            const response = await memberAgent
                .post(`/project/${projectId}/invitations`)
                .send({ role: 'CONTRIBUTOR' });

            expect(response.status).toBe(404);
        });

        it('should reject an invitation created by an unrelated user', async () => {
            const response = await outsiderAgent
                .post(`/project/${projectId}/invitations`)
                .send({ role: 'CONTRIBUTOR' });

            expect(response.status).toBe(404);
        });

        it('should reject an unauthenticated request', async () => {
            const response = await request(app)
                .post(`/project/${projectId}/invitations`)
                .send({ role: 'CONTRIBUTOR' });

            expect(response.status).toBe(401);
        });

        it('should reject an invalid project ID', async () => {
            const response = await ownerAgent
                .post('/project/invalid/invitations')
                .send({ role: 'CONTRIBUTOR' });

            expect(response.status).toBe(400);
        });

        it('should reject a nonexistent project', async () => {
            const response = await ownerAgent
                .post('/project/999999/invitations')
                .send({ role: 'CONTRIBUTOR' });

            expect(response.status).toBe(404);
        });

        it('should store a token hash instead of the original token', async () => {
            const response = await createInvitation('CONTRIBUTOR')
                .expect(201);

            const token = response.body.invitation.token;

            const tokenHash = createHash('sha256')
                .update(token)
                .digest('hex');

            const storedInvitation = await prisma.projectInvite.findUnique({
                where: { tokenHash },
            });

            expect(storedInvitation).not.toBeNull();
            expect(storedInvitation.tokenHash).toBe(tokenHash);
            expect(storedInvitation.tokenHash).not.toBe(token);
        });

        it('should set the invitation expiration to seven days', async () => {
            const response = await createInvitation('CONTRIBUTOR')
                .expect(201);

            const expiresAt = new Date(
                response.body.invitation.expiresAt
            );

            const expectedExpiration = new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
            );

            // Allow a small timing difference.
            expect(
                Math.abs(expiresAt.getTime() - expectedExpiration.getTime())
            ).toBeLessThan(5000);
        });
    });

    describe('GET /project/:id/invitations', () => {
        it('should allow the owner to retrieve project invitations', async () => {
            await createInvitation('CONTRIBUTOR').expect(201);

            const response = await ownerAgent
                .get(`/project/${projectId}/invitations`)
                .expect(200);

            expect(response.body.count).toBeGreaterThan(0);
            expect(response.body.invitations).toBeInstanceOf(Array);
        });

        it('should return invitation details without exposing token hashes', async () => {
            await createInvitation('VIEWER').expect(201);

            const response = await ownerAgent
                .get(`/project/${projectId}/invitations`)
                .expect(200);

            const invitation = response.body.invitations[0];

            expect(invitation).toHaveProperty('id');
            expect(invitation).toHaveProperty('role');
            expect(invitation).toHaveProperty('expiresAt');
            expect(invitation).toHaveProperty('revokedAt');
            expect(invitation).toHaveProperty('createdAt');
            expect(invitation).toHaveProperty('createdBy');

            expect(invitation).not.toHaveProperty('token');
            expect(invitation).not.toHaveProperty('tokenHash');
        });

        it('should allow the owner to retrieve an empty invitation list', async () => {
            const response = await ownerAgent
                .post('/project')
                .send({
                    name: 'Empty Invitation Project',
                    stage: 'TEN',
                })
                .expect(201);

            const emptyProjectId = response.body.project.id;

            const invitations = await ownerAgent
                .get(`/project/${emptyProjectId}/invitations`)
                .expect(200);

            expect(invitations.body.count).toBe(0);
            expect(invitations.body.invitations).toEqual([]);
        });

        it('should reject a project member retrieving invitations', async () => {
            const response = await memberAgent
                .get(`/project/${projectId}/invitations`);

            expect(response.status).toBe(404);
        });

        it('should reject an unrelated user retrieving invitations', async () => {
            const response = await outsiderAgent
                .get(`/project/${projectId}/invitations`);

            expect(response.status).toBe(404);
        });

        it('should reject an unauthenticated request', async () => {
            const response = await request(app)
                .get(`/project/${projectId}/invitations`);

            expect(response.status).toBe(401);
        });

        it('should reject an invalid project ID', async () => {
            const response = await ownerAgent
                .get('/project/invalid/invitations');

            expect(response.status).toBe(400);
        });

        it('should reject a nonexistent project', async () => {
            const response = await ownerAgent
                .get('/project/999999/invitations');

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /project/:id/invitations/:inviteId', () => {
        it('should allow the owner to revoke an invitation', async () => {
            const created = await createInvitation('CONTRIBUTOR')
                .expect(201);

            const inviteId = created.body.invitation.id;

            const response = await ownerAgent
                .delete(`/project/${projectId}/invitations/${inviteId}`)
                .expect(200);

            expect(response.body.message).toBe(
                'Invitation revoked successfully.'
            );

            const invitation = await prisma.projectInvite.findUnique({
                where: { id: inviteId },
            });

            expect(invitation.revokedAt).not.toBeNull();
        });

        it('should reject revoking an already revoked invitation', async () => {
            const created = await createInvitation('CONTRIBUTOR')
                .expect(201);

            const inviteId = created.body.invitation.id;

            await ownerAgent
                .delete(`/project/${projectId}/invitations/${inviteId}`)
                .expect(200);

            const response = await ownerAgent
                .delete(`/project/${projectId}/invitations/${inviteId}`);

            expect(response.status).toBe(409);
        });

        it('should reject an invalid invitation ID', async () => {
            const response = await ownerAgent
                .delete(`/project/${projectId}/invitations/invalid`);

            expect(response.status).toBe(400);
        });

        it('should reject a nonexistent invitation', async () => {
            const response = await ownerAgent
                .delete(`/project/${projectId}/invitations/999999`);

            expect(response.status).toBe(404);
        });

        it('should reject revoking an invitation belonging to another project', async () => {
            const otherProject = await ownerAgent
                .post('/project')
                .send({
                    name: 'Another Invitation Project',
                    stage: 'TEN',
                })
                .expect(201);

            const otherProjectId = otherProject.body.project.id;

            const created = await ownerAgent
                .post(`/project/${otherProjectId}/invitations`)
                .send({ role: 'VIEWER' })
                .expect(201);

            const inviteId = created.body.invitation.id;

            const response = await ownerAgent
                .delete(`/project/${projectId}/invitations/${inviteId}`);

            expect(response.status).toBe(404);
        });

        it('should reject a project member revoking an invitation', async () => {
            const created = await createInvitation('CONTRIBUTOR')
                .expect(201);

            const inviteId = created.body.invitation.id;

            const response = await memberAgent
                .delete(`/project/${projectId}/invitations/${inviteId}`);

            expect(response.status).toBe(404);
        });

        it('should reject an unrelated user revoking an invitation', async () => {
            const created = await createInvitation('CONTRIBUTOR')
                .expect(201);

            const inviteId = created.body.invitation.id;

            const response = await outsiderAgent
                .delete(`/project/${projectId}/invitations/${inviteId}`);

            expect(response.status).toBe(404);
        });

        it('should reject an unauthenticated request', async () => {
            const created = await createInvitation('CONTRIBUTOR')
                .expect(201);

            const inviteId = created.body.invitation.id;

            const response = await request(app)
                .delete(`/project/${projectId}/invitations/${inviteId}`);

            expect(response.status).toBe(401);
        });

        it('should reject an invalid project ID', async () => {
            const response = await ownerAgent
                .delete('/project/invalid/invitations/1');

            expect(response.status).toBe(400);
        });
    });

    describe('POST /invitations/:token/accept', () => {
        it('should allow an unrelated user to accept a CONTRIBUTOR invitation', async () => {
            const projectId = await createProject();

            const created = await createInvitationForProject(
                projectId,
                'CONTRIBUTOR'
            ).expect(201);

            const token = created.body.invitation.token;

            const response = await outsiderAgent
                .post(`/invitations/${token}/accept`)
                .expect(201);

            expect(response.body.membership).toMatchObject({
                projectId,
                userId: outsiderId,
                role: 'CONTRIBUTOR',
            });

            expect(response.body.project).toMatchObject({
                id: projectId,
                name: 'Invitation Acceptance Test Project',
            });

            const membership = await prisma.projectMember.findUnique({
                where: {
                    projectId_userId: {
                        projectId,
                        userId: outsiderId,
                    },
                },
            });

            expect(membership).not.toBeNull();
            expect(membership.role).toBe('CONTRIBUTOR');
        });

        it('should allow an unrelated user to accept a VIEWER invitation', async () => {
            const projectId = await createProject('Viewer Invitation Project');

            const created = await createInvitationForProject(
                projectId,
                'VIEWER'
            ).expect(201);

            const token = created.body.invitation.token;

            const response = await outsiderAgent
                .post(`/invitations/${token}/accept`)
                .expect(201);

            expect(response.body.membership).toMatchObject({
                projectId,
                userId: outsiderId,
                role: 'VIEWER',
            });
        });

        it('should reject an invalid invitation token', async () => {
            await outsiderAgent
                .post('/invitations/not-a-valid-token/accept')
                .expect(404);
        });

        it('should reject an expired invitation', async () => {
            const projectId = await createProject('Expired Invitation Project');

            const created = await createInvitationForProject(projectId)
                .expect(201);

            const token = created.body.invitation.token;

            const tokenHash = createHash('sha256')
                .update(token)
                .digest('hex');

            await prisma.projectInvite.update({
                where: { tokenHash },
                data: {
                    expiresAt: new Date(Date.now() - 1000),
                },
            });

            await outsiderAgent
                .post(`/invitations/${token}/accept`)
                .expect(410);
        });

        it('should reject a revoked invitation', async () => {
            const projectId = await createProject('Revoked Invitation Project');

            const created = await createInvitationForProject(projectId)
                .expect(201);

            const token = created.body.invitation.token;

            const tokenHash = createHash('sha256')
                .update(token)
                .digest('hex');

            await prisma.projectInvite.update({
                where: { tokenHash },
                data: {
                    revokedAt: new Date(),
                },
            });

            await outsiderAgent
                .post(`/invitations/${token}/accept`)
                .expect(410);
        });

        it('should reject the project owner accepting their own invitation', async () => {
            const projectId = await createProject('Owner Invitation Project');

            const created = await createInvitationForProject(projectId)
                .expect(201);

            const token = created.body.invitation.token;

            await ownerAgent
                .post(`/invitations/${token}/accept`)
                .expect(409);
        });

        it('should reject a user who is already a project member', async () => {
            const projectId = await createProject('Existing Member Invitation Project');

            await prisma.projectMember.create({
                data: {
                    projectId,
                    userId: memberId,
                    role: 'CONTRIBUTOR',
                },
            });

            const created = await createInvitationForProject(projectId)
                .expect(201);

            const token = created.body.invitation.token;

            await memberAgent
                .post(`/invitations/${token}/accept`)
                .expect(409);
        });

        it('should reject an unauthenticated request', async () => {
            const projectId = await createProject('Unauthenticated Invitation Project');

            const created = await createInvitationForProject(projectId)
                .expect(201);

            const token = created.body.invitation.token;

            await request(app)
                .post(`/invitations/${token}/accept`)
                .expect(401);
        });

        it('should reject the same user accepting an invitation twice', async () => {
            const projectId = await createProject('Duplicate Acceptance Project');

            const created = await createInvitationForProject(projectId)
                .expect(201);

            const token = created.body.invitation.token;

            await outsiderAgent
                .post(`/invitations/${token}/accept`)
                .expect(201);

            await outsiderAgent
                .post(`/invitations/${token}/accept`)
                .expect(409);
        });

        it('should allow different users to accept the same invitation', async () => {
            const projectId = await createProject('Reusable Invitation Project');

            const created = await createInvitationForProject(
                projectId,
                'CONTRIBUTOR'
            ).expect(201);

            const token = created.body.invitation.token;

            const firstAcceptance = await outsiderAgent
                .post(`/invitations/${token}/accept`)
                .expect(201);

            const secondAcceptance = await secondOutsiderAgent
                .post(`/invitations/${token}/accept`)
                .expect(201);

            expect(firstAcceptance.body.membership.role).toBe('CONTRIBUTOR');
            expect(secondAcceptance.body.membership.role).toBe('CONTRIBUTOR');

            const memberships = await prisma.projectMember.findMany({
                where: { projectId },
            });

            expect(memberships).toHaveLength(2);
            expect(memberships.map(membership => membership.userId)).toEqual(
                expect.arrayContaining([outsiderId, secondOutsiderId])
            );

            const invitation = await prisma.projectInvite.findUnique({
                where: {
                    tokenHash: createHash('sha256')
                        .update(token)
                        .digest('hex'),
                },
            });

            expect(invitation.revokedAt).toBeNull();
        });
    });
});

