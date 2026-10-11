/** Serialise JSON-LD for a <script type="application/ld+json"> block; `<` is escaped so content can never close the tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
