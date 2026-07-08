// app/characters/page.tsx
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import CharacterListClient from './CharacterListClient';

export const dynamic = 'force-dynamic';

export default async function CharactersPage() {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  const characters = await prisma.character.findMany({
    where: { ownerId: session.userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, level: true, race: true,
      hpCurrent: true, hpMax: true, ac: true,
      updatedAt: true,
      classes: {
        select: { classKey: true, subclassKey: true, level: true },
        orderBy: { id: 'asc' },
      },
    },
  });

  return <CharacterListClient characters={characters} />;
}
