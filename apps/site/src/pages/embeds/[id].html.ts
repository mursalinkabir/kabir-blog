// One static file per HTML embed: /embeds/<hash>.html. See src/lib/embeds.ts for the safety model.
import type { APIRoute, GetStaticPaths } from 'astro';
import { collectEmbeds, embedDocument } from '~/lib/embeds';

export const getStaticPaths = (() => collectEmbeds().map((e) => ({ params: { id: e.id }, props: { e } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const { e } = props as { e: ReturnType<typeof collectEmbeds>[number] };
  return new Response(embedDocument(e.html, e.title, e.lang), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
