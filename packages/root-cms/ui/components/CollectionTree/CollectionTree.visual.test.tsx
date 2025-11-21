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
    // Collections without folders (root level)
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
    // Collections inside "Blog" folder
    BlogPosts: {
      id: 'BlogPosts',
      name: 'Blog Posts',
      description: 'Articles and blog content',
      folder: 'Blog',
    },
    BlogAuthors: {
      id: 'BlogAuthors',
      name: 'Blog Authors',
      description: 'Author profiles',
      folder: 'Blog',
    },
    BlogCategories: {
      id: 'BlogCategories',
      name: 'Blog Categories',
      description: 'Blog post categories',
      folder: 'Blog',
    },
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders collections without folder hierarchy', async () => {
    const collectionsWithoutFolders = {
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
          data-testid="collection-sidebar-no-folders"
        >
          <div className="CollectionPage__side__collections">
            <CollectionTree
              collections={collectionsWithoutFolders}
              projectId="test-project-no-folders"
            />
          </div>
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('collection-sidebar-no-folders');
    await expect.element(element).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('collection-no-folders.png');
  });

  it('renders collections with folder hierarchy', async () => {
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
      .toMatchScreenshot('collection-folder-hierarchy.png');
  });

  it('renders collections with Blog folder expanded', async () => {
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

    // Click the Blog folder to expand it
    const blogFolder = element.getByText('Blog');
    await blogFolder.click();

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    await expect
      .element(element)
      .toMatchScreenshot('collection-folder-hierarchy-expanded.png');
  });
});
