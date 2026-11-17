/* tslint:disable */
/* eslint-disable */

/**
 * The query as groq-format prints it, wrapped to `width` columns, comments kept. A query that
 * does not parse gives `undefined`.
 */
export function format(query: string, width: number): string | undefined;
