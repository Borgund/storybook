/* global window */
import Events, { STORY_UNCHANGED } from '@storybook/core-events';

import {
  waitForRender,
  waitForEvents,
  waitForQuiescence,
  emitter,
  mockChannel,
} from '@storybook/preview-web/dist/cjs/PreviewWeb.mockdata';
// @ts-expect-error (Converted from ts-ignore)
import { WebView } from '@storybook/preview-web/dist/cjs/WebView';
import { ModuleExports, Path, setGlobalRender } from '@storybook/client-api';
import global from 'global';

import { start } from './start';

jest.mock('@storybook/preview-web/dist/cjs/WebView');
jest.spyOn(WebView.prototype, 'prepareForDocs').mockReturnValue('docs-root');
jest.spyOn(WebView.prototype, 'prepareForStory').mockReturnValue('story-root');

jest.mock('global', () => ({
  // @ts-expect-error (Converted from ts-ignore)
  ...jest.requireActual('global'),
  history: { replaceState: jest.fn() },
  document: {
    location: {
      pathname: 'pathname',
      search: '?id=*',
    },
  },
  FEATURES: {
    breakingChangesV7: true,
  },
  DOCS_OPTIONS: {
    enabled: true,
  },
}));

jest.mock('@storybook/channel-postmessage', () => ({ createChannel: () => mockChannel }));
jest.mock('react-dom');

// for the auto-title test
jest.mock('@storybook/store', () => {
  const actualStore = jest.requireActual('@storybook/store');
  return {
    ...actualStore,
    userOrAutoTitle: (importPath: string, specifier: any, userTitle?: string) =>
      userTitle || 'auto-title',
  };
});

beforeEach(() => {
  mockChannel.emit.mockClear();
  // Preview doesn't clean itself up as it isn't designed to ever be stopped :shrug:
  emitter.removeAllListeners();
});

afterEach(() => {
  // I'm not sure why this is required (it seems just afterEach is required really)
  mockChannel.emit.mockClear();
});

function makeRequireContext(importMap: Record<Path, ModuleExports>) {
  const req = (path: Path) => importMap[path];
  req.keys = () => Object.keys(importMap);
  return req;
}

