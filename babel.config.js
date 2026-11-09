module.exports = function (api) {
  const production = api.cache.using(() => process.env.NODE_ENV === 'production');
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // Dev builds fail when React Compiler skips a component; production keeps the default.
          // https://react.dev/reference/react-compiler/panicThreshold
          'react-compiler': { panicThreshold: production ? 'none' : 'all_errors' },
        },
      ],
    ],
    // Drizzle's generated migrations import their .sql files as strings.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
