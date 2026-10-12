import { describe, expect, it } from 'vitest';
import {
  autoPublishEnabled,
  dailyLimit,
  defaultPolicy,
  publishProblems,
  withinDailyLimit,
  type PublishInput,
} from '../src/lib/agentPolicy';
import { markdownToLexical } from '../src/lib/markdown';
import { roleOf } from '../src/access';

const body = (n: number) => markdownToLexical('A fairly ordinary sentence for a test. '.repeat(n));
const good = (over: Partial<PublishInput> = {}): PublishInput => ({
  locale: 'en',
  title: 'A decent title',
  description: 'One sentence that says what the post is about.',
  slug: 'a-decent-title',
  content: body(30),
  publishedIn: true,
  hasCategory: true,
  ...over,
});

describe('publishProblems()', () => {
  it('passes a complete post', () => expect(publishProblems(good())).toEqual([]));

  it('lists every missing piece, in the language being judged', () => {
    const p = publishProblems(good({ locale: 'ja', title: '', description: '', content: null, slug: '', hasCategory: false }));
    expect(p.join('\n')).toMatch(/no ja title/);
    expect(p.join('\n')).toMatch(/no ja description/);
    expect(p.join('\n')).toMatch(/no ja text/);
    expect(p.join('\n')).toMatch(/no slug/);
    expect(p.join('\n')).toMatch(/no category/);
  });

  it('enforces length limits and a minimum body that differs by language', () => {
    expect(publishProblems(good({ title: 'x'.repeat(121) })).join()).toMatch(/limit is 120/);
    expect(publishProblems(good({ description: 'x'.repeat(161) })).join()).toMatch(/limit is 160/);
    const short = markdownToLexical('短い文章です。'.repeat(10)); // 70 characters
    expect(publishProblems(good({ locale: 'ja', content: short })).join()).toMatch(/at least 300/);
    const enough = markdownToLexical('これは十分に長い日本語の文章です。'.repeat(25)); // 425 characters
    expect(publishProblems(good({ locale: 'ja', content: enough }))).toEqual([]);
    expect(publishProblems(good({ content: markdownToLexical('x '.repeat(100)) })).join()).toMatch(/at least 600/);
  });

  it('requires visibility and a cover with alt text in this language', () => {
    expect(publishProblems(good({ publishedIn: false })).join()).toMatch(/Visible in this language/);
    expect(publishProblems(good({ coverHasAlt: false })).join()).toMatch(/no en alt text/);
    expect(publishProblems(good({ coverHasAlt: true }))).toEqual([]);
  });

  it('refuses private data: an email, a phone number (also at the end of a sentence), a postal code, the denylist', () => {
    const withText = (t: string) => good({ content: markdownToLexical('A fairly ordinary sentence for a test. '.repeat(30) + t) });
    expect(publishProblems(withText('Mail me at someone.private@gmail.com'))).toEqual([expect.stringMatching(/^Privacy: email/)]);
    expect(publishProblems(withText('Call 090-1234-5678.')).join()).toMatch(/Privacy: phone/);
    expect(publishProblems(withText('Send it to 〒160-0022.')).join()).toMatch(/Privacy/);
    const policy = { ...defaultPolicy({}), denylist: ['sakura street'] };
    expect(publishProblems(withText('I live on Sakura Street.'), policy).join()).toMatch(/denylisted/);
  });

  it('never lets script through, even if it somehow got into the content', () => {
    const doc = markdownToLexical('A fairly ordinary sentence for a test. '.repeat(30));
    doc.root.children.push({
      type: 'block',
      version: 2,
      format: '',
      fields: { id: 'x', blockType: 'html-embed', html: '<script>1</script>', title: 't' },
    });
    expect(publishProblems(good({ content: doc })).join()).toMatch(/HTML embeds can only be added by an admin/);
  });
});

describe('limits and the kill switch', () => {
  it('daily limit', () => {
    expect(withinDailyLimit(2, 3)).toBe(true);
    expect(withinDailyLimit(3, 3)).toBe(false);
    expect(dailyLimit({})).toBe(6);
    expect(dailyLimit({ AGENT_MAX_PUBLISHES_PER_DAY: '2' } as never)).toBe(2);
    expect(dailyLimit({ AGENT_MAX_PUBLISHES_PER_DAY: 'lots' } as never)).toBe(6);
    expect(dailyLimit({ AGENT_MAX_PUBLISHES_PER_DAY: '-1' } as never)).toBe(6);
  });

  it('auto-publish is off unless it is exactly "1"', () => {
    expect(autoPublishEnabled({})).toBe(false);
    expect(autoPublishEnabled({ AGENT_AUTO_PUBLISH: 'true' } as never)).toBe(false);
    expect(autoPublishEnabled({ AGENT_AUTO_PUBLISH: '0' } as never)).toBe(false);
    expect(autoPublishEnabled({ AGENT_AUTO_PUBLISH: '1' } as never)).toBe(true);
  });
});

describe('roleOf(): only a users account has a role', () => {
  it('reads the role of a users document', () => {
    expect(roleOf({ collection: 'users', role: 'agent' })).toBe('agent');
    expect(roleOf({ collection: 'users', role: 'admin' })).toBe('admin');
  });
  it('ignores an MCP key document, even one that claims a role', () => {
    expect(roleOf({ collection: 'payload-mcp-api-keys', role: 'admin' })).toBeUndefined();
    expect(roleOf(null)).toBeUndefined();
    expect(roleOf(undefined)).toBeUndefined();
  });
});
