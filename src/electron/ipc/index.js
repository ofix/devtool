import Singleton from "../service/Singleton.js";
import LoggerHandler from './handler-logger.js';
import WindowHandler from './handler-window.js';
import SFTPHandler from './handler-sftp.js';
import MMFHandler from './handler-mmf.js';
import HTTPHandler from './handler-http.js';
import ScreenshotHandler from './handler-screenshot.js';
import PinImageHandler from './handler-pin-image.js';
import VideoRecordHandler from './handler-video-record.js';
import ColorPickerHandler from './handler-color-picker.js';
import RulerHandler from './handler-ruler.js';
import FileCompareHandler from './handler-file-compare.js';
import StockHandler from './handler-mini-stock.js';
import SystemHandler from './handler-system.js';
import AntSyncHandler from "./handler-ant-sync.js";

class IPCManager extends Singleton {
    constructor() {
        super();
        // 所有 handler 会在构造函数中自动注册
        this.logger = LoggerHandler;
        this.window = WindowHandler;
        this.sftp = SFTPHandler;
        this.mmf = MMFHandler;
        this.http = HTTPHandler;
        this.screenshot = ScreenshotHandler;
        this.pinImage = PinImageHandler;
        this.videoRecord = VideoRecordHandler;
        this.colorPicker = ColorPickerHandler;
        this.ruler = RulerHandler;
        this.fileCompare = FileCompareHandler;
        this.stock = StockHandler;
        this.system = SystemHandler;
        this.antSync = AntSyncHandler;

        console.log('所有 IPC 处理器已注册完成');
    }

    // 清理所有资源（在应用退出时调用）
    cleanup() {
        if (this.shortcut && this.shortcut.unregisterAll) {
            this.shortcut.unregisterAll();
        }
        if (this.mmf && this.mmf.clear) {
            this.mmf.clear();
        }
        console.log('IPC 资源已清理');
    }
}

export default IPCManager;