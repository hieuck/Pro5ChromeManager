import express, { Express, Request, Response } from 'express';
import path from 'path';

function resolveUiDir(): string {
  const packagedUiDir = path.join(__dirname, '../../../../ui');
  const devUiDir = path.resolve(process.cwd(), 'dist/ui');
  return packagedUiDir.includes('app.asar') ? packagedUiDir : devUiDir;
}

export function registerUiRoutes(app: Express): void {
  const uiDir = resolveUiDir();
  const uiAssetsDir = path.join(uiDir, 'assets');

  app.use('/assets', express.static(uiAssetsDir));
  app.use('/ui', express.static(uiDir));
  app.get('/ui/*', (_request: Request, response: Response) => {
    response.sendFile(path.join(uiDir, 'index.html'));
  });
}
