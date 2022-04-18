import {WorkspaceConfig} from '../config/WorkspaceConfig';
import {Project, ProjectSerialized} from './Project';
import {constants as fsConstants} from 'fs';
import {access} from 'fs/promises';
import {promise as glob} from 'glob-promise';
import * as path from 'path';
import {loadConfigPath} from '../config/loadConfigFile';

export interface WorkspaceSerialized {
  projects: ProjectSerialized[];
  firebase: FirebaseConfig;
}

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
}

async function loadProjects(
  workspaceDir: string,
  projectDirGlobs: string[]
): Promise<Project[]> {
  const projects: Project[] = [];
  for (const globPattern of projectDirGlobs) {
    const projectDirs = await glob(path.join(workspaceDir, globPattern));
    for (const projectDir of projectDirs) {
      const configPath = `${projectDir}/${Project.CONFIG_FILE}`;
      if (await hasConfigFile(configPath)) {
        const project = await Project.init(projectDir);
        projects.push(project);
      }
    }
  }
  return projects;
}

async function hasConfigFile(configPath: string) {
  try {
    await access(configPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The workspace defines the root directory for the CMS. A workspace can have
 * many projects (like a monorepo and npm workspaces).
 */
export class Workspace {
  static CONFIG_FILE = 'root.workspace.ts';

  workspaceDir: string;
  projects: Project[];

  constructor(workspaceDir: string, projects: Project[]) {
    this.workspaceDir = workspaceDir;
    this.projects = projects;
    console.log('projects:');
    this.projects.forEach(project => {
      console.log(`  ${JSON.stringify(project.serialize())}`);
    });
  }

  static async init(workspaceDir: string) {
    console.log(`initializing workspace: ${workspaceDir}`);
    // If a root.workspace.ts file is found, load the projects defined in the
    // workspace config file. Otherwise, it's assumed that the workspace is a
    // single-project workspace.
    let projectDirs = [workspaceDir];
    const configPath = `${workspaceDir}/${Workspace.CONFIG_FILE}`;
    if (await hasConfigFile(configPath)) {
      const config = await loadConfigPath<WorkspaceConfig>(configPath);
      if (config.projects) {
        projectDirs = config.projects;
      }
    }
    const projects = await loadProjects(workspaceDir, projectDirs);
    if (projects.length === 0) {
      throw new Error(`no projects found in ${workspaceDir}`);
    }
    return new Workspace(workspaceDir, projects);
  }

  getProject(projectId: string): Project | null {
    return this.projects.find(p => p.id === projectId) || null;
  }

  getFirebaseConfig(): FirebaseConfig {
    const apiKey = process.env.FIREBASE_API_KEY;
    const authDomain = process.env.FIREBASE_AUTH_DOMAIN;
    if (!apiKey || !authDomain) {
      throw new Error(
        'missing firebase credentials, please set environment variables: FIREBASE_API_KEY and FIREBASE_AUTH_DOMAIN'
      );
    }
    return {apiKey, authDomain};
  }

  serialize(): WorkspaceSerialized {
    return {
      projects: this.projects.map(p => p.serialize()),
      firebase: this.getFirebaseConfig(),
    };
  }
}

export default Workspace;