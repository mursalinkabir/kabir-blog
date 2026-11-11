import type { ReactElement, ReactNode } from 'react';
import { t, type Locale } from '../../i18n';
import { isText, type LexicalNode, type LexicalRoot } from '../../lib/lexical/types';
import { escapeHtml, inlineToHtml } from '../../lib/lexical/inline';
import { headings, headingId, listItems, plainText } from '../../lib/lexical/walk';
import { embedPath } from '../../lib/embeds';
import { numericColumns } from '../../lib/table';
import type { Media } from '../../lib/types';
import type { Prepared } from '../../render/prepare';
import { cx } from '../cx';
import { MediaImage } from '../components/MediaImage';

type Fields = Record<string, any>;
interface Ctx {
  locale: Locale;
  prepared: Prepared;
}

/** `inlineToHtml` escapes every piece of text itself (tested in tests/lexical.test.ts); its output is trusted markup. */
const inline = (nodes: LexicalNode[]) => ({ __html: inlineToHtml(nodes) });

/**
 * A rendered code frame. Expressive Code returns `<div class="expressive-code">…</div>`; that element is rebuilt here with
 * its inner markup so the frame is a direct child of `.prose` (the stylesheet spaces blocks with `.prose > * + *`).
 */
function CodeFrame({ html }: { html: string }): ReactElement {
  const m = /^<div class="expressive-code">([\s\S]*)<\/div>$/.exec(html);
  if (!m) throw new Error('Unexpected code frame markup');
  return <div className="expressive-code" dangerouslySetInnerHTML={{ __html: m[1]! }} />;
}

const ALLOWED = ['text', 'paragraph', 'heading', 'list', 'quote', 'horizontalrule', 'block', 'linebreak', 'link', 'inlineBlock', 'table'];

/** A rich-text document. Throws on a node or block it does not know, so an unsupported edit fails loudly on that one page. */
export function RichText({ doc, locale, prepared }: { doc: LexicalRoot; locale: Locale; prepared: Prepared }): ReactElement {
  headings(doc); // assigns heading ids once, so the TOC and the body agree
  const ctx = { locale, prepared };
  return (
    <>
      {doc.root.children.map((node, i) => (
        <Node key={i} node={node} ctx={ctx} />
      ))}
    </>
  );
}

function Node({ node, ctx }: { node: LexicalNode; ctx: Ctx }): ReactNode {
  const { locale } = ctx;
  if (!ALLOWED.includes(node.type)) throw new Error(`Unsupported Lexical node "${node.type}"`);
  const kids = isText(node) ? [] : (node.children ?? []);
  const fields = (isText(node) ? {} : (node.fields ?? {})) as Fields;

  switch (node.type) {
    case 'paragraph':
      return <p dangerouslySetInnerHTML={inline(kids)} />;
    case 'heading': {
      const tag = !isText(node) && /^h[2-4]$/.test(String(node.tag)) ? String(node.tag) : 'h2';
      const Tag = tag as 'h2';
      const id = headingId(node);
      const anchor = id ? `<a class="anchor" href="#${escapeHtml(id)}" aria-hidden="true" tabindex="-1">#</a>` : '';
      return <Tag id={id} dangerouslySetInnerHTML={{ __html: inlineToHtml(kids) + anchor }} />;
    }
    case 'list': {
      const isCheck = !isText(node) && node.listType === 'check';
      const ListTag = (!isText(node) && node.listType === 'number' ? 'ol' : 'ul') as 'ul';
      return (
        <ListTag className={isCheck ? 'checklist' : undefined}>
          {listItems(node).map((entry, i) =>
            !isCheck && entry.nested.length === 0 ? (
              <li key={i} className={entry.checked ? 'is-checked' : undefined} dangerouslySetInnerHTML={inline(entry.inline)} />
            ) : (
              <li key={i} className={entry.checked ? 'is-checked' : undefined}>
                {isCheck && (
                  <>
                    <span className="check-mark" aria-hidden="true" />
                    <span className="visually-hidden">{t(locale, entry.checked ? 'a11y.done' : 'a11y.todo')}</span>
                  </>
                )}
                <span style={{ display: 'contents' }} dangerouslySetInnerHTML={inline(entry.inline)} />
                {entry.nested.map((l, j) => (
                  <Node key={j} node={l} ctx={ctx} />
                ))}
              </li>
            ),
          )}
        </ListTag>
      );
    }
    case 'quote':
      return <blockquote dangerouslySetInnerHTML={inline(kids)} />;
    case 'horizontalrule':
      return <hr />;
    case 'table':
      return <Table rows={kids} locale={locale} />;
    case 'block':
      return <Block node={node} fields={fields} ctx={ctx} />;
    default:
      return <p dangerouslySetInnerHTML={{ __html: inlineToHtml([node]) }} />;
  }
}

