export type FlagValue = string | number | boolean | undefined;

const toKebab = (key: string): string => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const assertNoNul = (value: string): string => {
  if (value.includes('\u0000')) throw new Error('Argument values must not contain NUL bytes');
  return value;
};

/**
 * Builds an argv for the orca CLI. Values are always rendered as `--flag=value`
 * so user text that starts with a dash can never be parsed as another flag.
 */
export function buildArgs(command: readonly string[], flags: Readonly<Record<string, FlagValue>>): string[] {
  const flagArgs = Object.entries(flags).flatMap(([key, value]) => {
    if (value === undefined || value === false) return [];
    const flag = `--${toKebab(key)}`;
    return value === true ? [flag] : [`${flag}=${assertNoNul(String(value))}`];
  });

  return [...command, ...flagArgs, '--json'];
}
