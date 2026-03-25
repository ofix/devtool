import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';

export default class M3u8Processor {
    async execute(url, options) {
        const { path: savePath, title } = options;
        const filename = title ? `${title.replace(/[<>:"/\\|?*]/g, '_')}.mp4` : `video_${Date.now()}.mp4`;
        const fullPath = path.join(savePath || './downloads/videos', filename);

        await fs.ensureDir(path.dirname(fullPath));
        if (await fs.pathExists(fullPath)) return { skipped: true, path: fullPath };

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', ['-i', url, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', fullPath]);
            ffmpeg.on('close', (code) => code === 0 ? resolve({ path: fullPath }) : reject(new Error(`ffmpeg exited with ${code}`)));
            ffmpeg.on('error', reject);
        });
    }
}
