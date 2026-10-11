/** Environment variables as plain strings; process.env fits, and so does a test object. */
export type EnvSource = Readonly<Record<string, string | undefined>>;