describe('start', () => {
  beforeEach(() => {
    global.DOCS_OPTIONS = { enabled: false };
  });
  describe('when configure is called with storiesOf only', () => {
    it('loads and renders the first story correctly', async () => {
      const renderToDOM = jest.fn();

      const { configure, clientApi } = start(renderToDOM);

      configure('test', () => {
        clientApi
          .storiesOf('Component A', { id: 'file1' } as NodeModule)
          .add('Story One', jest.fn())
          .add('Story Two', jest.fn());

        clientApi
          .storiesOf('Component B', { id: 'file2' } as NodeModule)
          .add('Story Three', jest.fn());
      });

      await waitForRender();
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "component-a--story-one": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-a",
              "id": "component-a--story-one",
              "importPath": "file1",
              "initialArgs": Object {},
              "name": "Story One",
              "parameters": Object {
                "__id": "component-a--story-one",
                "__isArgsStory": false,
                "fileName": "file1",
                "framework": "test",
              },
              "title": "Component A",
              "type": "story",
            },
            "component-a--story-two": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-a",
              "id": "component-a--story-two",
              "importPath": "file1",
              "initialArgs": Object {},
              "name": "Story Two",
              "parameters": Object {
                "__id": "component-a--story-two",
                "__isArgsStory": false,
                "fileName": "file1",
                "framework": "test",
              },
              "title": "Component A",
              "type": "story",
            },
            "component-b--story-three": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-b",
              "id": "component-b--story-three",
              "importPath": "file2",
              "initialArgs": Object {},
              "name": "Story Three",
              "parameters": Object {
                "__id": "component-b--story-three",
                "__isArgsStory": false,
                "fileName": "file2",
                "framework": "test",
              },
              "title": "Component B",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(
        Events.STORY_RENDERED,
        'component-a--story-one'
      );

      expect(renderToDOM).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'component-a--story-one',
        }),
        'story-root'
      );
    });

    it('deals with stories with "default" name', async () => {
      const renderToDOM = jest.fn();

      const { configure, clientApi } = start(renderToDOM);

      configure('test', () => {
        clientApi.storiesOf('Component A', { id: 'file1' } as NodeModule).add('default', jest.fn());
      });

      await waitForRender();

      expect(mockChannel.emit).toHaveBeenCalledWith(Events.STORY_RENDERED, 'component-a--default');
    });

    it('deals with stories with camel-cased names', async () => {
      const renderToDOM = jest.fn();

      const { configure, clientApi } = start(renderToDOM);

      configure('test', () => {
        clientApi
          .storiesOf('Component A', { id: 'file1' } as NodeModule)
          .add('storyOne', jest.fn());
      });

      await waitForRender();

      expect(mockChannel.emit).toHaveBeenCalledWith(Events.STORY_RENDERED, 'component-a--storyone');
    });

    it('deals with stories with spaces in the name', async () => {
      const renderToDOM = jest.fn();

      const { configure, clientApi } = start(renderToDOM);

      configure('test', () => {
        clientApi
          .storiesOf('Component A', { id: 'file1' } as NodeModule)
          .add('Story One', jest.fn());
      });

      await waitForRender();

      expect(mockChannel.emit).toHaveBeenCalledWith(
        Events.STORY_RENDERED,
        'component-a--story-one'
      );
    });

    // https://github.com/storybookjs/storybook/issues/16303
    it('deals with stories with numeric names', async () => {
      const renderToDOM = jest.fn();

      const { configure, clientApi } = start(renderToDOM);

      configure('test', () => {
        clientApi.storiesOf('Component A', { id: 'file1' } as NodeModule).add('story0', jest.fn());
      });

      await waitForRender();

      expect(mockChannel.emit).toHaveBeenCalledWith(Events.STORY_RENDERED, 'component-a--story0');
    });

    it('deals with storiesOf from the same file twice', async () => {
      const renderToDOM = jest.fn();

      const { configure, clientApi } = start(renderToDOM);

      configure('test', () => {
        clientApi.storiesOf('Component A', { id: 'file1' } as NodeModule).add('default', jest.fn());
        clientApi.storiesOf('Component B', { id: 'file1' } as NodeModule).add('default', jest.fn());
        clientApi.storiesOf('Component C', { id: 'file1' } as NodeModule).add('default', jest.fn());
      });

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(Events.STORY_RENDERED, 'component-a--default');

      const storiesOfData = mockChannel.emit.mock.calls.find(
        (call: [string, any]) => call[0] === Events.SET_INDEX
      )[1];
      expect(Object.values(storiesOfData.entries).map((s: any) => s.parameters.fileName)).toEqual([
        'file1',
        'file1-2',
        'file1-3',
      ]);
    });

    it('allows setting compomnent/args/argTypes via a parameter', async () => {
      const renderToDOM = jest.fn(({ storyFn }) => storyFn());

      const { configure, clientApi } = start(renderToDOM);

      const component = {};
      configure('test', () => {
        clientApi
          .storiesOf('Component A', { id: 'file1' } as NodeModule)
          .addParameters({
            component,
            args: { a: 'a' },
            argTypes: { a: { type: 'string' } },
          })
          .add('default', jest.fn(), {
            args: { b: 'b' },
            argTypes: { b: { type: 'string' } },
          });
      });

      await waitForRender();

      expect(renderToDOM).toHaveBeenCalledWith(
        expect.objectContaining({
          storyContext: expect.objectContaining({
            component,
            args: { a: 'a', b: 'b' },
            argTypes: {
              a: { name: 'a', type: { name: 'string' } },
              b: { name: 'b', type: { name: 'string' } },
            },
          }),
        }),
        'story-root'
      );

      expect((window as any).IS_STORYBOOK).toBe(true);
    });

    it('supports forceRerender()', async () => {
      const renderToDOM = jest.fn(({ storyFn }) => storyFn());

      const { configure, clientApi, forceReRender } = start(renderToDOM);

      configure('test', () => {
        clientApi.storiesOf('Component A', { id: 'file1' } as NodeModule).add('default', jest.fn());
      });

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(Events.STORY_RENDERED, 'component-a--default');

      mockChannel.emit.mockClear();
      forceReRender();

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(Events.STORY_RENDERED, 'component-a--default');
    });

    it('supports HMR when a story file changes', async () => {
      const renderToDOM = jest.fn(({ storyFn }) => storyFn());

      const { configure, clientApi } = start(renderToDOM);

      let disposeCallback: () => void;
      const module = {
        id: 'file1',
        hot: {
          accept: jest.fn(),
          dispose(cb: () => void) {
            disposeCallback = cb;
          },
        },
      };
      const firstImplementation = jest.fn();
      configure('test', () => {
        clientApi.storiesOf('Component A', module as any).add('default', firstImplementation);
      });

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(Events.STORY_RENDERED, 'component-a--default');
      expect(firstImplementation).toHaveBeenCalled();
      expect(module.hot.accept).toHaveBeenCalled();
      expect(disposeCallback).toBeDefined();

      mockChannel.emit.mockClear();
      disposeCallback();
      const secondImplementation = jest.fn();
      clientApi.storiesOf('Component A', module as any).add('default', secondImplementation);

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(Events.STORY_RENDERED, 'component-a--default');
      expect(secondImplementation).toHaveBeenCalled();
    });

    it('re-emits SET_INDEX when a story is added', async () => {
      const renderToDOM = jest.fn(({ storyFn }) => storyFn());

      const { configure, clientApi, forceReRender } = start(renderToDOM);

      let disposeCallback: () => void;
      const module = {
        id: 'file1',
        hot: {
          accept: jest.fn(),
          dispose(cb: () => void) {
            disposeCallback = cb;
          },
        },
      };
      configure('test', () => {
        clientApi.storiesOf('Component A', module as any).add('default', jest.fn());
      });

      await waitForRender();

      mockChannel.emit.mockClear();
      disposeCallback();
      clientApi
        .storiesOf('Component A', module as any)
        .add('default', jest.fn())
        .add('new', jest.fn());

      await waitForEvents([Events.SET_INDEX]);
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "component-a--default": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-a",
              "id": "component-a--default",
              "importPath": "file1",
              "initialArgs": Object {},
              "name": "default",
              "parameters": Object {
                "__id": "component-a--default",
                "__isArgsStory": false,
                "fileName": "file1",
                "framework": "test",
              },
              "title": "Component A",
              "type": "story",
            },
            "component-a--new": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-a",
              "id": "component-a--new",
              "importPath": "file1",
              "initialArgs": Object {},
              "name": "new",
              "parameters": Object {
                "__id": "component-a--new",
                "__isArgsStory": false,
                "fileName": "file1",
                "framework": "test",
              },
              "title": "Component A",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);
    });

    it('re-emits SET_INDEX when a story file is removed', async () => {
      const renderToDOM = jest.fn(({ storyFn }) => storyFn());

      const { configure, clientApi, forceReRender } = start(renderToDOM);

      let disposeCallback: () => void;
      const moduleB = {
        id: 'file2',
        hot: {
          accept: jest.fn(),
          dispose(cb: () => void) {
            disposeCallback = cb;
          },
        },
      };
      configure('test', () => {
        clientApi.storiesOf('Component A', { id: 'file1' } as any).add('default', jest.fn());
        clientApi.storiesOf('Component B', moduleB as any).add('default', jest.fn());
      });

      await waitForEvents([Events.SET_INDEX]);
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "component-a--default": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-a",
              "id": "component-a--default",
              "importPath": "file1",
              "initialArgs": Object {},
              "name": "default",
              "parameters": Object {
                "__id": "component-a--default",
                "__isArgsStory": false,
                "fileName": "file1",
                "framework": "test",
              },
              "title": "Component A",
              "type": "story",
            },
            "component-b--default": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-b",
              "id": "component-b--default",
              "importPath": "file2",
              "initialArgs": Object {},
              "name": "default",
              "parameters": Object {
                "__id": "component-b--default",
                "__isArgsStory": false,
                "fileName": "file2",
                "framework": "test",
              },
              "title": "Component B",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);
      mockChannel.emit.mockClear();
      disposeCallback();

      await waitForEvents([Events.SET_INDEX]);
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "component-a--default": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-a",
              "id": "component-a--default",
              "importPath": "file1",
              "initialArgs": Object {},
              "name": "default",
              "parameters": Object {
                "__id": "component-a--default",
                "__isArgsStory": false,
                "fileName": "file1",
                "framework": "test",
              },
              "title": "Component A",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);
    });
  });

  const componentCExports = {
    default: {
      title: 'Component C',
    },
    StoryOne: jest.fn(),
    StoryTwo: jest.fn(),
  };

  describe('when configure is called with CSF only', () => {
    it('loads and renders the first story correctly', async () => {
      const renderToDOM = jest.fn();

      const { configure } = start(renderToDOM);
      configure('test', () => [componentCExports]);

      await waitForRender();
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "component-c--story-one": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-one",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story One",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
            "component-c--story-two": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-two",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story Two",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(
        Events.STORY_RENDERED,
        'component-c--story-one'
      );

      expect(renderToDOM).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'component-c--story-one',
        }),
        'story-root'
      );
    });

    it('supports HMR when a story file changes', async () => {
      const renderToDOM = jest.fn(({ storyFn }) => storyFn());

      let disposeCallback: (data: object) => void;
      const module = {
        id: 'file1',
        hot: {
          data: {},
          accept: jest.fn(),
          dispose(cb: () => void) {
            disposeCallback = cb;
          },
        },
      };

      const { configure } = start(renderToDOM);
      configure('test', () => [componentCExports], module as any);

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(
        Events.STORY_RENDERED,
        'component-c--story-one'
      );
      expect(componentCExports.StoryOne).toHaveBeenCalled();
      expect(module.hot.accept).toHaveBeenCalled();
      expect(disposeCallback).toBeDefined();

      mockChannel.emit.mockClear();
      disposeCallback(module.hot.data);
      const secondImplementation = jest.fn();
      configure(
        'test',
        () => [{ ...componentCExports, StoryOne: secondImplementation }],
        module as any
      );

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(
        Events.STORY_RENDERED,
        'component-c--story-one'
      );
      expect(secondImplementation).toHaveBeenCalled();
    });

    it('re-emits SET_INDEX when a story is added', async () => {
      const renderToDOM = jest.fn(({ storyFn }) => storyFn());

      let disposeCallback: (data: object) => void;
      const module = {
        id: 'file1',
        hot: {
          data: {},
          accept: jest.fn(),
          dispose(cb: () => void) {
            disposeCallback = cb;
          },
        },
      };
      const { configure } = start(renderToDOM);
      configure('test', () => [componentCExports], module as any);

      await waitForRender();

      mockChannel.emit.mockClear();
      disposeCallback(module.hot.data);
      configure('test', () => [{ ...componentCExports, StoryThree: jest.fn() }], module as any);

      await waitForEvents([Events.SET_INDEX]);
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "component-c--story-one": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-one",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story One",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
            "component-c--story-three": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-three",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story Three",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
            "component-c--story-two": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-two",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story Two",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);
    });

    it('re-emits SET_INDEX when a story file is removed', async () => {
      const renderToDOM = jest.fn(({ storyFn }) => storyFn());

      let disposeCallback: (data: object) => void;
      const module = {
        id: 'file1',
        hot: {
          data: {},
          accept: jest.fn(),
          dispose(cb: () => void) {
            disposeCallback = cb;
          },
        },
      };
      const { configure } = start(renderToDOM);
      configure(
        'test',
        () => [componentCExports, { default: { title: 'Component D' }, StoryFour: jest.fn() }],
        module as any
      );

      await waitForEvents([Events.SET_INDEX]);
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "component-c--story-one": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-one",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story One",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
            "component-c--story-two": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-two",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story Two",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
            "component-d--story-four": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-d--story-four",
              "importPath": "exports-map-1",
              "initialArgs": Object {},
              "name": "Story Four",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-1",
                "framework": "test",
              },
              "title": "Component D",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);
      await waitForRender();

      mockChannel.emit.mockClear();
      disposeCallback(module.hot.data);
      configure('test', () => [componentCExports], module as any);

      await waitForEvents([Events.SET_INDEX]);
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "component-c--story-one": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-one",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story One",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
            "component-c--story-two": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-two",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story Two",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);

      await waitForEvents([STORY_UNCHANGED]);
    });

    it('allows you to override the render function in project annotations', async () => {
      const renderToDOM = jest.fn(({ storyFn }) => storyFn());
      const frameworkRender = jest.fn();

      const { configure } = start(renderToDOM, { render: frameworkRender });

      const projectRender = jest.fn();
      setGlobalRender(projectRender);
      configure('test', () => {
        return [
          {
            default: {
              title: 'Component A',
              component: jest.fn(),
            },
            StoryOne: {},
          },
        ];
      });

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(
        Events.STORY_RENDERED,
        'component-a--story-one'
      );

      expect(frameworkRender).not.toHaveBeenCalled();
      expect(projectRender).toHaveBeenCalled();
    });

    describe('docs', () => {
      beforeEach(() => {
        global.DOCS_OPTIONS = { enabled: true };
      });

      // NOTE: MDX files are only ever passed as CSF
      it('sends over docs only stories as entries', async () => {
        const renderToDOM = jest.fn();

        const { configure } = start(renderToDOM);

        configure(
          'test',
          makeRequireContext({
            './Introduction.stories.mdx': {
              default: { title: 'Introduction' },
              _Page: { name: 'Page', parameters: { docsOnly: true } },
            },
          })
        );

        await waitForEvents([Events.SET_INDEX]);
        expect(
          mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
        ).toMatchInlineSnapshot(`
          Object {
            "entries": Object {
              "introduction": Object {
                "componentId": undefined,
                "id": "introduction",
                "importPath": "./Introduction.stories.mdx",
                "name": undefined,
                "standalone": false,
                "storiesImports": Array [],
                "title": "Introduction",
                "type": "docs",
              },
            },
            "v": 4,
          }
        `);

        // Wait a second to let the docs "render" finish (and maybe throw)
        await waitForQuiescence();
      });
    });
  });

  describe('when configure is called with a combination', () => {
    it('loads and renders the first story correctly', async () => {
      const renderToDOM = jest.fn();

      const { configure, clientApi } = start(renderToDOM);
      configure('test', () => {
        clientApi
          .storiesOf('Component A', { id: 'file1' } as NodeModule)
          .add('Story One', jest.fn())
          .add('Story Two', jest.fn());

        clientApi
          .storiesOf('Component B', { id: 'file2' } as NodeModule)
          .add('Story Three', jest.fn());

        return [componentCExports];
      });

      await waitForRender();
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "component-a--story-one": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-a",
              "id": "component-a--story-one",
              "importPath": "file1",
              "initialArgs": Object {},
              "name": "Story One",
              "parameters": Object {
                "__id": "component-a--story-one",
                "__isArgsStory": false,
                "fileName": "file1",
                "framework": "test",
              },
              "title": "Component A",
              "type": "story",
            },
            "component-a--story-two": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-a",
              "id": "component-a--story-two",
              "importPath": "file1",
              "initialArgs": Object {},
              "name": "Story Two",
              "parameters": Object {
                "__id": "component-a--story-two",
                "__isArgsStory": false,
                "fileName": "file1",
                "framework": "test",
              },
              "title": "Component A",
              "type": "story",
            },
            "component-b--story-three": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": "component-b",
              "id": "component-b--story-three",
              "importPath": "file2",
              "initialArgs": Object {},
              "name": "Story Three",
              "parameters": Object {
                "__id": "component-b--story-three",
                "__isArgsStory": false,
                "fileName": "file2",
                "framework": "test",
              },
              "title": "Component B",
              "type": "story",
            },
            "component-c--story-one": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-one",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story One",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
            "component-c--story-two": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "component-c--story-two",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story Two",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "Component C",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);

      await waitForRender();
      expect(mockChannel.emit).toHaveBeenCalledWith(
        Events.STORY_RENDERED,
        'component-a--story-one'
      );

      expect(renderToDOM).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'component-a--story-one',
        }),
        'story-root'
      );
    });

    describe('docsPage', () => {
      beforeEach(() => {
        global.DOCS_OPTIONS = { enabled: true, docsPage: true, defaultTitle: 'Docs' };
      });

      it('adds stories for each component', async () => {});
    });
  });

  describe('auto-title', () => {
    const componentDExports = {
      default: {
        component: 'Component D',
      },
      StoryOne: jest.fn(),
    };
    it('loads and renders the first story correctly', async () => {
      const renderToDOM = jest.fn();

      const { configure } = start(renderToDOM);
      configure('test', () => [componentDExports]);

      await waitForEvents([Events.SET_INDEX]);
      expect(
        mockChannel.emit.mock.calls.find((call: [string, any]) => call[0] === Events.SET_INDEX)[1]
      ).toMatchInlineSnapshot(`
        Object {
          "entries": Object {
            "auto-title--story-one": Object {
              "argTypes": Object {},
              "args": Object {},
              "componentId": undefined,
              "id": "auto-title--story-one",
              "importPath": "exports-map-0",
              "initialArgs": Object {},
              "name": "Story One",
              "parameters": Object {
                "__isArgsStory": false,
                "fileName": "exports-map-0",
                "framework": "test",
              },
              "title": "auto-title",
              "type": "story",
            },
          },
          "v": 4,
        }
      `);

      await waitForRender();
    });
  });
});
