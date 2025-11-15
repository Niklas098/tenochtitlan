import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

function placementsApiPlugin() {
    const dataPath = path.resolve(process.cwd(), 'public/data/placements.json');

    const ensureFile = () => {
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(path.dirname(dataPath), { recursive: true });
            fs.writeFileSync(dataPath, '{}', 'utf-8');
        }
    };

    const handler = (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/placements')) {
            return next();
        }

        ensureFile();

        if (req.method === 'GET') {
            fs.promises.readFile(dataPath, 'utf-8')
                .then((content) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(content || '{}');
                })
                .catch((err) => {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: err.message }));
                });
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                try {
                    const parsed = body.trim().length ? JSON.parse(body) : {};
                    const serialized = JSON.stringify(parsed, null, 2);
                    fs.promises.writeFile(dataPath, serialized, 'utf-8')
                        .then(() => {
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ ok: true }));
                        })
                        .catch((err) => {
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: err.message }));
                        });
                } catch (err) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
                }
            });
            return;
        }

        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    };

    return {
        name: 'placements-api',
        configureServer(server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer(server) {
            server.middlewares.use(handler);
        }
    };
}

export default defineConfig({
    server: { port:5173 },
    plugins: [placementsApiPlugin()],
    optimizeDeps: {
        include: ["three", "three/examples/jsm/controls/OrbitControls"]
    }
});
