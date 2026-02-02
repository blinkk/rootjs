/**
 * Integration test for plugin routes feature.
 *
 * This test ensures that plugin routes work correctly in both dev mode
 * (using Vite's SSR module loader) and prod mode (using the static build).
 * It verifies the virtual module resolution and route registration.
 */

import {promises as fs} from 'node:fs';
import path from 'node:path';
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {loadRootConfig} from '../src/node/load-config.js';
import {viteSsrLoadModule} from '../src/node/vite.js';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

const FIXTURE_PATH = './fixtures/plugin-routes';

// Type for the virtual module's default export.
type PluginRoutesMap = Record<string, {module: any; src: string}>;

describe('Plugin Routes Integration', () => {
  describe('Dev Mode (SSR)', () => {
    it('should resolve virtual:root-plugin-routes module in dev mode', async () => {
      const rootDir = path.resolve(__dirname, FIXTURE_PATH);
      const rootConfig = await loadRootConfig(rootDir, {command: 'build'});

      // Load the virtual module using Vite's SSR loader.
      const pluginRoutes = await viteSsrLoadModule<{
        default: PluginRoutesMap;
      }>(rootConfig, 'virtual:root-plugin-routes');

      // Verify the virtual module exports a default object.
      expect(pluginRoutes.default).toBeDefined();
      expect(typeof pluginRoutes.default).toBe('object');
    });

    it('should contain plugin-defined routes in the virtual module', async () => {
      const rootDir = path.resolve(__dirname, FIXTURE_PATH);
      const rootConfig = await loadRootConfig(rootDir, {command: 'build'});

      const pluginRoutes = await viteSsrLoadModule<{
        default: PluginRoutesMap;
      }>(rootConfig, 'virtual:root-plugin-routes');

      const routes = pluginRoutes.default;

      // Verify expected routes are present.
      expect(routes['/plugin-route']).toBeDefined();
      expect(routes['/products/[id]']).toBeDefined();
      expect(routes['/wiki/[[...slug]]']).toBeDefined();
      expect(routes['/props']).toBeDefined();
      expect(routes['/handler']).toBeDefined();
      expect(routes['/api/data']).toBeDefined();
      expect(routes['/components']).toBeDefined();
    });

    it('should have valid route modules with default exports', async () => {
      const rootDir = path.resolve(__dirname, FIXTURE_PATH);
      const rootConfig = await loadRootConfig(rootDir, {command: 'build'});

      const pluginRoutes = await viteSsrLoadModule<{
        default: PluginRoutesMap;
      }>(rootConfig, 'virtual:root-plugin-routes');

      const routes = pluginRoutes.default;

      // Each route module should have a default export (the component).
      expect(routes['/plugin-route'].module.default).toBeDefined();
      expect(typeof routes['/plugin-route'].module.default).toBe('function');

      // Product route should have getStaticPaths for dynamic routes.
      expect(routes['/products/[id]'].module.getStaticPaths).toBeDefined();

      // Wiki route should have getStaticPaths for catch-all routes.
      expect(routes['/wiki/[[...slug]]'].module.getStaticPaths).toBeDefined();

      // Props route should have getStaticProps.
      expect(routes['/props'].module.getStaticProps).toBeDefined();

      // Handler route should have a handle function.
      expect(routes['/handler'].module.handle).toBeDefined();

      // API route should only have a handle function (no default component).
      expect(routes['/api/data'].module.handle).toBeDefined();
      expect(routes['/api/data'].module.default).toBeUndefined();

      // Components route should have getStaticProps (uses import.meta.glob).
      expect(routes['/components'].module.getStaticProps).toBeDefined();
      expect(routes['/components'].module.default).toBeDefined();
    });

    it('should support import.meta.glob for component discovery in dev mode', async () => {
      const rootDir = path.resolve(__dirname, FIXTURE_PATH);
      const rootConfig = await loadRootConfig(rootDir, {command: 'build'});

      const pluginRoutes = await viteSsrLoadModule<{
        default: PluginRoutesMap;
      }>(rootConfig, 'virtual:root-plugin-routes');

      const routes = pluginRoutes.default;
      const componentsRoute = routes['/components'];

      // Call getStaticProps to verify import.meta.glob works in dev mode.
      const result = await componentsRoute.module.getStaticProps();
      expect(result.props).toBeDefined();
      expect(result.props.components).toBeDefined();
      expect(result.props.components).toHaveLength(3);

      // Verify component metadata was extracted correctly.
      const componentNames = result.props.components.map(
        (c: {name: string}) => c.name
      );
      expect(componentNames).toContain('Button');
      expect(componentNames).toContain('Card');
      expect(componentNames).toContain('Modal');
    });

    it('should support API routes that return JSON responses', async () => {
      const rootDir = path.resolve(__dirname, FIXTURE_PATH);
      const rootConfig = await loadRootConfig(rootDir, {command: 'build'});

      const pluginRoutes = await viteSsrLoadModule<{
        default: PluginRoutesMap;
      }>(rootConfig, 'virtual:root-plugin-routes');

      const routes = pluginRoutes.default;
      const apiRoute = routes['/api/data'];

      // Create mock request/response to test the handler.
      const responseHeaders: Record<string, string> = {};
      let responseBody = '';

      const mockReq = {} as any;
      const mockRes = {
        setHeader: (key: string, value: string) => {
          responseHeaders[key] = value;
        },
        end: (body: string) => {
          responseBody = body;
        },
      } as any;

      // Call the handler.
      await apiRoute.module.handle(mockReq, mockRes, () => {});

      // Verify JSON response.
      expect(responseHeaders['Content-Type']).toBe('application/json');
      const json = JSON.parse(responseBody);
      expect(json.success).toBe(true);
      expect(json.message).toBe('Hello from API route!');
    });

    it('should include source path for each route', async () => {
      const rootDir = path.resolve(__dirname, FIXTURE_PATH);
      const rootConfig = await loadRootConfig(rootDir, {command: 'build'});

      const pluginRoutes = await viteSsrLoadModule<{
        default: PluginRoutesMap;
      }>(rootConfig, 'virtual:root-plugin-routes');

      const routes = pluginRoutes.default;

      // Each route should have a src path pointing to the actual file.
      for (const [routePath, routeInfo] of Object.entries(routes)) {
        expect(routeInfo.src).toBeDefined();
        expect(typeof routeInfo.src).toBe('string');
        expect(routeInfo.src.endsWith('.tsx')).toBe(true);
      }
    });
  });

  describe('Prod Mode (Build)', () => {
    let fixture: Fixture;

    beforeEach(async () => {
      fixture = await loadFixture(FIXTURE_PATH);
    });

    afterEach(async () => {
      if (fixture) {
        await fixture.cleanup();
      }
    });

    it('should generate static HTML for plugin routes', async () => {
      await fixture.build();

      // Verify static route was built.
      const indexPath = path.join(
        fixture.distDir,
        'html/plugin-route/index.html'
      );
      expect(await fileExists(indexPath)).toBe(true);

      const html = await fs.readFile(indexPath, 'utf-8');
      expect(html).toContain('<h1>Hello from plugin route!</h1>');
    });

    it('should generate dynamic routes with route params', async () => {
      await fixture.build();

      // Verify dynamic [id] route was built.
      const productPath = path.join(
        fixture.distDir,
        'html/products/123/index.html'
      );
      expect(await fileExists(productPath)).toBe(true);

      const html = await fs.readFile(productPath, 'utf-8');
      expect(html).toContain('<h1>Product: 123</h1>');
    });

    it('should generate optional catch-all routes', async () => {
      await fixture.build();

      // Verify catch-all [[...slug]] route generates index.
      const wikiIndexPath = path.join(fixture.distDir, 'html/wiki/index.html');
      expect(await fileExists(wikiIndexPath)).toBe(true);

      const indexHtml = await fs.readFile(wikiIndexPath, 'utf-8');
      expect(indexHtml).toContain('<h1>Wiki: index</h1>');

      // Verify catch-all generates nested paths.
      const wikiNestedPath = path.join(
        fixture.distDir,
        'html/wiki/foo/index.html'
      );
      expect(await fileExists(wikiNestedPath)).toBe(true);

      const nestedHtml = await fs.readFile(wikiNestedPath, 'utf-8');
      expect(nestedHtml).toContain('<h1>Wiki: foo</h1>');
    });

    it('should support getStaticProps in plugin routes', async () => {
      await fixture.build();

      const propsPath = path.join(fixture.distDir, 'html/props/index.html');
      expect(await fileExists(propsPath)).toBe(true);

      const html = await fs.readFile(propsPath, 'utf-8');
      expect(html).toContain('<h1>Props: Hello from getStaticProps!</h1>');
    });

    it('should support handler functions in plugin routes', async () => {
      await fixture.build();

      const handlerPath = path.join(fixture.distDir, 'html/handler/index.html');
      expect(await fileExists(handlerPath)).toBe(true);

      const html = await fs.readFile(handlerPath, 'utf-8');
      expect(html).toContain('<h1>Handler Route</h1>');
    });

    it('should support import.meta.glob for component discovery', async () => {
      await fixture.build();

      const componentsPath = path.join(
        fixture.distDir,
        'html/components/index.html'
      );
      expect(await fileExists(componentsPath)).toBe(true);

      const html = await fs.readFile(componentsPath, 'utf-8');
      // Verify the page lists all components discovered via import.meta.glob.
      expect(html).toContain('<h1>Component Library</h1>');
      expect(html).toContain('Button');
      expect(html).toContain('Card');
      expect(html).toContain('Modal');
      // Verify component descriptions are rendered.
      expect(html).toContain('A simple button component');
      expect(html).toContain('A card container component');
      expect(html).toContain('A modal dialog component');
    });
  });
});
