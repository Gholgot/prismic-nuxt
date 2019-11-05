const path = require('path');
const Prismic = require('prismic-javascript');
const fs = require('fs');
const logger = require('./logger');

function install(moduleOptions) {
  const options = {
    preview: true,
    components: true,
    ...moduleOptions,
    ...(this.options.prismic || {}),
  };
  if (options.preview === true) {
    options.preview = '/preview';
  }
  const repo = options.endpoint.replace(/^https?:\/\//, '').replace(/(\.cdn)?\.prismic.+/, '');

  // Add in Prismic libraries to enable preview
  if (options.preview) {
    // Add /preview
    this.addTemplate({
      fileName: 'prismic/pages/preview.vue',
      src: path.join(__dirname, 'templates/pages/preview.vue'),
    });
    this.extendRoutes((routes, resolve) => {
      routes.push({
        name: 'prismic-preview',
        path: options.preview,
        component: resolve(this.options.buildDir, 'prismic/pages/preview.vue'),
      });
    });
    // Add prismic-preview middleware
    this.addPlugin({
      fileName: 'prismic/middleware/prismic_preview.js',
      src: path.join(__dirname, 'templates/middleware/prismic_preview.js'),
    });
    this.options.router = this.options.router || {};
    this.options.router.middleware = this.options.router.middleware || [];
    this.options.router.middleware.unshift('prismic_preview');
  }

  // Add components
  if (options.components) {
    this.addPlugin({
      fileName: 'prismic/components/PrismicImage.js',
      src: path.resolve(__dirname, 'templates/components/PrismicImage.js'),
    });
    this.addPlugin({
      fileName: 'prismic/components/PrismicLink.js',
      src: path.resolve(__dirname, 'templates/components/PrismicLink.js'),
    });
  }

  // Add templates & prismic plugin
  const app = this.options.dir.app || 'app';
  const userLinkResolver = path.join(this.options.srcDir, app, 'prismic', 'link-resolver.js');
  const userLinkResolverExists = fs.existsSync(userLinkResolver);
  const userHtmlSerializer = path.join(this.options.srcDir, app, 'prismic', 'html-serializer.js');

  if (!userLinkResolverExists && !options.linkResolver) {
    logger.warn('Please create ~/app/prismic/link-resolver.js');
  }
  this.addTemplate({
    fileName: 'prismic/link-resolver.js',
    src: userLinkResolverExists ? userLinkResolver : path.join(__dirname, 'templates/link-resolver.js'),
    options,
  });
  this.addTemplate({
    fileName: 'prismic/html-serializer.js',
    src: fs.existsSync(userHtmlSerializer) ? userHtmlSerializer : path.join(__dirname, 'templates/html-serializer.js'),
    options,
  });
  this.addPlugin({
    fileName: 'prismic/plugins/prismic.js',
    src: path.resolve(__dirname, 'templates/plugins/prismic.js'),
    options: {
      preview: options.preview,
      endpoint: options.endpoint,
      repo,
      script: `//static.cdn.prismic.io/prismic.min.js?repo=${repo}&new=true`,
    },
  });

  if (!options.disableDefaultGenerator) {
    this.nuxt.hook('generate:before', async () => {
      const maybeF = this.options.generate.routes || [];
      this.options.generate.routes = async () => {
        const client = await Prismic.client(options.endpoint);
        async function fetchRoutes(page = 1, routes = []) {
          const response = await client.query('', { pageSize: 100, lang: '*', page });
          const allRoutes = routes.concat(response.results.map(moduleOptions.linkResolver));
          /* istanbul ignore next */
          if (response.results_size + routes.length < response.total_results_size) {
            return fetchRoutes(client, page + 1, allRoutes);
          }
          return [...new Set(allRoutes)];
        }
        const prismicRoutes = await fetchRoutes();
        const userRoutes = typeof maybeF === 'function' ? await maybeF() : maybeF;
        return [...new Set(prismicRoutes.concat(userRoutes))];
      };
    });
  }
}

module.exports = install;
module.exports.meta = require('../package.json');
