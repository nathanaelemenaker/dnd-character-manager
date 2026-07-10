// app/api/party/route.ts
// Returns all characters in campaigns that the current user belongs to.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Find all campaigns this user is in
  const memberships = await prisma.campaignMember.findMany({
    where: { userId: session.userId },
    select: { campaignId: true, role: true },
  });

  if (memberships.length === 0) {
    return NextResponse.json({ members: [] });
  }

  const campaignIds = memberships.map((m) => m.campaignId);

  // Get all members in those campaigns
  const allMembers = await prisma.campaignMember.findMany({
    where: { campaignId: { in: campaignIds }, characterId: { not: null }, user: { deletedAt: null } },
    select: {
      userId: true,
      role: true,
      campaignId: true,
      character: {
        select: {
          id: true,
          name: true,
          race: true,
          level: true,
          hpCurrent: true,
          hpMax: true,
          hpTemp: true,
          ac: true,
          portrait: true,
          conditions: true,
          classes: { select: { classKey: true, level: true } },
        },
      },
      user: { select: { name: true } },
      campaign: { select: { name: true } },
    },
  });

  // Group by campaign
  const campaignMap: Record<string, { name: string; members: any[] }> = {};
  for (const m of allMembers) {
    if (!m.character) continue;
    if (!campaignMap[m.campaignId]) {
      campaignMap[m.campaignId] = { name: m.campaign.name, members: [] };
    }
    campaignMap[m.campaignId].members.push({
      userId: m.userId,
      userName: m.user.name ?? m.user.name ?? 'Unknown',
      role: m.role,
      isCurrentUser: m.userId === session.userId,
      character: {
        id: m.character.id,
        name: m.character.name,
        race: m.character.race,
        level: m.character.level,
        hpCurrent: m.character.hpCurrent,
        hpMax: m.character.hpMax,
        hpTemp: m.character.hpTemp,
        ac: m.character.ac,
        portrait: m.character.portrait,
        conditions: (m.character.conditions as any) ?? [],
        classes: m.character.classes.map((c: any) => c.classKey).join('/'),
      },
    });
  }

  const campaigns = Object.entries(campaignMap).map(([id, data]) => ({
    id,
    name: data.name,
    members: data.members,
  }));

  return NextResponse.json({ campaigns });
}
