import { useEffect, useState } from 'react';
import React from 'react';

import { useStorybookApi } from 'storybook/internal/manager-api';

import {
  REQUEST_COVERAGE_EVENT,
  type RequestCoverageEventPayload,
  type ResultCoverageEventPayload,
} from '../constants';
import type { TestingMode } from '../types';

interface RecentRun {
  coverageProvider: 'istanbul' | 'v8';
  coverageType: TestingMode['coverageType'];
  browser: boolean;
  executionTime: number;
}

export function CoveragePanelDev({ coverage }: { coverage: ResultCoverageEventPayload | null }) {
  const savedCoverageState = localStorage.getItem('testSettings');
  const parsedCoverageState: TestingMode | null = savedCoverageState
    ? JSON.parse(savedCoverageState)
    : null;

  const [browserMode, setBrowserMode] = useState(parsedCoverageState?.browser ?? true);
  const [coverageProvider, setCoverageProvider] = useState<'istanbul' | 'v8'>(
    parsedCoverageState?.coverageProvider ?? 'istanbul'
  );

  const [coverageType, setCoverageType] = useState<TestingMode['coverageType']>(
    parsedCoverageState?.coverageType ?? 'component-coverage'
  );

  const [recentRuns, setRecentRuns] = useState<RecentRun[]>(() => {
    const savedRuns = localStorage.getItem('recentRuns');
    return savedRuns ? JSON.parse(savedRuns) : [];
  });

  const [isPanelOpen, setIsPanelOpen] = useState(() => {
    return localStorage.getItem('isCoveragePanelOpen') === 'true';
  });

  const api = useStorybookApi();

  useEffect(() => {
    const newRun: RecentRun = {
      coverageProvider,
      coverageType,
      browser: browserMode,
      executionTime: coverage && 'stats' in coverage ? coverage.executionTime : 0,
    };

    const updatedRuns = [newRun, ...recentRuns].slice(0, 5);
    setRecentRuns(updatedRuns);
    localStorage.setItem('recentRuns', JSON.stringify(updatedRuns));
  }, [coverage]);

  useEffect(() => {
    // save in localstorage
    localStorage.setItem(
      'testSettings',
      JSON.stringify({
        coverageProvider,
        coverageType,
        browser: browserMode,
      } satisfies TestingMode)
    );
  }, [coverageProvider, coverageType, browserMode]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        style={{
          position: 'absolute',
          top: '1em',
          right: '1em',
          borderRadius: '50%',
          width: '4em',
          height: '4em',
          backgroundColor: 'orange',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'center',
          zIndex: 1000,
        }}
        onClick={() => {
          setIsPanelOpen(!isPanelOpen);
          localStorage.setItem('isCoveragePanelOpen', (!isPanelOpen).toString());
        }}
      >
        {isPanelOpen ? 'X' : 'Open Dev'}
      </button>
      {isPanelOpen && (
        <div style={{ border: '2px solid orange', padding: '1em' }}>
          <div>
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Type</th>
                  <th>Browser</th>
                  <th>Time (in ms)</th>
                  <th>Run</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <select
                      value={coverageProvider}
                      disabled
                      onChange={(e) => {
                        if (e.target.value === 'v8' && browserMode === true) {
                          setBrowserMode(false);
                          alert(
                            'v8 is not supported in browser mode. Switching to non-browser mode'
                          );
                        }
                        setCoverageProvider(e.target.value as 'istanbul' | 'v8');
                      }}
                    >
                      <option value="istanbul">Istanbul</option>
                      <option value="v8">V8</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={coverageType}
                      onChange={(e) =>
                        setCoverageType(e.target.value as 'component-coverage' | 'project-coverage')
                      }
                    >
                      <option value="component-coverage">Component Coverage</option>
                      <option value="project-coverage">Project Coverage</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={browserMode === true ? 'true' : 'false'}
                      onChange={(e) => {
                        if (coverageProvider === 'v8') {
                          alert(
                            'v8 is not supported in browser mode. Switching the provider to Istanbul'
                          );
                          setCoverageProvider('istanbul');
                        }
                        setBrowserMode(e.target.value === 'true');
                      }}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </td>
                  <td>
                    {coverage && 'stats' in coverage ? (
                      <span>{coverage.executionTime}</span>
                    ) : (
                      <span>Loading...</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        const currentStory = api.getCurrentStoryData();

                        api.emit(REQUEST_COVERAGE_EVENT, {
                          importPath: currentStory.importPath,
                          componentPath: (currentStory as any).componentPath,
                          initialRequest: true,
                          mode: {
                            browser: browserMode,
                            coverageProvider,
                            coverageType,
                          },
                        } satisfies RequestCoverageEventPayload);
                      }}
                    >
                      Run Coverage
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            Attention: If the type is "Project Coverage" and you switch story files, a manual retri
            <div style={{ marginTop: '1em' }}>
              <h3>Recent runs</h3>
              <ul>
                {recentRuns
                  .filter((run) => run.executionTime !== 0)
                  .map((run, index) => (
                    <li key={index}>
                      Provider: {run.coverageProvider}, Type: {run.coverageType}, Browser:{' '}
                      {run.browser ? 'true' : 'false'}, Time: {run.executionTime} ms
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
