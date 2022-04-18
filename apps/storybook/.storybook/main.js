const path = require('path');

module.exports = {
  stories: [
    "../../../packages/**/*.stories.mdx",
    "../../../packages/**/*.stories.@(js|jsx|ts|tsx)"
  ],
  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    {
      name: '@storybook/preset-scss',
      options: {
        cssLoaderOptions: {
           modules: true,
        }
      }
    },
  ],
  framework: "@storybook/react"
}
