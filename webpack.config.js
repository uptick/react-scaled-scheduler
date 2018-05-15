var path = require('path');
var NodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/index.js',
  output: {
    path: __dirname + '/dist',
    filename: 'react-scaled-scheduler.js',
    library: 'react-scaled-scheduler',
    libraryTarget: 'umd',
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        use: [
          {
            loader: 'babel-loader',
            query: {
              presets: [
                'env',
                'react',
                'stage-0',
              ],
              plugins: [
                'transform-decorators-legacy',
              ],
            },
          },
        ],
      }
    ],
  },
  externals: NodeExternals(),
};
