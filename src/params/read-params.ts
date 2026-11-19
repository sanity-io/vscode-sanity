import type {QueryParams} from '../queryParams'
import type {KnownParamValues, KnownValue} from './known-values'

export type ParamAnswer = {kind: 'suggestion'; value: KnownValue} | {kind: 'typed'; text: string}

export type AskParam = (
  variable: string,
  suggestions: Array<KnownValue>,
) => PromiseLike<ParamAnswer | undefined>

/**
 * Asks for the parameters that are missing from `values`. A suggestion keeps the type the schema
 * gives it (the string "42" stays a string); typed text is parsed as JSON when it is, as it always
 * has been.
 */
export async function readMissingParams(
  variables: Array<string>,
  values: QueryParams,
  known: KnownParamValues,
  ask: AskParam,
): Promise<QueryParams> {
  const missing = variables.filter((variable) => !values[variable])
  for (const variable of missing) {
    const answer = await ask(variable, known.get(variable) ?? [])
    if (!answer) {
      continue
    }

    if (answer.kind === 'suggestion') {
      values[variable] = answer.value
      continue
    }

    if (!answer.text) {
      continue
    }

    try {
      values[variable] = JSON.parse(answer.text)
    } catch {
      values[variable] = answer.text
    }
  }

  return values
}
