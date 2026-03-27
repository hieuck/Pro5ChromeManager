import express, { Express, Request, Response } from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { loggerService } from '../../logging/LoggerService';

function resolveUiDir(): string {
  const packagedUiDir = path.join(__dirname, '../../../../ui');
  const devUiDir = path.resolve(process.cwd(), 'dist/ui');
  return packagedUiDir.includes('app.asar') ? packagedUiDir : devUiDir;
}

export function registerUiRoutes(app: Express): void {
  const uiDir = resolveUiDir();
  const uiAssetsDir = path.join(uiDir, 'assets');
  const uiIndexPath = path.join(uiDir, 'index.html');

  app.use('/assets', express.static(uiAssetsDir));
  app.use('/ui', express.static(uiDir));
  app.get('/ui/*', (_request: Request, response: Response) => {
    if (existsSync(uiIndexPath)) {
      response.sendFile(uiIndexPath);
      return;
    }

    loggerService.warn('UI index.html missing, serving fallback shell', { uiIndexPath });
    response.status(200).contentType('text/html').send(`<!doctype html><html><body><div id="root"></div></body></html>`);
  });
}
