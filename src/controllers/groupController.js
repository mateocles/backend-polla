const { randomUUID } = require('crypto');
const prisma = require('../lib/prisma');
const EmailService = require('../services/emailService');

class GroupController {
  static async createGroup(req, res) {
    try {
      const { name, isPublic } = req.body;
      const ownerId = req.user.userId;

      // Generate a unique short code for invites
      const inviteCode = randomUUID().substring(0, 8);

      const group = await prisma.group.create({
        data: {
          name,
          isPublic: !!isPublic,
          ownerId,
          inviteCode,
          members: {
            create: {
              userId: ownerId
            }
          }
        }
      });

      res.status(201).json(group);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async listGroups(req, res) {
    try {
      const userId = req.user.userId;

      const userGroups = await prisma.userGroup.findMany({
        where: { userId },
        include: {
          group: {
            include: {
              members: {
                include: {
                  user: { include: { predictions: true } }
                }
              }
            }
          }
        }
      });

      const groups = userGroups.map(ug => {
        const g = ug.group;
        // Ranking del grupo (puntos totales por miembro) para derivar mi posición.
        const board = g.members
          .map(m => ({
            userId: m.user.id,
            totalPoints: m.user.predictions.reduce((s, p) => s + p.points, 0)
          }))
          .sort((a, b) => b.totalPoints - a.totalPoints);
        const idx = board.findIndex(r => r.userId === userId);

        return {
          id: g.id,
          name: g.name,
          imageUrl: g.imageUrl,
          isPublic: g.isPublic,
          inviteCode: g.inviteCode,
          ownerId: g.ownerId,
          createdAt: g.createdAt,
          memberCount: g.members.length,
          myRank: idx >= 0 ? idx + 1 : null,
          myPoints: idx >= 0 ? board[idx].totalPoints : 0,
          isAdmin: g.ownerId === userId
        };
      });

      res.json(groups);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Lista grupos públicos a los que el usuario NO pertenece.
  static async listPublicGroups(req, res) {
    try {
      const userId = req.user.userId;
      const groups = await prisma.group.findMany({
        where: { isPublic: true, members: { none: { userId } } },
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json(
        groups.map((g) => ({
          id: g.id,
          name: g.name,
          imageUrl: g.imageUrl,
          isPublic: true,
          ownerId: g.ownerId,
          memberCount: g._count.members,
        }))
      );
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Unirse a un grupo público por id (sin código).
  static async joinPublicGroup(req, res) {
    try {
      const userId = req.user.userId;
      const { groupId } = req.params;

      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (!group.isPublic) return res.status(403).json({ error: 'El grupo no es público' });

      const existing = await prisma.userGroup.findUnique({
        where: { userId_groupId: { userId, groupId } },
      });
      if (existing) return res.status(400).json({ error: 'Ya eres miembro del grupo' });

      await prisma.userGroup.create({ data: { userId, groupId } });
      res.json({ message: 'Joined group successfully', groupId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Editar nombre/imagen del grupo. Solo el admin (owner) puede hacerlo.
  static async updateGroup(req, res) {
    try {
      const { groupId } = req.params;
      const { name, imageUrl } = req.body;
      const userId = req.user.userId;

      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (group.ownerId !== userId) {
        return res.status(403).json({ error: 'Only the group admin can edit it' });
      }

      const data = {};
      if (typeof name === 'string' && name.trim()) data.name = name.trim();
      if (imageUrl !== undefined) data.imageUrl = imageUrl;

      const updated = await prisma.group.update({ where: { id: groupId }, data });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async inviteUser(req, res) {
    try {
      const { groupId, email } = req.body;
      const userId = req.user.userId;

      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });

      if (!group) return res.status(404).json({ error: 'Group not found' });

      // Verify the user is the owner (or just a member if you allow members to invite)
      if (group.ownerId !== userId) {
        return res.status(403).json({ error: 'Only group owner can invite' });
      }

      await EmailService.sendInvite(email, group.name, group.inviteCode);
      res.json({ message: 'Invitation sent' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async joinGroup(req, res) {
    try {
      const { inviteCode } = req.body;
      const userId = req.user.userId;

      const group = await prisma.group.findUnique({
        where: { inviteCode }
      });

      if (!group) return res.status(404).json({ error: 'Invalid invite code' });

      // Check if already member
      const existingMembership = await prisma.userGroup.findUnique({
        where: {
          userId_groupId: { userId, groupId: group.id }
        }
      });

      if (existingMembership) {
        return res.status(400).json({ error: 'Already a member of this group' });
      }

      await prisma.userGroup.create({
        data: { userId, groupId: group.id }
      });

      res.json({ message: 'Joined group successfully', groupId: group.id });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = GroupController;
