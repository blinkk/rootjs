import '../../styles/global.css';
import '../../styles/theme.css';
import './CollectionTree.css';
import {MantineProvider} from '@mantine/core';
import {render} from '@testing-library/preact';
import {describe, it, expect, beforeEach} from 'vitest';
import {page} from 'vitest/browser';
import {CollectionTree} from './CollectionTree.js';

describe('CollectionTree', () => {
  const mockCollections = {
    // Collections without groups (root level)
    Homepage: {
      id: 'Homepage',
      name: 'Homepage',
      description: 'Main landing page',
    },
    AboutUs: {
      id: 'AboutUs',
      name: 'About Us',
      description: 'About us pages',
    },
    ContactPages: {
      id: 'ContactPages',
      name: 'Contact Pages',
      description: 'Contact and support pages',
    },
    LandingPages: {
      id: 'Landing Pages',
      name: 'Landing Pages',
      description: 'Marketing landing pages',
    },
    // Collections inside "Blog" group
    BlogPosts: {
      id: 'BlogPosts',
      name: 'Blog Posts',
      description: 'Articles and blog content',
      group: 'Blog',
    },
    BlogAuthors: {
      id: 'BlogAuthors',
      name: 'Blog Authors',
      description: 'Author profiles',
      group: 'Blog',
    },
    BlogCategories: {
      id: 'BlogCategories',
      name: 'Blog Categories',
      description: 'Blog post categories',
      group: 'Blog',
    },
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders collections without group hierarchy', async () => {
    const collectionsWithoutGroups = {
      Homepage: {
        id: 'Homepage',
        name: 'Homepage',
        description: 'Main landing page',
      },
      AboutUs: {
        id: 'AboutUs',
        name: 'About Us',
        description: 'About us pages',
      },
      ContactPages: {
        id: 'ContactPages',
        name: 'Contact Pages',
        description: 'Contact and support pages',
      },
      LandingPages: {
        id: 'Landing Pages',
        name: 'Landing Pages',
        description: 'Marketing landing pages',
      },
    };

    render(
      <MantineProvider>
        <div
          style={{
            width: '300px',
            background: 'white',
          }}
          data-testid="collection-sidebar-no-groups"
        >
          <div className="CollectionPage__side__collections">
            <CollectionTree
              collections={collectionsWithoutGroups}
              projectId="test-project-no-groups"
            />
          </div>
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('collection-sidebar-no-groups');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('collection-no-groups.png');
  });

  it('renders collections with group hierarchy', async () => {
    render(
      <MantineProvider>
        <div
          style={{
            width: '300px',
            background: 'white',
          }}
          data-testid="collection-sidebar"
        >
          <div className="CollectionPage__side__collections">
            <CollectionTree
              collections={mockCollections}
              projectId="test-project"
            />
          </div>
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('collection-sidebar');
    await expect.element(element).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('collection-group-hierarchy.png');
  });

  it('renders collections with Blog group expanded', async () => {
    render(
      <MantineProvider>
        <div
          style={{
            width: '300px',
            background: 'white',
          }}
          data-testid="collection-sidebar-expanded"
        >
          <div className="CollectionPage__side__collections">
            <CollectionTree
              collections={mockCollections}
              projectId="test-project-expanded"
            />
          </div>
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('collection-sidebar-expanded');
    await expect.element(element).toBeVisible();

    // Click the Blog group to expand it
    const blogGroup = element.getByText('Blog');
    await blogGroup.click();

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    await expect
      .element(element)
      .toMatchScreenshot('collection-group-hierarchy-expanded.png');
  });
});
