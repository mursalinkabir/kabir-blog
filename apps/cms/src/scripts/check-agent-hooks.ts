/**
 * The agent's limits hold below the MCP tools, in access rules and hooks: this calls Payload's Local API as the agent
 * user (access rules ON), the same path any other use of the agent's key would take. Needs a seeded local database
 * and `pnpm cms:agent-key`. Refuses a database that is not on this machine. Creates and removes its own lock.
 *
 *   pnpm --filter @smkabir/cms exec payload run src/scripts/check-agent-hooks.ts
 */
import { getPayload } from 'payload';
import config from '../payload.config';

const host = new URL(process.env.DATABASE_URL ?? 'postgres://x@invalid').hostname;
if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('local database only');

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? `\n        ${detail.slice(0, 400)}` : ''}`);
};
const refused = async (fn: () => Promise<unknown>): Promise<{ threw: boolean; message: string }> => {
  try {
    await fn();
    return { threw: false, message: '' };
  } catch (e) {
    return { threw: true, message: e instanceof Error ? e.message : String(e) };
  }
};

try {
  const payload = await getPayload({ config });
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: 'agent@smkabir.test' } },
    limit: 1,
    overrideAccess: true,
  });
  const agentDoc = found.docs[0];
  if (!agentDoc) throw new Error('no agent user: run `pnpm cms:agent-key` first');
  const agent = { ...agentDoc, collection: 'users' } as never;
  const as = { user: agent, overrideAccess: false as const };
  const admin = (await payload.find({ collection: 'users', where: { role: { equals: 'admin' } }, limit: 1, overrideAccess: true })).docs[0];
  const stamp = Date.now().toString(36);

  const embed = (id: string, html: string) => ({
    type: 'block',
    version: 2,
    format: '',
    fields: { id, blockType: 'html-embed', title: 't', html },
  });
  const lexical = (...extra: unknown[]) => ({
    root: {
      type: 'root',
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [{ type: 'text', version: 1, text: 'Hello from the hook check.', format: 0, mode: 'normal', style: '', detail: 0 }],
        },
        ...extra,
      ],
    },
  });

  console.log('== embeds and photo strips');
  const cat = (await payload.find({ collection: 'categories', limit: 1, overrideAccess: true })).docs[0];
  const newEmbed = await refused(() =>
    payload.create({
      collection: 'posts',
      draft: true,
      locale: 'en',
      data: { slug: `zz-hook-${stamp}`, category: cat.id, content: lexical(embed('e1', '<p>hi</p>')) } as never,
      ...as,
    }),
  );
  ok('an agent cannot create a post that carries an embed', newEmbed.threw && /HTML embeds/.test(newEmbed.message), newEmbed.message);

  // A person's post with an embed.
  const human = await payload.create({
    collection: 'posts',
    draft: true,
    locale: 'en',
    overrideAccess: true,
    data: {
      slug: `zz-hook-human-${stamp}`,
      category: cat.id,
      title: 'Human post',
      description: 'A post a person wrote.',
      content: lexical(embed('keep1', '<p>original</p>')),
      publishedIn: false,
      _status: 'draft',
    } as never,
  });
  const sameContent = lexical(embed('keep1', '<p>original</p>'));
  const keepOk = await refused(() =>
    payload.update({
      collection: 'posts',
      id: human.id,
      draft: true,
      locale: 'en',
      data: { title: 'Edited by the agent', content: sameContent } as never,
      ...as,
    }),
  );
  ok("an agent can save a post with a person's embed unchanged", !keepOk.threw, keepOk.message);
  const changed = await refused(() =>
    payload.update({
      collection: 'posts',
      id: human.id,
      draft: true,
      locale: 'en',
      data: { content: lexical(embed('keep1', '<script>alert(1)</script>')) } as never,
      ...as,
    }),
  );
  ok('...but not with the embed altered', changed.threw && /HTML embeds/.test(changed.message), changed.message);
  const added = await refused(() =>
    payload.update({
      collection: 'posts',
      id: human.id,
      draft: true,
      locale: 'en',
      data: { content: lexical(embed('keep1', '<p>original</p>'), embed('new1', '<p>x</p>')) } as never,
      ...as,
    }),
  );
  ok('...nor with a second embed added', added.threw && /HTML embeds/.test(added.message), added.message);
  const stillOwner = (await payload.findByID({ collection: 'posts', id: human.id, draft: true, overrideAccess: true })) as {
    createdByAgent?: boolean;
  };
  ok("editing does not make the post the agent's", stillOwner.createdByAgent !== true);

  console.log('== nothing can be deleted');
  for (const [collection, id] of [
    ['posts', human.id],
    ['pages', (await payload.find({ collection: 'pages', limit: 1, overrideAccess: true })).docs[0]?.id],
    ['projects', (await payload.find({ collection: 'projects', limit: 1, overrideAccess: true })).docs[0]?.id],
    ['tags', (await payload.find({ collection: 'tags', limit: 1, overrideAccess: true })).docs[0]?.id],
    ['media', (await payload.find({ collection: 'media', limit: 1, overrideAccess: true })).docs[0]?.id],
    ['categories', cat.id],
  ] as const) {
    const r = await refused(() => payload.delete({ collection, id: id as number, ...as }));
    ok(`an agent cannot delete from ${collection}`, r.threw, r.message);
  }

  console.log('== fields and collections that stay with admins');
  const catSlug = cat.slug;
  await refused(() =>
    payload.update({ collection: 'categories', id: cat.id, data: { slug: catSlug === 'tech' ? 'finance' : 'tech' } as never, ...as }),
  );
  ok(
    'the category slug does not change',
    (await payload.findByID({ collection: 'categories', id: cat.id, overrideAccess: true })).slug === catSlug,
  );
  const newCat = await refused(() => payload.create({ collection: 'categories', data: { slug: 'tech', name: 'x' } as never, ...as }));
  ok('an agent cannot create a category', newCat.threw, newCat.message);
  const siteBefore = (await payload.findGlobal({ slug: 'site', overrideAccess: true })) as { email?: string };
  await refused(() => payload.updateGlobal({ slug: 'site', data: { email: 'someone.else@example.org' } as never, ...as }));
  ok(
    'the site contact email does not change',
    ((await payload.findGlobal({ slug: 'site', overrideAccess: true })) as { email?: string }).email === siteBefore.email,
  );
  const resumeBefore = (await payload.findGlobal({ slug: 'resume', overrideAccess: true })) as { basics?: { email?: string } };
  await refused(() =>
    payload.updateGlobal({
      slug: 'resume',
      data: { basics: { ...resumeBefore.basics, email: 'someone.else@example.org' } } as never,
      ...as,
    }),
  );
  ok(
    'the resume contact email does not change',
    ((await payload.findGlobal({ slug: 'resume', overrideAccess: true })) as { basics?: { email?: string } }).basics?.email ===
      resumeBefore.basics?.email,
  );
  await refused(() => payload.update({ collection: 'users', id: agentDoc.id, data: { role: 'admin' } as never, ...as }));
  ok(
    'an agent cannot make itself an admin',
    (await payload.findByID({ collection: 'users', id: agentDoc.id, overrideAccess: true })).role === 'agent',
  );
  const files = await refused(() => payload.find({ collection: 'agent-log', limit: 1, ...as }));
  ok(
    'an agent cannot read the audit log',
    files.threw || (await payload.find({ collection: 'agent-log', limit: 1, ...as })).docs.length === 0,
    files.message,
  );
  const mediaId = (await payload.find({ collection: 'media', limit: 1, overrideAccess: true })).docs[0].id;
  const swap = await refused(() =>
    payload.update({
      collection: 'media',
      id: mediaId,
      file: { data: Buffer.from('x'), mimetype: 'image/png', name: 'x.png', size: 1 },
      data: {} as never,
      ...as,
    }),
  );
  ok('an agent cannot replace an image file', swap.threw, swap.message);

  console.log('== a document a person has open');
  const page = (await payload.find({ collection: 'pages', limit: 1, overrideAccess: true })).docs[0];
  const lock = await payload.create({
    collection: 'payload-locked-documents',
    overrideAccess: true,
    data: {
      document: { relationTo: 'pages', value: page.id },
      globalSlug: undefined,
      user: { relationTo: 'users', value: admin.id },
    } as never,
  });
  const locked = await refused(() =>
    payload.update({
      collection: 'pages',
      id: page.id,
      draft: true,
      locale: 'en',
      data: { title: 'Edited while locked' } as never,
      ...as,
      overrideLock: false,
    }),
  );
  ok(
    'an edit is refused while an admin has the document open (overrideLock: false)',
    locked.threw && /lock/i.test(locked.message),
    locked.message,
  );
  await payload.delete({ collection: 'payload-locked-documents', id: lock.id, overrideAccess: true });
  const unlocked = await refused(() =>
    payload.update({
      collection: 'pages',
      id: page.id,
      draft: true,
      locale: 'en',
      data: { title: page.title as string } as never,
      ...as,
      overrideLock: false,
    }),
  );
  ok('...and allowed again once the lock is gone', !unlocked.threw, unlocked.message);

  await payload.delete({ collection: 'posts', id: human.id, overrideAccess: true });
  console.log(`\nagent hook checks: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
