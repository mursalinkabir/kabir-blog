// The tools the MCP endpoint must expose, and the wrapper the check scripts use to call them the way a careful agent
// does: read the document first and send its updatedAt back with every edit of an existing document.
export const EXPECTED_TOOLS = [
  'check_page',
  'check_post',
  'check_project',
  'create_draft',
  'get_global',
  'get_page',
  'get_post',
  'get_project',
  'list_categories',
  'list_media',
  'list_pages',
  'list_posts',
  'list_projects',
  'list_tags',
  'publish_page',
  'publish_post',
  'publish_project',
  'save_page',
  'save_project',
  'site_guide',
  'unpublish_page',
  'unpublish_post',
  'unpublish_project',
  'update_category_name',
  'update_draft',
  'update_media',
  'update_now',
  'update_resume',
  'update_site',
  'update_tag',
  'update_uses',
  'upload_image',
].sort();

/** tool -> how to read the current updatedAt before calling it (null = needs no version). */
const READ_FIRST = {
  update_draft: (a) => ['get_post', { id: a.id }],
  publish_post: (a) => ['get_post', { id: a.id }],
  publish_page: (a) => ['get_page', { id: a.id }],
  publish_project: (a) => ['get_project', { id: a.id }],
};

export function makeCaller(client) {
  const raw = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    let json;
    try {
      json = JSON.parse(text);
    } catch {}
    return { text, json, isError: text.startsWith('ERROR') };
  };
  const call = async (name, args = {}) => {
    const reader = READ_FIRST[name];
    if (reader && args.expected_updated_at === undefined) {
      const [tool, a] = reader(args);
      const seen = await raw(tool, a);
      args = { ...args, expected_updated_at: seen.json?.updatedAt };
    }
    return raw(name, args);
  };
  call.raw = raw;
  return call;
}