function Block({ node, fields, ctx }: { node: LexicalNode; fields: Fields; ctx: Ctx }): ReactNode {
  const { locale, prepared } = ctx;
  const got = prepared.blocks.get(node);
  switch (fields.blockType) {
    case 'code':
    case 'terminal':
      if (got?.html === undefined) throw new Error(`Code block was not prepared (${fields.blockType})`);
      return fields.blockType === 'code' ? (
        <CodeFrame html={got.html} />
      ) : (
        <div className="terminal">
          <CodeFrame html={got.html} />
          {fields.output && (
            <pre className="terminal-output" tabIndex={0}>
              {String(fields.output)}
            </pre>
          )}
        </div>
      );
    case 'callout': {
      const kind = fields.kind ?? 'note';
      return (
        <div className={`callout callout-${kind}`} role="note">
          <p className="callout-title">{fields.title ?? t(locale, `a11y.callout.${kind}` as 'a11y.callout.note')}</p>
          <RichText doc={fields.body} locale={locale} prepared={prepared} />
        </div>
      );
    }
    case 'figure':
      return (
        <figure className="figure">
          <MediaImage media={fields.media as Media} locale={locale} />
          {(fields.caption || fields.credit) && (
            <figcaption>
              {fields.caption}
              {fields.caption && fields.credit ? ' ' : ''}
              {fields.credit && <span className="credit">{fields.credit}</span>}
            </figcaption>
          )}
        </figure>
      );
    case 'gallery-strip':
      return (
        <div className="gallery-strip" role="group" tabIndex={0} aria-label={t(locale, 'a11y.gallery')}>
          {(fields.media as Media[]).map((m, i) => (
            <MediaImage key={i} media={m} locale={locale} sizes="20rem" />
          ))}
        </div>
      );
    case 'diagram':
      return got?.svg ? (
        <figure className="diagram">
          <img src={got.svg} alt={fields.alt ?? t(locale, 'a11y.diagram')} loading="lazy" decoding="async" />
          <details>
            <summary>{t(locale, 'a11y.diagramSource')}</summary>
            <pre>{String(fields.source)}</pre>
          </details>
        </figure>
      ) : (
        <CodeFrame html={got?.html ?? ''} />
      );
    case 'html-embed': {
      const start = Math.min(Math.max(Math.round(fields.height ?? 480) || 480, 120), 2400);
      // sandbox="allow-scripts" and NOTHING else: no allow-same-origin (opaque origin: no cookies, no storage, no access
      // to this page), no top navigation, no popups, no forms. tests/richText.test.ts pins this.
      return (
        <figure className="embed">
          <iframe
            src={embedPath(String(fields.html))}
            title={fields.title}
            sandbox="allow-scripts"
            allow=""
            referrerPolicy="no-referrer"
            loading="lazy"
            data-embed=""
            height={start}
          />
          <noscript>
            <p className="embed-note">{t(locale, 'embed.needsScript')}</p>
          </noscript>
          {fields.caption && <figcaption>{fields.caption}</figcaption>}
        </figure>
      );
    }
    default:
      throw new Error(`Unknown Lexical block "${fields.blockType}"`);
  }
}

function Table({ rows, locale }: { rows: LexicalNode[]; locale: Locale }): ReactElement {
  type Cell = { html: string; text: string; header: boolean };
  const grid: Cell[][] = rows.map((row) =>
    ((isText(row) ? [] : row.children) ?? []).map((cell) => {
      const paras = isText(cell) ? [] : (cell.children ?? []);
      return {
        html: paras.map((p) => inlineToHtml(isText(p) ? [p] : (p.children ?? []))).join('<br>'),
        text: plainText(paras).trim(),
        header: !isText(cell) && Number(cell.headerState) > 0,
      };
    }),
  );
  const numeric = numericColumns(grid);
  const [first, ...rest] = grid;
  const hasHead = first?.every((c) => c.header);
  const bodyRows = hasHead ? rest : grid;
  return (
    <div className="table-wrap" role="region" tabIndex={0} aria-label={t(locale, 'a11y.table')}>
      <table>
        {hasHead && (
          <thead>
            <tr>
              {first!.map((c, i) => (
                <th key={i} scope="col" className={cx(numeric[i] && 'num')} dangerouslySetInnerHTML={{ __html: c.html }} />
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, r) => (
            <tr key={r}>
              {row.map((c, i) =>
                c.header ? (
                  <th key={i} scope="row" className={cx(numeric[i] && 'num')} dangerouslySetInnerHTML={{ __html: c.html }} />
                ) : (
                  <td key={i} className={cx(numeric[i] && 'num')} dangerouslySetInnerHTML={{ __html: c.html }} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
