import { existsSync } from 'node:fs';

import { coverageConfigDefaults } from 'vitest/config';
import type { Vitest, WorkspaceSpec } from 'vitest/node';
import { slash } from 'vitest/utils';

import type { Channel } from 'storybook/internal/channels';

import { COVERAGE_IN_PROGRESS, FILE_CHANGED_EVENT } from '../constants';
import type { CoverageState, ManagerState, TestingMode } from '../types';
import type { CoverageManager } from './coverage-manager';
import type { CoverageReporterOptions } from './coverage-reporter';

export class VitestManager {
  private vitest: Vitest | null = null;

  constructor(
    private channel: Channel,
    private managerState: ManagerState,
    private coverageState: CoverageState,
    private coverageManager: CoverageManager
  ) {}

  private async getTestDependencies(filepath: WorkspaceSpec, deps = new Set<string>()) {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const addImports = async ([project, filepath]: WorkspaceSpec) => {
      if (deps.has(filepath)) {
        return;
      }
      deps.add(filepath);

      const mod = project.server.moduleGraph.getModuleById(filepath);
      const transformed =
        mod?.ssrTransformResult || (await project.vitenode.transformRequest(filepath));
      if (!transformed) {
        return;
      }
      const dependencies = [...(transformed.deps || []), ...(transformed.dynamicDeps || [])];
      await Promise.all(
        dependencies.map(async (dep) => {
          const path = await project.server?.pluginContainer.resolveId(dep, filepath, {
            ssr: true,
          });
          const fsPath = path && !path.external && path.id.split('?')[0];
          if (
            fsPath &&
            !fsPath.includes('node_modules') &&
            !deps.has(fsPath) &&
            existsSync(fsPath)
          ) {
            await addImports([project, fsPath]);
          }
        })
      );
    };

    await addImports(filepath);
    deps.delete(filepath[1]);

    return deps;
  }

  async initVitest({
    importPath,
    componentPath,
    absoluteComponentPath,
    mode,
  }: {
    importPath: string;
    componentPath: string;
    absoluteComponentPath: string;
    mode: TestingMode;
  }) {
    const { createVitest } = await import('vitest/node');

    this.vitest = await createVitest(
      'test',
      {
        watch: true,
        passWithNoTests: true,
        changed: mode.coverageType === 'project-coverage',
        coverage: {
          reportOnFailure: true,
          reporter: [
            [
              require.resolve('@storybook/experimental-addon-coverage/coverage-reporter'),
              {
                channel: this.channel,
                coverageState: this.coverageState,
                coverageManager: this.coverageManager,
              } satisfies CoverageReporterOptions,
            ],
          ],
          provider: mode.coverageProvider,
          enabled: true,
          exclude: [
            ...coverageConfigDefaults.exclude,
            '**/*.stories.ts',
            '**/*.stories.tsx',
            '**/__mocks/**',
            '**/dist/**',
            'playwright.config.ts',
            'vitest-setup.ts',
            'vitest.helpers.ts',
          ],
          include:
            mode.coverageType === 'component-coverage'
              ? [`**/${componentPath.slice(2)}`]
              : undefined,
          all: false,
        },
      },
      {
        cacheDir: 'node_modules/.storybook-addon-coverage/.vite',
        test: {
          browser: {
            name: 'chromium',
            enabled: mode.browser,
            provider: 'playwright',
            headless: true,
            screenshotFailures: false,
          },
        },
      }
    );

    if (!this.vitest || this.vitest.projects.length < 1) {
      return;
    }

    this.emitCoverageStart();
    // If we're running project coverage, we need to cancel the current run and
    // only run the affected tests for the component we're interested in.
    if (mode.coverageType === 'component-coverage') {
      await this.vitest.start([importPath]);
    } else {
      await this.vitest.init();
      await this.setupWatchers();
      await this.runAffectedTests(absoluteComponentPath);
    }

    this.vitest.server.watcher.on('change', (file) => {
      if (file === absoluteComponentPath) {
        this.channel.emit(FILE_CHANGED_EVENT, absoluteComponentPath);
      }
    });
  }

  async runAffectedTests(absoluteComponentPath: string, trigger?: string) {
    if (!this.vitest) return;

    const globTestFiles = await this.vitest.globTestFiles();
    const testGraphs = await Promise.all(
      globTestFiles
        // eslint-disable-next-line no-underscore-dangle
        .filter(([project]) => project.config.env?.__STORYBOOK_URL__)
        .map(async (spec) => {
          const deps = await this.getTestDependencies(spec);
          return [spec, deps] as const;
        })
    );
    const runningTests: WorkspaceSpec[] = [];

    let shouldRerunTests = !trigger;

    for (const [filepath, deps] of testGraphs) {
      if (trigger && (filepath[1] === trigger || deps.has(trigger))) {
        shouldRerunTests = true;
      }

      if (absoluteComponentPath === filepath[1] || deps.has(absoluteComponentPath)) {
        runningTests.push(filepath);
      }
    }

    if (shouldRerunTests) {
      this.emitCoverageStart();
      await this.vitest.runFiles(runningTests, true);
    }
  }

  private emitCoverageStart() {
    this.coverageState.timeStartTesting = performance.now();
    this.channel.emit(COVERAGE_IN_PROGRESS);
  }

  private updateLastChanged(filepath: string) {
    const projects = this.vitest!.getModuleProjects(filepath);
    projects.forEach(({ server, browser }) => {
      const serverMods = server.moduleGraph.getModulesByFile(filepath);
      serverMods?.forEach((mod) => server.moduleGraph.invalidateModule(mod));

      if (browser) {
        const browserMods = browser.vite.moduleGraph.getModulesByFile(filepath);
        browserMods?.forEach((mod) => browser.vite.moduleGraph.invalidateModule(mod));
      }
    });
  }

  async runAffectedTestsAfterChange(file: string) {
    const id = slash(file);
    this.vitest?.logger.clearHighlightCache(id);
    this.updateLastChanged(id);

    const isProjectCoverage = this.managerState.coverageType === 'project-coverage';

    if (isProjectCoverage) {
      const hasComponentChanged = this.managerState.absoluteComponentPath === file;

      if (this.managerState.absoluteComponentPath && !hasComponentChanged) {
        await this.runAffectedTests(this.managerState.absoluteComponentPath, file);
        return;
      }
    }
  }

  async setupWatchers() {
    this.vitest?.server.watcher.removeAllListeners('change');
    this.vitest?.server.watcher.removeAllListeners('add');
    this.vitest?.server.watcher.on('change', this.runAffectedTestsAfterChange.bind(this));
    this.vitest?.server.watcher.on('add', this.runAffectedTestsAfterChange.bind(this));
  }

  async closeVitest() {
    if (this.vitest) {
      await this.vitest.close();
    }
  }

  isVitestRunning() {
    return !!this.vitest;
  }
}
