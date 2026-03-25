import ImageProcessor from './ImageProcessor.js';
export default class VideoProcessor extends ImageProcessor {
    _generateFilename(url, title, index) {
        let filename = url.split('/').pop().split('?')[0];
        if (!filename || filename.length < 3) filename = `video_${Date.now()}.mp4`;
        if (!filename.endsWith('.mp4') && !filename.endsWith('.webm')) filename += '.mp4';
        if (title) {
            const clean = title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50);
            filename = `${clean}_${filename}`;
        }
        return filename;
    }
}
