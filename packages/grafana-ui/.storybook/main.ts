module.exports = {
  stories: ['../src/**/*.story.{js,jsx,ts,tsx,mdx}'],
  addons: [
    '@storybook/addon-knobs',
    '@storybook/addon-actions',
    {
      name: '@storybook/addon-docs',
      options: {
        configureJSX: true,
        babelOptions: {},
        sourceLoaderOptions: null,
      },
    },
  ],
};
