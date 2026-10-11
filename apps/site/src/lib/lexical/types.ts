// Subset of Payload's Lexical serialisation that the site renders. Anything else throws at build time.
export interface LexicalText {
  type: 'text';
  text: string;
  format: number; // bit flags: 1 bold, 2 italic, 4 strikethrough, 8 underline, 16 code, 32 sub, 64 sup
}

export interface LexicalElement {
  type: string;
  children?: LexicalNode[];
  tag?: string;
  listType?: 'bullet' | 'number' | 'check';
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

export type LexicalNode = LexicalText | LexicalElement;

export interface LexicalRoot {
  root: { type: 'root'; children: LexicalNode[] };
}

export const isText = (n: LexicalNode): n is LexicalText => n.type === 'text';
