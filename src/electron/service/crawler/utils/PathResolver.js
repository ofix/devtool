import path from 'path';

export default class PathResolver {
    constructor(workDir = process.cwd()) {
        this.workDir = workDir;
    }
    
    resolve(inputPath) {
        if (!inputPath) return this.workDir;
        
        if (inputPath.startsWith('~/')) {
            const home = process.env.HOME || process.env.USERPROFILE;
            return inputPath.replace(/^~/, home);
        }
        
        if (path.isAbsolute(inputPath)) {
            return inputPath;
        }
        
        return path.resolve(this.workDir, inputPath);
    }
    
    resolveAbsolute(inputPath) {
        return this.resolve(inputPath);
    }
    
    join(...segments) {
        return path.join(...segments);
    }
}
