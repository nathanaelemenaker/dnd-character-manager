// app/characters/[id]/page.tsx
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import EditorClient, { type CharacterLite } from './EditorClient';
import AbilitiesClient from './AbilitiesClient';
import InventoryClient from './InventoryClient';
import DerivedStatsClient from './DerivedStatsClient';

type Ruleset = 'SRD_2014' | 'SRD_2024';

export default async function CharacterDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = getSession();
  if (!session) {
    redirect('/');
  }

  const character = await prisma.character.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: {
      id: true,
      name: true,
      level: true,
      ruleset: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!character) {
    notFound();
  }

  const lite: CharacterLite = {
    id: character!.id,
    name: character!.name,
    level: character!.level,
    ruleset: character!.ruleset as Ruleset,
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <h1>{character!.name}</h1>
      <div style={{ display: 'grid', gap: '0.25rem' }}>
        <div><strong>ID:</strong> {character!.id}</div>
        <div><strong>Level:</strong> {character!.level}</div>
        <div><strong>Ruleset:</strong> {character!.ruleset as Ruleset}</div>
        <div><strong>Created:</strong> {new Date(character!.createdAt).toLocaleString()}</div>
        <div><strong>Updated:</strong> {new Date(character!.updatedAt).toLocaleString()}</div>
      </div>

      {/* Inline editor (name/ruleset/level) */}
      <EditorClient initial={lite} />

      {/* Derived stats (AC, equipped weight) */}
      <section>
        <DerivedStatsClient characterId={character!.id} />
      </section>

      <hr />

      <section>
        <h2>Abilities</h2>
        <AbilitiesClient characterId={character!.id} />
      </section>

      <section>
        <h2>Inventory</h2>
        <InventoryClient characterId={character!.id} ruleset={character!.ruleset as Ruleset} />
      </section>

      <section>
        <h2>Classes</h2>
        <p>(Placeholder — to be implemented)</p>
      </section>

      <section>
        <h2>Spells</h2>
        <p>(Placeholder — to be implemented)</p>
      </section>

      <section>
        <h2>Features</h2>
        <p>(Placeholder — to be implemented)</p>
      </section>
    </div>
  );
}