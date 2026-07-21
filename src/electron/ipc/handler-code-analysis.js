import { ipcMain } from 'electron';
import CodeProjectParser from '../service/code-visual/parser/CodeProjectParser';

class CodeAnalysis {
    constructor() {
        this.registerHandlers();
        this.parser = new CodeProjectParser();
    }

    registerHandlers() {
        ipcMain.handle('ca:parseCodeFile', async (event, filePath) => {
            try {
                const cResult = await this.parser.parseFile(filePath);
                return cResult;
            } catch (error) {
                return { success: false, error: error.message };
            }
        });


    }
}

export default new CodeAnalysis();