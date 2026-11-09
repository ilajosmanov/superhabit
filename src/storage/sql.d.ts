// babel-plugin-inline-import turns a migration's `.sql` import into its text.
declare module '*.sql' {
  const text: string;
  export default text;
}
